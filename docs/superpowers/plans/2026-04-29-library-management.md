# Library Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone physical-book library with browseable catalog, per-copy tracking, member self-checkout, librarian walk-up checkout, 30-day default loans with extension-request approval, per-book wait list with auto-notify, and a Vercel daily cron for overdue reminders.

**Architecture:** Six new tables + new `librarian` profile role + `book-covers` Supabase Storage bucket. Critical state transitions (self-checkout, return, extension decision, wait-list notification) go through SECURITY DEFINER RPCs to enforce atomicity. Status on `library_book_copies` is stored (not derived) because copies can also be `lost` or `retired`. Cron job runs daily at 09:00 UTC and writes overdue notifications, throttled per loan via `last_reminder_at`.

**Tech Stack:** Next.js 16.2.4 App Router (`params` is `Promise<{}>`), Supabase JS v2 SSR, Vitest, Tailwind CSS, Lucide icons, Canvas API for image compression, `useOptimistic` for mutations, Vercel Cron Jobs.

**Dependencies:** Plan C (`notifications` table) must merge before this plan. The cron and the lifecycle RPCs all write to `notifications`.

**Migration numbering:** Uses `0010_librarian_role.sql` and `0011_library.sql`. If other plans claim these slots first, renumber sequentially when merging — order is what matters: librarian-role first, library tables second.

---

## File Map

**Created:**
- `supabase/migrations/0010_librarian_role.sql` — adds `librarian` to `profile_role` enum
- `supabase/migrations/0011_library.sql` — all library schema, RLS, RPCs, bucket
- `src/lib/library.ts` — pure helpers
- `tests/unit/library.test.ts`
- `src/components/library/CoverUpload.tsx`
- `src/components/library/BookCard.tsx`
- `src/app/(app)/library/page.tsx` — catalog
- `src/app/(app)/library/[book_id]/page.tsx` — book detail
- `src/app/(app)/library/[book_id]/actions.ts`
- `src/app/(app)/library/me/page.tsx`
- `src/app/(app)/library/me/MyLoansList.tsx`
- `src/app/(app)/library/me/actions.ts`
- `src/app/(app)/library/manage/page.tsx` — dashboard
- `src/app/(app)/library/manage/DashboardClient.tsx`
- `src/app/(app)/library/manage/actions.ts`
- `src/app/(app)/library/manage/books/page.tsx`
- `src/app/(app)/library/manage/books/CatalogManager.tsx`
- `src/app/(app)/library/manage/books/actions.ts`
- `src/app/(app)/library/manage/books/new/page.tsx`
- `src/app/(app)/library/manage/books/new/NewBookForm.tsx`
- `src/app/(app)/library/manage/books/new/actions.ts`
- `src/app/(app)/library/manage/books/[id]/page.tsx`
- `src/app/(app)/library/manage/books/[id]/EditBookForm.tsx`
- `src/app/(app)/library/manage/books/[id]/CopiesEditor.tsx`
- `src/app/(app)/library/manage/books/[id]/actions.ts`
- `src/app/(app)/library/manage/checkout/page.tsx`
- `src/app/(app)/library/manage/checkout/CheckoutForm.tsx`
- `src/app/(app)/library/manage/checkout/actions.ts`
- `src/app/api/cron/library-reminders/route.ts`
- `vercel.ts`

**Modified:**
- `src/types/database.ts` — 6 tables + 3 enums + RPC types + role widening
- `src/lib/auth.ts` — role union widened, `requireLibrarianOrAdmin`
- `src/components/layout/Sidebar.tsx` — Library + Manage Library nav items
- `src/components/layout/BottomTabs.tsx` — Library tab
- `src/app/(app)/notifications/NotificationsList.tsx` — 4 new notification types

---

### Task 1: Add librarian role (separate migration)

**Files:**
- Create: `supabase/migrations/0010_librarian_role.sql`

- [ ] **Step 1: Write the role-enum migration**

```sql
-- supabase/migrations/0010_librarian_role.sql
-- Plan E: Library Management — add librarian profile role.
-- Must be a standalone migration: PostgreSQL does not allow new enum values
-- to be referenced in the same transaction in which they were added.

ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'librarian';
```

- [ ] **Step 2: Apply**

```bash
supabase db push
```

Expected: applies cleanly.

- [ ] **Step 3: Verify the value is present**

```bash
supabase db execute --sql "SELECT unnest(enum_range(NULL::profile_role));"
```

Expected: 4 rows including `librarian`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_librarian_role.sql
git commit -m "feat: add librarian to profile_role enum"
```

---

### Task 2: Library schema migration

**Files:**
- Create: `supabase/migrations/0011_library.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0011_library.sql
-- Plan E: Library Management — tables, RLS, RPCs, bucket.

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE library_condition         AS ENUM ('good', 'damaged', 'poor');
CREATE TYPE library_copy_status       AS ENUM ('available', 'checked_out', 'lost', 'retired');
CREATE TYPE library_extension_status  AS ENUM ('pending', 'approved', 'rejected');

-- ── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_librarian_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND role IN ('admin', 'librarian')
  );
$$;

-- ── library_categories ──────────────────────────────────────────────────────

CREATE TABLE library_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  color      text        NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── library_books ───────────────────────────────────────────────────────────

CREATE TABLE library_books (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  author          text        NOT NULL,
  isbn            text,
  publisher       text,
  year_published  int,
  description     text,
  cover_url       text,
  category_id     uuid        NOT NULL REFERENCES library_categories(id) ON DELETE RESTRICT,
  tags            text[]      NOT NULL DEFAULT '{}',
  created_by      uuid        NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_library_books_category ON library_books (category_id);
CREATE INDEX idx_library_books_tags ON library_books USING GIN (tags);
CREATE INDEX idx_library_books_title_lower ON library_books (lower(title));
CREATE INDEX idx_library_books_author_lower ON library_books (lower(author));

-- ── library_book_copies ─────────────────────────────────────────────────────

CREATE TABLE library_book_copies (
  id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id         uuid                  NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  copy_number     int                   NOT NULL,
  condition       library_condition     NOT NULL DEFAULT 'good',
  condition_notes text,
  status          library_copy_status   NOT NULL DEFAULT 'available',
  location        text,
  created_at      timestamptz           NOT NULL DEFAULT now(),
  UNIQUE (book_id, copy_number)
);

CREATE INDEX idx_library_copies_book ON library_book_copies (book_id, status);

-- ── library_loans ───────────────────────────────────────────────────────────

CREATE TABLE library_loans (
  id                uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_id           uuid                NOT NULL REFERENCES library_book_copies(id) ON DELETE RESTRICT,
  borrower_id       uuid                NOT NULL REFERENCES profiles(id),
  checked_out_at    timestamptz         NOT NULL DEFAULT now(),
  due_at            timestamptz         NOT NULL,
  returned_at       timestamptz,
  checked_out_by    uuid                NOT NULL REFERENCES profiles(id),
  returned_by       uuid                REFERENCES profiles(id),
  return_condition  library_condition,
  return_notes      text,
  last_reminder_at  timestamptz
);

CREATE INDEX idx_library_loans_borrower ON library_loans (borrower_id, returned_at);
CREATE INDEX idx_library_loans_overdue  ON library_loans (returned_at, due_at)
  WHERE returned_at IS NULL;
CREATE INDEX idx_library_loans_copy_active ON library_loans (copy_id) WHERE returned_at IS NULL;

-- ── library_loan_extensions ─────────────────────────────────────────────────

CREATE TABLE library_loan_extensions (
  id              uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         uuid                       NOT NULL REFERENCES library_loans(id) ON DELETE CASCADE,
  requested_by    uuid                       NOT NULL REFERENCES profiles(id),
  requested_until timestamptz                NOT NULL,
  reason          text,
  status          library_extension_status   NOT NULL DEFAULT 'pending',
  decided_by      uuid                       REFERENCES profiles(id),
  decided_at      timestamptz,
  created_at      timestamptz                NOT NULL DEFAULT now()
);

CREATE INDEX idx_library_extensions_loan   ON library_loan_extensions (loan_id);
CREATE INDEX idx_library_extensions_status ON library_loan_extensions (status, created_at);

-- ── library_reservations ────────────────────────────────────────────────────

CREATE TABLE library_reservations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     uuid        NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, profile_id)
);

CREATE INDEX idx_library_reservations_book_queue
  ON library_reservations (book_id, notified_at, created_at);

-- ── RLS — library_categories ────────────────────────────────────────────────

ALTER TABLE library_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_cat_read"  ON library_categories
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lib_cat_write" ON library_categories
  FOR ALL USING (is_librarian_or_admin());

-- ── RLS — library_books ─────────────────────────────────────────────────────

ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_book_read"  ON library_books
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lib_book_write" ON library_books
  FOR ALL USING (is_librarian_or_admin());

-- ── RLS — library_book_copies ───────────────────────────────────────────────

ALTER TABLE library_book_copies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_copy_read"  ON library_book_copies
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lib_copy_write" ON library_book_copies
  FOR ALL USING (is_librarian_or_admin());

-- ── RLS — library_loans ─────────────────────────────────────────────────────

ALTER TABLE library_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_loan_self_read" ON library_loans
  FOR SELECT USING (borrower_id = auth.uid() OR is_librarian_or_admin());
CREATE POLICY "lib_loan_staff_all" ON library_loans
  FOR ALL USING (is_librarian_or_admin());

-- ── RLS — library_loan_extensions ───────────────────────────────────────────

ALTER TABLE library_loan_extensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_ext_read" ON library_loan_extensions
  FOR SELECT USING (requested_by = auth.uid() OR is_librarian_or_admin());
CREATE POLICY "lib_ext_staff_all" ON library_loan_extensions
  FOR ALL USING (is_librarian_or_admin());
-- INSERT for members goes through SECURITY DEFINER RPC `request_extension`.

-- ── RLS — library_reservations ──────────────────────────────────────────────

ALTER TABLE library_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_res_read" ON library_reservations
  FOR SELECT USING (profile_id = auth.uid() OR is_librarian_or_admin());
CREATE POLICY "lib_res_self_insert" ON library_reservations
  FOR INSERT WITH CHECK (profile_id = auth.uid() OR is_librarian_or_admin());
CREATE POLICY "lib_res_self_delete" ON library_reservations
  FOR DELETE USING (profile_id = auth.uid() OR is_librarian_or_admin());

-- ── Storage: book-covers ────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "book_covers_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'book-covers');

CREATE POLICY "book_covers_staff_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'book-covers' AND auth.uid() IS NOT NULL AND is_librarian_or_admin()
  );

CREATE POLICY "book_covers_staff_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'book-covers' AND is_librarian_or_admin());

CREATE POLICY "book_covers_staff_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'book-covers' AND is_librarian_or_admin());

-- ── notifications: allow library staff to insert reminder rows ──────────────
-- (notifications table comes from Plan C; this adds an INSERT policy so the
-- librarian dashboard's "Send reminder now" button can write directly without
-- going through an RPC. The cron uses the service role key and bypasses RLS.)

CREATE POLICY "notif_insert_library_staff" ON notifications
  FOR INSERT WITH CHECK (is_librarian_or_admin());

-- ── RPC: self_checkout ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION self_checkout(p_book_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_copy_id uuid;
  v_loan_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Block if user already has an active loan on any copy of this book
  IF EXISTS (
    SELECT 1 FROM library_loans l
    JOIN library_book_copies c ON c.id = l.copy_id
    WHERE l.borrower_id = v_user_id
      AND l.returned_at IS NULL
      AND c.book_id = p_book_id
  ) THEN
    RAISE EXCEPTION 'already_borrowed';
  END IF;

  -- Pick the lowest-numbered available copy and lock it
  SELECT id INTO v_copy_id
    FROM library_book_copies
   WHERE book_id = p_book_id AND status = 'available'
   ORDER BY copy_number
   FOR UPDATE
   LIMIT 1;

  IF v_copy_id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;

  -- Create the loan with 30-day default
  INSERT INTO library_loans (
    copy_id, borrower_id, checked_out_at, due_at, checked_out_by
  ) VALUES (
    v_copy_id, v_user_id, now(), now() + INTERVAL '30 days', v_user_id
  )
  RETURNING id INTO v_loan_id;

  UPDATE library_book_copies SET status = 'checked_out' WHERE id = v_copy_id;

  RETURN v_loan_id;
END;
$$;

-- ── RPC: walk_up_checkout ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION walk_up_checkout(
  p_borrower_id uuid,
  p_copy_id uuid,
  p_due_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_status    library_copy_status;
  v_loan_id   uuid;
BEGIN
  IF NOT is_librarian_or_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT status INTO v_status FROM library_book_copies WHERE id = p_copy_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'copy_not_found'; END IF;
  IF v_status <> 'available' THEN RAISE EXCEPTION 'unavailable'; END IF;

  INSERT INTO library_loans (
    copy_id, borrower_id, checked_out_at, due_at, checked_out_by
  ) VALUES (
    p_copy_id, p_borrower_id, now(), p_due_at, v_caller_id
  )
  RETURNING id INTO v_loan_id;

  UPDATE library_book_copies SET status = 'checked_out' WHERE id = p_copy_id;

  RETURN v_loan_id;
END;
$$;

-- ── RPC: notify_next_reservation ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_next_reservation(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_res_id     uuid;
  v_profile_id uuid;
  v_title      text;
BEGIN
  SELECT id, profile_id INTO v_res_id, v_profile_id
    FROM library_reservations
   WHERE book_id = p_book_id AND notified_at IS NULL
   ORDER BY created_at
   LIMIT 1;

  IF v_res_id IS NULL THEN RETURN; END IF;

  SELECT title INTO v_title FROM library_books WHERE id = p_book_id;

  INSERT INTO notifications (recipient_id, type, payload)
  VALUES (
    v_profile_id,
    'library_book_available',
    jsonb_build_object('book_id', p_book_id, 'book_title', v_title, 'reservation_id', v_res_id)
  );

  UPDATE library_reservations SET notified_at = now() WHERE id = v_res_id;
END;
$$;

-- ── RPC: return_loan ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION return_loan(
  p_loan_id   uuid,
  p_condition library_condition,
  p_notes     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_copy_id   uuid;
  v_book_id   uuid;
BEGIN
  IF NOT is_librarian_or_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT copy_id INTO v_copy_id FROM library_loans WHERE id = p_loan_id FOR UPDATE;
  IF v_copy_id IS NULL THEN RAISE EXCEPTION 'loan_not_found'; END IF;

  UPDATE library_loans
     SET returned_at = now(),
         returned_by = v_caller_id,
         return_condition = p_condition,
         return_notes = p_notes
   WHERE id = p_loan_id;

  UPDATE library_book_copies
     SET status = 'available',
         condition = COALESCE(p_condition, condition)
   WHERE id = v_copy_id;

  SELECT book_id INTO v_book_id FROM library_book_copies WHERE id = v_copy_id;
  PERFORM notify_next_reservation(v_book_id);
END;
$$;

-- ── RPC: request_extension ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION request_extension(
  p_loan_id          uuid,
  p_requested_until  timestamptz,
  p_reason           text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_borrower  uuid;
  v_due       timestamptz;
  v_returned  timestamptz;
  v_ext_id    uuid;
  v_book_t    text;
  v_borrower_n text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT borrower_id, due_at, returned_at
    INTO v_borrower, v_due, v_returned
    FROM library_loans WHERE id = p_loan_id;
  IF v_borrower IS NULL THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF v_borrower <> v_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_returned IS NOT NULL THEN RAISE EXCEPTION 'loan_returned'; END IF;
  IF p_requested_until <= v_due THEN RAISE EXCEPTION 'must_be_after_current_due'; END IF;

  INSERT INTO library_loan_extensions (loan_id, requested_by, requested_until, reason)
  VALUES (p_loan_id, v_user_id, p_requested_until, p_reason)
  RETURNING id INTO v_ext_id;

  -- Notify librarians + admins
  SELECT b.title, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO v_book_t, v_borrower_n
    FROM library_loans l
    JOIN library_book_copies c ON c.id = l.copy_id
    JOIN library_books b ON b.id = c.book_id
    JOIN profiles p ON p.id = l.borrower_id
   WHERE l.id = p_loan_id;

  INSERT INTO notifications (recipient_id, type, payload)
  SELECT DISTINCT p.id,
                  'library_extension_requested',
                  jsonb_build_object(
                    'extension_id',     v_ext_id,
                    'loan_id',          p_loan_id,
                    'book_title',       v_book_t,
                    'borrower_name',    v_borrower_n,
                    'requested_until',  p_requested_until,
                    'reason',           p_reason
                  )
    FROM profiles p
   WHERE p.role IN ('admin', 'librarian');

  RETURN v_ext_id;
END;
$$;

-- ── RPC: decide_extension ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decide_extension(
  p_extension_id uuid,
  p_decision     library_extension_status,
  p_reason       text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_id  uuid := auth.uid();
  v_loan_id    uuid;
  v_borrower   uuid;
  v_until      timestamptz;
  v_book_t     text;
BEGIN
  IF NOT is_librarian_or_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid_decision'; END IF;

  SELECT loan_id, requested_until INTO v_loan_id, v_until
    FROM library_loan_extensions WHERE id = p_extension_id FOR UPDATE;
  IF v_loan_id IS NULL THEN RAISE EXCEPTION 'extension_not_found'; END IF;

  UPDATE library_loan_extensions
     SET status = p_decision,
         decided_by = v_caller_id,
         decided_at = now(),
         reason = COALESCE(p_reason, reason)
   WHERE id = p_extension_id;

  IF p_decision = 'approved' THEN
    UPDATE library_loans SET due_at = v_until WHERE id = v_loan_id;
  END IF;

  SELECT l.borrower_id, b.title INTO v_borrower, v_book_t
    FROM library_loans l
    JOIN library_book_copies c ON c.id = l.copy_id
    JOIN library_books b ON b.id = c.book_id
   WHERE l.id = v_loan_id;

  INSERT INTO notifications (recipient_id, type, payload)
  VALUES (
    v_borrower,
    'library_extension_decision',
    jsonb_build_object(
      'extension_id', p_extension_id,
      'loan_id',      v_loan_id,
      'book_title',   v_book_t,
      'decision',     p_decision::text,
      'reason',       p_reason
    )
  );
END;
$$;
```

- [ ] **Step 2: Apply**

```bash
supabase db push
```

Expected: applies cleanly. Storage policies may need manual application via the dashboard if local Supabase rejects them.

- [ ] **Step 3: Verify tables and RPCs exist**

```bash
supabase db execute --sql "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'library_%' ORDER BY table_name;"
supabase db execute --sql "SELECT routine_name FROM information_schema.routines WHERE routine_name IN ('self_checkout','walk_up_checkout','return_loan','request_extension','decide_extension','notify_next_reservation','is_librarian_or_admin');"
```

Expected: 6 tables, 7 routines.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_library.sql
git commit -m "feat: library schema — books, copies, loans, extensions, reservations, RPCs, bucket"
```

---

### Task 3: TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add 6 tables**

Inside `public > Tables`, in alphabetical order, add:

```typescript
      library_book_copies: {
        Row: {
          book_id: string
          condition: Database["public"]["Enums"]["library_condition"]
          condition_notes: string | null
          copy_number: number
          created_at: string
          id: string
          location: string | null
          status: Database["public"]["Enums"]["library_copy_status"]
        }
        Insert: {
          book_id: string
          condition?: Database["public"]["Enums"]["library_condition"]
          condition_notes?: string | null
          copy_number: number
          created_at?: string
          id?: string
          location?: string | null
          status?: Database["public"]["Enums"]["library_copy_status"]
        }
        Update: {
          book_id?: string
          condition?: Database["public"]["Enums"]["library_condition"]
          condition_notes?: string | null
          copy_number?: number
          created_at?: string
          id?: string
          location?: string | null
          status?: Database["public"]["Enums"]["library_copy_status"]
        }
        Relationships: [
          { foreignKeyName: "library_book_copies_book_id_fkey"; columns: ["book_id"]; referencedRelation: "library_books"; referencedColumns: ["id"] }
        ]
      }
      library_books: {
        Row: {
          author: string
          category_id: string
          cover_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          isbn: string | null
          publisher: string | null
          tags: string[]
          title: string
          year_published: number | null
        }
        Insert: {
          author: string
          category_id: string
          cover_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          isbn?: string | null
          publisher?: string | null
          tags?: string[]
          title: string
          year_published?: number | null
        }
        Update: {
          author?: string
          category_id?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          isbn?: string | null
          publisher?: string | null
          tags?: string[]
          title?: string
          year_published?: number | null
        }
        Relationships: [
          { foreignKeyName: "library_books_category_id_fkey"; columns: ["category_id"]; referencedRelation: "library_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "library_books_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      library_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      library_loan_extensions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          loan_id: string
          reason: string | null
          requested_by: string
          requested_until: string
          status: Database["public"]["Enums"]["library_extension_status"]
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          loan_id: string
          reason?: string | null
          requested_by: string
          requested_until: string
          status?: Database["public"]["Enums"]["library_extension_status"]
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          loan_id?: string
          reason?: string | null
          requested_by?: string
          requested_until?: string
          status?: Database["public"]["Enums"]["library_extension_status"]
        }
        Relationships: [
          { foreignKeyName: "library_loan_extensions_loan_id_fkey"; columns: ["loan_id"]; referencedRelation: "library_loans"; referencedColumns: ["id"] },
          { foreignKeyName: "library_loan_extensions_requested_by_fkey"; columns: ["requested_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "library_loan_extensions_decided_by_fkey"; columns: ["decided_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      library_loans: {
        Row: {
          borrower_id: string
          checked_out_at: string
          checked_out_by: string
          copy_id: string
          due_at: string
          id: string
          last_reminder_at: string | null
          return_condition: Database["public"]["Enums"]["library_condition"] | null
          return_notes: string | null
          returned_at: string | null
          returned_by: string | null
        }
        Insert: {
          borrower_id: string
          checked_out_at?: string
          checked_out_by: string
          copy_id: string
          due_at: string
          id?: string
          last_reminder_at?: string | null
          return_condition?: Database["public"]["Enums"]["library_condition"] | null
          return_notes?: string | null
          returned_at?: string | null
          returned_by?: string | null
        }
        Update: {
          borrower_id?: string
          checked_out_at?: string
          checked_out_by?: string
          copy_id?: string
          due_at?: string
          id?: string
          last_reminder_at?: string | null
          return_condition?: Database["public"]["Enums"]["library_condition"] | null
          return_notes?: string | null
          returned_at?: string | null
          returned_by?: string | null
        }
        Relationships: [
          { foreignKeyName: "library_loans_borrower_id_fkey"; columns: ["borrower_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "library_loans_checked_out_by_fkey"; columns: ["checked_out_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "library_loans_copy_id_fkey"; columns: ["copy_id"]; referencedRelation: "library_book_copies"; referencedColumns: ["id"] },
          { foreignKeyName: "library_loans_returned_by_fkey"; columns: ["returned_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      library_reservations: {
        Row: {
          book_id: string
          created_at: string
          id: string
          notified_at: string | null
          profile_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          notified_at?: string | null
          profile_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          notified_at?: string | null
          profile_id?: string
        }
        Relationships: [
          { foreignKeyName: "library_reservations_book_id_fkey"; columns: ["book_id"]; referencedRelation: "library_books"; referencedColumns: ["id"] },
          { foreignKeyName: "library_reservations_profile_id_fkey"; columns: ["profile_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
```

- [ ] **Step 2: Add 3 enums to `public > Enums`**

```typescript
      library_condition: "good" | "damaged" | "poor"
      library_copy_status: "available" | "checked_out" | "lost" | "retired"
      library_extension_status: "pending" | "approved" | "rejected"
```

Also widen the existing `profile_role` enum value union to include `"librarian"`:

Find:
```typescript
profile_role: "admin" | "member" | "logistics"
```
Replace with:
```typescript
profile_role: "admin" | "member" | "logistics" | "librarian"
```

- [ ] **Step 3: Add RPC types to `public > Functions`**

```typescript
      decide_extension: {
        Args: { p_extension_id: string; p_decision: Database["public"]["Enums"]["library_extension_status"]; p_reason: string | null }
        Returns: undefined
      }
      is_librarian_or_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      notify_next_reservation: {
        Args: { p_book_id: string }
        Returns: undefined
      }
      request_extension: {
        Args: { p_loan_id: string; p_requested_until: string; p_reason: string | null }
        Returns: string
      }
      return_loan: {
        Args: { p_loan_id: string; p_condition: Database["public"]["Enums"]["library_condition"] | null; p_notes: string | null }
        Returns: undefined
      }
      self_checkout: {
        Args: { p_book_id: string }
        Returns: string
      }
      walk_up_checkout: {
        Args: { p_borrower_id: string; p_copy_id: string; p_due_at: string }
        Returns: string
      }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add library tables, enums, RPCs to database types"
```

---

### Task 4: Pure helpers + unit tests

**Files:**
- Create: `src/lib/library.ts`
- Create: `tests/unit/library.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/library.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  computeOverdueDays,
  defaultDueDate,
  storagePathFromCoverUrl,
  matchesSearch,
} from "@/lib/library";

describe("computeOverdueDays", () => {
  it("returns 0 if not yet due", () => {
    expect(computeOverdueDays("2026-05-10T00:00:00Z", new Date("2026-05-09T00:00:00Z"))).toBe(0);
  });
  it("returns 0 on the due day", () => {
    expect(computeOverdueDays("2026-05-10T00:00:00Z", new Date("2026-05-10T00:00:00Z"))).toBe(0);
  });
  it("returns positive days when past due", () => {
    expect(computeOverdueDays("2026-05-10T00:00:00Z", new Date("2026-05-13T00:00:00Z"))).toBe(3);
  });
});

describe("defaultDueDate", () => {
  it("returns ISO string 30 days from given moment", () => {
    const start = new Date("2026-05-01T12:00:00Z");
    const got = new Date(defaultDueDate(start));
    const diffMs = got.getTime() - start.getTime();
    expect(Math.round(diffMs / (1000 * 60 * 60 * 24))).toBe(30);
  });
});

describe("storagePathFromCoverUrl", () => {
  const BASE = "https://x.supabase.co/storage/v1/object/public/book-covers/";
  it("extracts the path", () => {
    expect(storagePathFromCoverUrl(`${BASE}books/abc/cover.jpg`)).toBe("books/abc/cover.jpg");
  });
  it("throws for the wrong bucket", () => {
    expect(() =>
      storagePathFromCoverUrl("https://x.supabase.co/storage/v1/object/public/item-photos/x.jpg"),
    ).toThrow();
  });
});

describe("matchesSearch", () => {
  const book = { title: "Mere Christianity", author: "C.S. Lewis", isbn: "9780060652920" };
  it("matches title case-insensitive", () => {
    expect(matchesSearch(book, "mere")).toBe(true);
  });
  it("matches author case-insensitive", () => {
    expect(matchesSearch(book, "lewis")).toBe(true);
  });
  it("matches isbn", () => {
    expect(matchesSearch(book, "9780060")).toBe(true);
  });
  it("returns true on empty query", () => {
    expect(matchesSearch(book, "")).toBe(true);
  });
  it("returns false on no match", () => {
    expect(matchesSearch(book, "tolkien")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/library.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/library'`.

- [ ] **Step 3: Implement `src/lib/library.ts`**

```typescript
const COVER_PREFIX = "/storage/v1/object/public/book-covers/";
const DAY_MS = 1000 * 60 * 60 * 24;

export function computeOverdueDays(dueAtIso: string, now: Date = new Date()): number {
  const due = new Date(dueAtIso).getTime();
  const diff = now.getTime() - due;
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_MS);
}

export function defaultDueDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function storagePathFromCoverUrl(url: string): string {
  const idx = url.indexOf(COVER_PREFIX);
  if (idx === -1) throw new Error(`Not a book-covers URL: ${url}`);
  return url.slice(idx + COVER_PREFIX.length);
}

export function matchesSearch(
  book: { title: string; author: string; isbn?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    book.title.toLowerCase().includes(q) ||
    book.author.toLowerCase().includes(q) ||
    (book.isbn ?? "").toLowerCase().includes(q)
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/library.test.ts
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library.ts tests/unit/library.test.ts
git commit -m "feat: library helpers — computeOverdueDays, defaultDueDate, storagePathFromCoverUrl, matchesSearch"
```

---

### Task 5: Auth helper + role widening

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Widen the `SessionUser.role` union**

Open `src/lib/auth.ts`. Change the `role` field in `SessionUser` from:

```typescript
  role: "admin" | "member" | "logistics";
```

to:

```typescript
  role: "admin" | "member" | "logistics" | "librarian";
```

- [ ] **Step 2: Append `requireLibrarianOrAdmin`**

```typescript
export async function requireLibrarianOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin" || user.role === "librarian") return user;
  redirect("/dashboard");
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors may surface in `Sidebar.tsx`, `BottomTabs.tsx` (their `role` prop unions). Those are addressed in Task 14. For now if errors are confined to those two files, that's expected.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: librarian role + requireLibrarianOrAdmin auth helper"
```

---

### Task 6: CoverUpload component

**Files:**
- Create: `src/components/library/CoverUpload.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2 } from "lucide-react";

type Props = {
  bookId: string;
  initialUrl?: string | null;
  onUpload: (url: string | null) => void;
  maxWidthPx?: number;
  quality?: number;
};

const BUCKET = "book-covers";
const MAX_BYTES = 5 * 1024 * 1024;

async function compressImage(file: File, maxWidthPx: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidthPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}

export function CoverUpload({
  bookId,
  initialUrl = null,
  onUpload,
  maxWidthPx = 1200,
  quality = 0.82,
}: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) { setError("Image only."); return; }
    if (file.size > MAX_BYTES)            { setError("Max 5 MB."); return; }
    setLoading(true);
    try {
      const blob = await compressImage(file, maxWidthPx, quality);
      const path = `books/${bookId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setUrl(data.publicUrl);
      onUpload(data.publicUrl);
    } catch {
      setError("Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  function clear() { setUrl(null); setError(null); onUpload(null); if (inputRef.current) inputRef.current.value = ""; }

  if (url) {
    return (
      <div className="relative inline-block">
        <img src={url} alt="Cover" className="max-h-48 rounded-lg border border-slate-200 object-contain" />
        <button
          type="button" onClick={clear}
          className="absolute -top-2 -right-2 w-5 h-5 bg-slate-700 text-white rounded-full flex items-center justify-center hover:bg-red-600"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button" disabled={loading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0]; if (f) handleFile(f);
        }}
        className={`w-full border-2 border-dashed rounded-lg px-4 py-6 flex flex-col items-center gap-2 ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-slate-400"
        } disabled:opacity-50`}
      >
        {loading ? <Loader2 className="w-6 h-6 text-slate-400 animate-spin" /> : <Upload className="w-6 h-6 text-slate-400" />}
        <span className="text-xs text-slate-500">{loading ? "Uploading…" : "Drop cover image, or click"}</span>
      </button>
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/CoverUpload.tsx
git commit -m "feat: CoverUpload component"
```

---

### Task 7: BookCard component + Catalog page

**Files:**
- Create: `src/components/library/BookCard.tsx`
- Create: `src/app/(app)/library/page.tsx`

- [ ] **Step 1: Create BookCard**

```typescript
"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

type Props = {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  category: { name: string; color: string } | null;
  available_count: number;
  total_count: number;
};

export function BookCard(p: Props) {
  return (
    <Link
      href={`/library/${p.id}`}
      className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-300 transition-colors"
    >
      <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
        {p.cover_url
          ? <img src={p.cover_url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          : <BookOpen className="w-10 h-10 text-slate-300" />}
      </div>
      <div className="p-3 space-y-1">
        <div className="text-sm font-medium text-slate-900 line-clamp-2">{p.title}</div>
        <div className="text-xs text-slate-500 truncate">{p.author}</div>
        <div className="flex items-center justify-between gap-2 pt-1">
          {p.category && (
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: p.category.color + "20", color: p.category.color }}
            >
              {p.category.name}
            </span>
          )}
          <span className={`text-xs ${p.available_count > 0 ? "text-emerald-600" : "text-slate-400"}`}>
            {p.available_count > 0 ? `${p.available_count}/${p.total_count} in` : "Out"}
          </span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create the catalog page**

Create `src/app/(app)/library/page.tsx`:

```typescript
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookCard } from "@/components/library/BookCard";
import { BookOpen } from "lucide-react";
import Link from "next/link";

type SearchParams = Promise<{ q?: string; cat?: string }>;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const { q = "", cat = "" } = await searchParams;
  const supabase = await createClient();

  const [{ data: categories }, { data: books }, { data: copies }] = await Promise.all([
    supabase.from("library_categories").select("id, name, color").order("name"),
    supabase
      .from("library_books")
      .select("id, title, author, isbn, cover_url, tags, category_id")
      .order("title"),
    supabase
      .from("library_book_copies")
      .select("id, book_id, status"),
  ]);

  const catById = new Map((categories ?? []).map((c) => [c.id, c]));

  const counts = new Map<string, { total: number; available: number }>();
  for (const c of copies ?? []) {
    const cur = counts.get(c.book_id) ?? { total: 0, available: 0 };
    cur.total++;
    if (c.status === "available") cur.available++;
    counts.set(c.book_id, cur);
  }

  const filtered = (books ?? []).filter((b) => {
    if (cat && b.category_id !== cat) return false;
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      b.title.toLowerCase().includes(ql) ||
      b.author.toLowerCase().includes(ql) ||
      (b.isbn ?? "").toLowerCase().includes(ql)
    );
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Library</h1>
        <Link href="/library/me" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          My loans
        </Link>
      </div>

      <form className="flex gap-2 mb-6">
        <input
          type="search" name="q" defaultValue={q} placeholder="Search title, author, ISBN…"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <select
          name="cat" defaultValue={cat}
          className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none"
        >
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="submit" className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          Search
        </button>
      </form>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No books match.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filtered.map((b) => {
            const c = counts.get(b.id) ?? { total: 0, available: 0 };
            const cat = catById.get(b.category_id) ?? null;
            return (
              <BookCard
                key={b.id} id={b.id} title={b.title} author={b.author}
                cover_url={b.cover_url}
                category={cat ? { name: cat.name, color: cat.color } : null}
                available_count={c.available} total_count={c.total}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Test in browser**

```bash
npm run dev
```

Visit `http://localhost:3000/library`. Expected: empty grid with "No books match" (no books seeded yet). No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/library/BookCard.tsx "src/app/(app)/library/page.tsx"
git commit -m "feat: library catalog page with search and filter"
```

---

### Task 8: Book detail page + actions

**Files:**
- Create: `src/app/(app)/library/[book_id]/actions.ts`
- Create: `src/app/(app)/library/[book_id]/page.tsx`

- [ ] **Step 1: Create the actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function pathFor(bookId: string) { return `/library/${bookId}`; }

export async function selfCheckoutAction(bookId: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("self_checkout", { p_book_id: bookId });
  if (error) {
    if (error.message.includes("already_borrowed"))
      return { error: "You already have a copy of this book." };
    if (error.message.includes("unavailable"))
      return { error: "All copies are checked out." };
    return { error: "Could not check out — please try again." };
  }
  revalidatePath(pathFor(bookId));
  revalidatePath("/library");
  revalidatePath("/library/me");
  return {};
}

export async function reserveAction(bookId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("library_reservations")
    .insert({ book_id: bookId, profile_id: user.id });
  if (error) {
    if (error.code === "23505") return { error: "You're already on the wait list." };
    return { error: "Could not reserve." };
  }
  revalidatePath(pathFor(bookId));
  revalidatePath("/library/me");
  return {};
}

export async function cancelMyReservationAction(reservationId: string, bookId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("library_reservations")
    .delete()
    .eq("id", reservationId)
    .eq("profile_id", user.id);
  revalidatePath(pathFor(bookId));
  revalidatePath("/library/me");
}
```

- [ ] **Step 2: Create the detail page**

```typescript
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, ArrowLeft } from "lucide-react";
import { BookActions } from "./BookActions";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ book_id: string }>;
}) {
  const { book_id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("library_books")
    .select("id, title, author, isbn, publisher, year_published, description, cover_url, tags, category_id, library_categories(id, name, color)")
    .eq("id", book_id)
    .single();

  if (!book) notFound();

  const [{ data: copies }, { data: myActiveLoan }, { data: myRes }, { data: queueCount }] = await Promise.all([
    supabase
      .from("library_book_copies")
      .select("id, copy_number, status, condition, location")
      .eq("book_id", book_id)
      .order("copy_number"),
    supabase
      .from("library_loans")
      .select("id, due_at, library_book_copies!inner(book_id)")
      .eq("borrower_id", user.id)
      .is("returned_at", null)
      .eq("library_book_copies.book_id", book_id)
      .maybeSingle(),
    supabase
      .from("library_reservations")
      .select("id, created_at")
      .eq("book_id", book_id)
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("library_reservations")
      .select("id", { count: "exact", head: true })
      .eq("book_id", book_id),
  ]);

  const availableCount = (copies ?? []).filter((c) => c.status === "available").length;
  const cat = (book as any).library_categories;

  return (
    <div className="max-w-3xl">
      <Link href="/library" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Library
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-3">
        <div className="aspect-[3/4] bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
          {book.cover_url
            ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            : <BookOpen className="w-12 h-12 text-slate-300" />}
        </div>

        <div className="sm:col-span-2 space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{book.title}</h1>
            <div className="text-sm text-slate-600">{book.author}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {cat && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: cat.color + "20", color: cat.color }}
              >
                {cat.name}
              </span>
            )}
            {(book.tags ?? []).map((t: string) => (
              <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
          <dl className="text-xs text-slate-500 space-y-1">
            {book.year_published && <div>Year: {book.year_published}</div>}
            {book.publisher && <div>Publisher: {book.publisher}</div>}
            {book.isbn && <div>ISBN: {book.isbn}</div>}
          </dl>
          {book.description && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{book.description}</p>
          )}

          <BookActions
            bookId={book_id}
            availableCount={availableCount}
            myActiveLoan={myActiveLoan ? { id: myActiveLoan.id, due_at: myActiveLoan.due_at } : null}
            myReservation={myRes ? { id: myRes.id } : null}
            queueLength={queueCount?.length ?? 0}
          />

          {(user.role === "admin" || user.role === "librarian") && (
            <Link
              href={`/library/manage/books/${book_id}`}
              className="inline-block text-xs text-indigo-600 hover:text-indigo-800 mt-2"
            >
              Edit book →
            </Link>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Copies</h2>
        <ul className="space-y-2">
          {(copies ?? []).map((c) => (
            <li key={c.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="text-sm text-slate-900">
                Copy #{c.copy_number}
                <span className="text-xs text-slate-500 ml-2">{c.condition}{c.location ? ` · ${c.location}` : ""}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                c.status === "available" ? "bg-emerald-100 text-emerald-700" :
                c.status === "checked_out" ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-500"
              }`}>{c.status.replace("_"," ")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create `BookActions.tsx` (small client component)**

Create `src/app/(app)/library/[book_id]/BookActions.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { selfCheckoutAction, reserveAction, cancelMyReservationAction } from "./actions";

type Props = {
  bookId: string;
  availableCount: number;
  myActiveLoan: { id: string; due_at: string } | null;
  myReservation: { id: string } | null;
  queueLength: number;
};

export function BookActions({ bookId, availableCount, myActiveLoan, myReservation, queueLength }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (myActiveLoan) {
    return (
      <div className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        You have this book until {new Date(myActiveLoan.due_at).toLocaleDateString()}.
      </div>
    );
  }

  if (myReservation) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-slate-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          You're on the wait list ({queueLength} total{queueLength === 1 ? "" : ""}).
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => cancelMyReservationAction(myReservation.id, bookId))}
          className="text-xs text-slate-500 hover:text-red-600"
        >
          Cancel reservation
        </button>
      </div>
    );
  }

  if (availableCount > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await selfCheckoutAction(bookId);
              if (res.error) setError(res.error);
            });
          }}
          className="w-full sm:w-auto text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          Borrow
        </button>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await reserveAction(bookId);
            if (res.error) setError(res.error);
          });
        }}
        className="w-full sm:w-auto text-sm font-medium bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600"
      >
        Reserve (wait list)
      </button>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors in Sidebar/BottomTabs from Task 5 still expected; nothing new in library code.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/library/[book_id]/"
git commit -m "feat: book detail page with self-checkout and reservation"
```

---

### Task 9: My loans page + actions

**Files:**
- Create: `src/app/(app)/library/me/actions.ts`
- Create: `src/app/(app)/library/me/MyLoansList.tsx`
- Create: `src/app/(app)/library/me/page.tsx`

- [ ] **Step 1: Create the actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function requestExtensionAction(
  loanId: string,
  requestedUntilIso: string,
  reason: string | null,
): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_extension", {
    p_loan_id: loanId,
    p_requested_until: requestedUntilIso,
    p_reason: reason,
  });
  if (error) {
    if (error.message.includes("must_be_after_current_due"))
      return { error: "Pick a date after the current due date." };
    if (error.message.includes("loan_returned"))
      return { error: "This loan is already returned." };
    return { error: "Could not submit extension request." };
  }
  revalidatePath("/library/me");
  return {};
}

export async function cancelReservationAction(reservationId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("library_reservations")
    .delete()
    .eq("id", reservationId)
    .eq("profile_id", user.id);
  revalidatePath("/library/me");
}
```

- [ ] **Step 2: Create `MyLoansList.tsx`**

```typescript
"use client";

import { useState, useTransition, useOptimistic } from "react";
import { computeOverdueDays } from "@/lib/library";
import { requestExtensionAction, cancelReservationAction } from "./actions";

type Loan = {
  id: string;
  copy_number: number;
  book_title: string;
  due_at: string;
  pending_extension: { id: string; requested_until: string } | null;
};

type Reservation = {
  id: string;
  book_id: string;
  book_title: string;
  position: number;
  notified_at: string | null;
};

type Props = {
  active: Loan[];
  reservations: Reservation[];
  history: { id: string; book_title: string; copy_number: number; checked_out_at: string; returned_at: string }[];
};

export function MyLoansList({ active, reservations, history }: Props) {
  const [extendOpen, setExtendOpen] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [optimisticRes, removeRes] = useOptimistic(
    reservations,
    (current: Reservation[], removedId: string) => current.filter((r) => r.id !== removedId),
  );

  return (
    <div className="space-y-8">
      {/* ── Active ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Active loans</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">No active loans.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((l) => {
              const overdue = computeOverdueDays(l.due_at);
              return (
                <li key={l.id} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{l.book_title}</div>
                      <div className="text-xs text-slate-500">Copy #{l.copy_number} · Due {new Date(l.due_at).toLocaleDateString()}</div>
                      {overdue > 0 && (
                        <div className="text-xs text-red-600 mt-0.5">{overdue} day{overdue === 1 ? "" : "s"} late</div>
                      )}
                      {l.pending_extension && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          Extension requested until {new Date(l.pending_extension.requested_until).toLocaleDateString()} (pending)
                        </div>
                      )}
                    </div>
                    {!l.pending_extension && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setExtendOpen(extendOpen === l.id ? null : l.id);
                          setUntil("");
                          setReason("");
                        }}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                      >
                        Request extension
                      </button>
                    )}
                  </div>

                  {extendOpen === l.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      <input
                        type="date"
                        min={new Date(new Date(l.due_at).getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)}
                        value={until}
                        onChange={(e) => setUntil(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
                      />
                      <input
                        type="text" placeholder="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!until) { setError("Pick a date."); return; }
                            const iso = new Date(until + "T23:59:59").toISOString();
                            setError(null);
                            startTransition(async () => {
                              const res = await requestExtensionAction(l.id, iso, reason || null);
                              if (res.error) setError(res.error);
                              else setExtendOpen(null);
                            });
                          }}
                          className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
                        >
                          Submit
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtendOpen(null)}
                          className="text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                      {error && <p className="text-xs text-red-500">{error}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Reservations ───────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Reservations</h2>
        {optimisticRes.length === 0 ? (
          <p className="text-sm text-slate-400">No active reservations.</p>
        ) : (
          <ul className="space-y-2">
            {optimisticRes.map((r) => (
              <li key={r.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">{r.book_title}</div>
                  <div className="text-xs text-slate-500">
                    {r.notified_at ? "Ready to pick up — see librarian" : `#${r.position} in queue`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      removeRes(r.id);
                      await cancelReservationAction(r.id);
                    });
                  }}
                  className="text-xs text-slate-500 hover:text-red-600"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── History ────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No past loans.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-slate-500 flex justify-between">
                <span>{h.book_title} · #{h.copy_number}</span>
                <span>{new Date(h.checked_out_at).toLocaleDateString()} → {new Date(h.returned_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

```typescript
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MyLoansList } from "./MyLoansList";

export default async function MyLoansPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: activeRaw }, { data: histRaw }, { data: resRaw }, { data: pendingExt }] = await Promise.all([
    supabase
      .from("library_loans")
      .select(`
        id, due_at,
        library_book_copies ( copy_number, library_books ( title ) )
      `)
      .eq("borrower_id", user.id)
      .is("returned_at", null)
      .order("due_at"),
    supabase
      .from("library_loans")
      .select(`
        id, checked_out_at, returned_at,
        library_book_copies ( copy_number, library_books ( title ) )
      `)
      .eq("borrower_id", user.id)
      .not("returned_at", "is", null)
      .order("returned_at", { ascending: false })
      .limit(20),
    supabase
      .from("library_reservations")
      .select(`
        id, book_id, created_at, notified_at,
        library_books ( title )
      `)
      .eq("profile_id", user.id)
      .order("created_at"),
    supabase
      .from("library_loan_extensions")
      .select("id, loan_id, requested_until, status")
      .eq("requested_by", user.id)
      .eq("status", "pending"),
  ]);

  const extByLoan = new Map(
    (pendingExt ?? []).map((e) => [e.loan_id, { id: e.id, requested_until: e.requested_until }]),
  );

  const active = (activeRaw ?? []).map((r: any) => ({
    id: r.id,
    due_at: r.due_at,
    copy_number: r.library_book_copies?.copy_number ?? 0,
    book_title: r.library_book_copies?.library_books?.title ?? "Unknown",
    pending_extension: extByLoan.get(r.id) ?? null,
  }));

  // Compute reservation queue position via batched fetch (one query per book gets expensive;
  // instead fetch positions inline by counting earlier reservations for each book).
  const reservations = await Promise.all(
    (resRaw ?? []).map(async (r: any) => {
      const { count } = await supabase
        .from("library_reservations")
        .select("id", { count: "exact", head: true })
        .eq("book_id", r.book_id)
        .lte("created_at", r.created_at);
      return {
        id: r.id,
        book_id: r.book_id,
        book_title: r.library_books?.title ?? "Unknown",
        position: count ?? 1,
        notified_at: r.notified_at,
      };
    }),
  );

  const history = (histRaw ?? []).map((r: any) => ({
    id: r.id,
    book_title: r.library_book_copies?.library_books?.title ?? "Unknown",
    copy_number: r.library_book_copies?.copy_number ?? 0,
    checked_out_at: r.checked_out_at,
    returned_at: r.returned_at,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">My library</h1>
      <MyLoansList active={active} reservations={reservations} history={history} />
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: existing Sidebar/BottomTabs errors only.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/library/me/"
git commit -m "feat: my loans page with extension request modal and reservation list"
```

---

### Task 10: Catalog management — categories + books listing

**Files:**
- Create: `src/app/(app)/library/manage/books/actions.ts`
- Create: `src/app/(app)/library/manage/books/CatalogManager.tsx`
- Create: `src/app/(app)/library/manage/books/page.tsx`

- [ ] **Step 1: Create the actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromCoverUrl } from "@/lib/library";

const CATALOG_PATH = "/library/manage/books";

export async function createCategoryAction(formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string)?.trim() || "#6366f1";
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("library_categories").insert({ name, color });
  revalidatePath(CATALOG_PATH);
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string)?.trim() || "#6366f1";
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("library_categories").update({ name, color }).eq("id", id);
  revalidatePath(CATALOG_PATH);
}

export async function deleteCategoryAction(id: string): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();
  const { count } = await supabase
    .from("library_books")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (count && count > 0) return { error: "Category has books — move them first." };
  const { error } = await supabase.from("library_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}

export async function deleteBookAction(id: string): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  // Block if any non-returned loan exists on any copy of this book
  const { count: activeLoans } = await supabase
    .from("library_loans")
    .select("id, library_book_copies!inner(book_id)", { count: "exact", head: true })
    .is("returned_at", null)
    .eq("library_book_copies.book_id", id);
  if (activeLoans && activeLoans > 0) return { error: "Active loans on this book — return them first." };

  // Fetch cover URL to delete from storage
  const { data: book } = await supabase.from("library_books").select("cover_url").eq("id", id).single();

  if (book?.cover_url) {
    try {
      await supabase.storage.from("book-covers").remove([storagePathFromCoverUrl(book.cover_url)]);
    } catch {}
  }

  const { error } = await supabase.from("library_books").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}
```

- [ ] **Step 2: Create the client editor**

```typescript
"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import {
  createCategoryAction, updateCategoryAction, deleteCategoryAction,
  deleteBookAction,
} from "./actions";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

type Category = { id: string; name: string; color: string };
type Book = { id: string; title: string; author: string; category_id: string };

export function CatalogManager({ categories, books }: { categories: Category[]; books: Book[] }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optCats, removeCat] = useOptimistic(
    categories,
    (cur: Category[], id: string) => cur.filter((c) => c.id !== id),
  );
  const [optBooks, removeBook] = useOptimistic(
    books,
    (cur: Book[], id: string) => cur.filter((b) => b.id !== id),
  );

  const booksByCat = new Map<string, Book[]>();
  for (const b of optBooks) {
    const arr = booksByCat.get(b.category_id) ?? [];
    arr.push(b);
    booksByCat.set(b.category_id, arr);
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Categories</h2>
        <div className="space-y-2">
          {optCats.map((c) => (
            <form
              key={c.id}
              action={updateCategoryAction.bind(null, c.id)}
              className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
            >
              <input
                type="color" name="color" defaultValue={c.color}
                className="w-8 h-8 rounded cursor-pointer flex-shrink-0"
                list={`presets-${c.id}`}
              />
              <datalist id={`presets-${c.id}`}>
                {PRESET_COLORS.map((p) => <option key={p} value={p} />)}
              </datalist>
              <input
                type="text" name="name" defaultValue={c.name} required
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
              />
              <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">Save</button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Delete "${c.name}"?`)) return;
                  setError(null);
                  startTransition(async () => {
                    removeCat(c.id);
                    const res = await deleteCategoryAction(c.id);
                    if (res?.error) setError(res.error);
                  });
                }}
                className="text-xs text-red-400 hover:text-red-700 px-2 py-1"
              >
                Delete
              </button>
            </form>
          ))}
        </div>
        <form action={createCategoryAction} className="mt-3 flex items-center gap-2">
          <input
            type="color" name="color" defaultValue="#6366f1"
            className="w-8 h-8 rounded cursor-pointer flex-shrink-0"
          />
          <input
            type="text" name="name" placeholder="New category name" required
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
          />
          <button
            type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700"
          >
            Add category
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Books</h2>
          <Link
            href="/library/manage/books/new"
            className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            + New book
          </Link>
        </div>

        {optCats.length === 0 ? (
          <p className="text-sm text-slate-400">Add a category first.</p>
        ) : (
          <div className="space-y-6">
            {optCats.map((c) => {
              const list = booksByCat.get(c.id) ?? [];
              return (
                <div key={c.id}>
                  <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{c.name}</h3>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400">No books in this category.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((b) => (
                        <li key={b.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
                          <Link href={`/library/manage/books/${b.id}`} className="flex-1 text-sm text-slate-900 hover:text-indigo-600 truncate">
                            {b.title} <span className="text-xs text-slate-500">— {b.author}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm(`Delete "${b.title}"?`)) return;
                              setError(null);
                              startTransition(async () => {
                                removeBook(b.id);
                                const res = await deleteBookAction(b.id);
                                if (res?.error) setError(res.error);
                              });
                            }}
                            className="text-xs text-red-400 hover:text-red-700 px-2"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

```typescript
import Link from "next/link";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CatalogManager } from "./CatalogManager";

export default async function ManageBooksPage() {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const [{ data: cats }, { data: books }] = await Promise.all([
    supabase.from("library_categories").select("id, name, color").order("name"),
    supabase.from("library_books").select("id, title, author, category_id").order("title"),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/library/manage" className="text-sm text-slate-500 hover:text-slate-900">← Library admin</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Catalog</h1>
      <CatalogManager categories={cats ?? []} books={books ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/library/manage/books/page.tsx" "src/app/(app)/library/manage/books/CatalogManager.tsx" "src/app/(app)/library/manage/books/actions.ts"
git commit -m "feat: catalog management — categories + books listing"
```

---

### Task 11: New book form + create action

**Files:**
- Create: `src/app/(app)/library/manage/books/new/actions.ts`
- Create: `src/app/(app)/library/manage/books/new/NewBookForm.tsx`
- Create: `src/app/(app)/library/manage/books/new/page.tsx`

- [ ] **Step 1: Create the action**

```typescript
"use server";

import { redirect } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createBookAction(formData: FormData): Promise<void> {
  const user = await requireLibrarianOrAdmin();

  const title = (formData.get("title") as string)?.trim();
  const author = (formData.get("author") as string)?.trim();
  const isbn = (formData.get("isbn") as string)?.trim() || null;
  const publisher = (formData.get("publisher") as string)?.trim() || null;
  const yearRaw = (formData.get("year_published") as string)?.trim();
  const year = yearRaw ? parseInt(yearRaw, 10) : null;
  const description = (formData.get("description") as string)?.trim() || null;
  const categoryId = (formData.get("category_id") as string)?.trim();
  const tagsRaw = (formData.get("tags") as string)?.trim() ?? "";
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const coverUrl = (formData.get("cover_url") as string)?.trim() || null;

  const condition = (formData.get("condition") as "good" | "damaged" | "poor") ?? "good";
  const location = (formData.get("location") as string)?.trim() || null;

  if (!title || !author || !categoryId) return;

  const supabase = await createClient();

  const { data: book, error } = await supabase
    .from("library_books")
    .insert({
      title, author, isbn, publisher,
      year_published: year && !isNaN(year) ? year : null,
      description, category_id: categoryId, tags,
      cover_url: coverUrl, created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !book) return;

  await supabase.from("library_book_copies").insert({
    book_id: book.id, copy_number: 1, condition, location,
  });

  redirect(`/library/manage/books/${book.id}`);
}
```

- [ ] **Step 2: Create the client form**

```typescript
"use client";

import { useState } from "react";
import { CoverUpload } from "@/components/library/CoverUpload";
import { createBookAction } from "./actions";

type Category = { id: string; name: string };

export function NewBookForm({ categories }: { categories: Category[] }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  // crypto.randomUUID is used pre-create as a temp dir name in the bucket.
  // Once the book is created, future uploads will use the real book id.
  const tempBookId = useState(() => crypto.randomUUID())[0];

  return (
    <form
      action={async (formData) => {
        if (coverUrl) formData.set("cover_url", coverUrl);
        await createBookAction(formData);
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Title</label>
          <input type="text" name="title" required autoFocus className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Author</label>
          <input type="text" name="author" required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">ISBN (optional)</label>
          <input type="text" name="isbn" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Year (optional)</label>
          <input type="number" name="year_published" min="1" max="2100" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Publisher (optional)</label>
          <input type="text" name="publisher" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Description (optional)</label>
          <textarea name="description" rows={3} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Tags (comma-separated)</label>
          <input type="text" name="tags" placeholder="e.g. theology, history" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Cover (optional)</label>
        <CoverUpload bookId={tempBookId} onUpload={setCoverUrl} />
      </div>

      <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">First copy condition</label>
          <select name="condition" defaultValue="good" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
            <option value="good">Good</option>
            <option value="damaged">Damaged</option>
            <option value="poor">Poor</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Location (optional)</label>
          <input type="text" name="location" placeholder="e.g. Shelf A3" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
      </div>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
        Add book
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create the page**

```typescript
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewBookForm } from "./NewBookForm";

export default async function NewBookPage() {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const { data: cats } = await supabase
    .from("library_categories")
    .select("id, name")
    .order("name");

  if (!cats || cats.length === 0) redirect("/library/manage/books");

  return (
    <div className="max-w-md">
      <Link href="/library/manage/books" className="text-sm text-slate-500 hover:text-slate-900">← Catalog</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Add book</h1>
      <NewBookForm categories={cats} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/library/manage/books/new/"
git commit -m "feat: new book form with cover upload + first copy"
```

---

### Task 12: Edit book + copies management

**Files:**
- Create: `src/app/(app)/library/manage/books/[id]/actions.ts`
- Create: `src/app/(app)/library/manage/books/[id]/EditBookForm.tsx`
- Create: `src/app/(app)/library/manage/books/[id]/CopiesEditor.tsx`
- Create: `src/app/(app)/library/manage/books/[id]/page.tsx`

- [ ] **Step 1: Create the actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromCoverUrl } from "@/lib/library";

function pathFor(id: string) { return `/library/manage/books/${id}`; }

export async function updateBookAction(id: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();

  const title = (formData.get("title") as string)?.trim();
  const author = (formData.get("author") as string)?.trim();
  const isbn = (formData.get("isbn") as string)?.trim() || null;
  const publisher = (formData.get("publisher") as string)?.trim() || null;
  const yearRaw = (formData.get("year_published") as string)?.trim();
  const year = yearRaw ? parseInt(yearRaw, 10) : null;
  const description = (formData.get("description") as string)?.trim() || null;
  const categoryId = (formData.get("category_id") as string)?.trim();
  const tagsRaw = (formData.get("tags") as string)?.trim() ?? "";
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const newCoverUrl = (formData.get("cover_url") as string)?.trim() || null;
  const oldCoverUrl = (formData.get("old_cover_url") as string)?.trim() || null;

  if (!title || !author || !categoryId) return;

  const supabase = await createClient();

  // Cleanup old cover if replaced
  if (oldCoverUrl && oldCoverUrl !== newCoverUrl) {
    try {
      await supabase.storage.from("book-covers").remove([storagePathFromCoverUrl(oldCoverUrl)]);
    } catch {}
  }

  await supabase
    .from("library_books")
    .update({
      title, author, isbn, publisher,
      year_published: year && !isNaN(year) ? year : null,
      description, category_id: categoryId, tags, cover_url: newCoverUrl,
    })
    .eq("id", id);

  revalidatePath(pathFor(id));
  revalidatePath(`/library/${id}`);
  revalidatePath("/library/manage/books");
}

export async function addCopyAction(bookId: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const condition = (formData.get("condition") as "good" | "damaged" | "poor") ?? "good";
  const location = (formData.get("location") as string)?.trim() || null;

  const supabase = await createClient();
  const { data: max } = await supabase
    .from("library_book_copies")
    .select("copy_number")
    .eq("book_id", bookId)
    .order("copy_number", { ascending: false })
    .limit(1);
  const next = max && max.length > 0 ? max[0].copy_number + 1 : 1;

  await supabase.from("library_book_copies").insert({
    book_id: bookId, copy_number: next, condition, location,
  });
  revalidatePath(pathFor(bookId));
}

export async function updateCopyAction(copyId: string, bookId: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const condition = (formData.get("condition") as "good" | "damaged" | "poor");
  const conditionNotes = (formData.get("condition_notes") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const status = (formData.get("status") as "available" | "checked_out" | "lost" | "retired");

  const supabase = await createClient();
  await supabase
    .from("library_book_copies")
    .update({ condition, condition_notes: conditionNotes, location, status })
    .eq("id", copyId);
  revalidatePath(pathFor(bookId));
}

export async function deleteCopyAction(copyId: string, bookId: string): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("library_loans")
    .select("id", { count: "exact", head: true })
    .eq("copy_id", copyId)
    .is("returned_at", null);
  if (count && count > 0) return { error: "Copy has an active loan." };

  const { error } = await supabase.from("library_book_copies").delete().eq("id", copyId);
  if (error) return { error: error.message };
  revalidatePath(pathFor(bookId));
  return {};
}
```

- [ ] **Step 2: Create `EditBookForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { CoverUpload } from "@/components/library/CoverUpload";
import { updateBookAction } from "./actions";

type Category = { id: string; name: string };

type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  year_published: number | null;
  description: string | null;
  category_id: string;
  tags: string[];
  cover_url: string | null;
};

export function EditBookForm({ book, categories }: { book: Book; categories: Category[] }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(book.cover_url);

  return (
    <form
      action={async (formData) => {
        if (coverUrl !== null) formData.set("cover_url", coverUrl);
        else formData.set("cover_url", "");
        formData.set("old_cover_url", book.cover_url ?? "");
        await updateBookAction(book.id, formData);
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Title</label>
          <input type="text" name="title" defaultValue={book.title} required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Author</label>
          <input type="text" name="author" defaultValue={book.author} required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">ISBN</label>
          <input type="text" name="isbn" defaultValue={book.isbn ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Year</label>
          <input type="number" name="year_published" defaultValue={book.year_published ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Publisher</label>
          <input type="text" name="publisher" defaultValue={book.publisher ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Description</label>
          <textarea name="description" defaultValue={book.description ?? ""} rows={3} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" defaultValue={book.category_id} required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Tags</label>
          <input type="text" name="tags" defaultValue={book.tags.join(", ")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Cover</label>
        <CoverUpload bookId={book.id} initialUrl={book.cover_url} onUpload={setCoverUrl} />
      </div>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
        Save
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `CopiesEditor.tsx`**

```typescript
"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  addCopyAction, updateCopyAction, deleteCopyAction,
} from "./actions";

type Copy = {
  id: string;
  copy_number: number;
  condition: "good" | "damaged" | "poor";
  condition_notes: string | null;
  status: "available" | "checked_out" | "lost" | "retired";
  location: string | null;
};

export function CopiesEditor({ bookId, copies }: { bookId: string; copies: Copy[] }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [opt, removeCopy] = useOptimistic(
    copies,
    (cur: Copy[], id: string) => cur.filter((c) => c.id !== id),
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="space-y-2">
        {opt.map((c) => (
          <form
            key={c.id}
            action={updateCopyAction.bind(null, c.id, bookId)}
            className="bg-white rounded-lg border border-slate-200 p-3 grid grid-cols-12 gap-2 items-center"
          >
            <span className="col-span-1 text-sm font-medium text-slate-700">#{c.copy_number}</span>
            <select name="condition" defaultValue={c.condition} className="col-span-2 text-sm border border-slate-200 rounded px-2 py-1 outline-none">
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="poor">Poor</option>
            </select>
            <select name="status" defaultValue={c.status} className="col-span-3 text-sm border border-slate-200 rounded px-2 py-1 outline-none">
              <option value="available">Available</option>
              <option value="checked_out">Checked out</option>
              <option value="lost">Lost</option>
              <option value="retired">Retired</option>
            </select>
            <input
              type="text" name="location" defaultValue={c.location ?? ""} placeholder="Location"
              className="col-span-3 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <input
              type="text" name="condition_notes" defaultValue={c.condition_notes ?? ""} placeholder="Notes"
              className="col-span-2 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <button type="submit" className="col-span-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm(`Delete copy #${c.copy_number}?`)) return;
                setError(null);
                startTransition(async () => {
                  removeCopy(c.id);
                  const res = await deleteCopyAction(c.id, bookId);
                  if (res?.error) setError(res.error);
                });
              }}
              className="col-span-12 sm:col-auto text-xs text-red-400 hover:text-red-700 sm:hidden"
            >
              Delete
            </button>
          </form>
        ))}
      </div>

      <form action={addCopyAction.bind(null, bookId)} className="bg-white border border-dashed border-slate-300 rounded-lg p-3 grid grid-cols-12 gap-2 items-center">
        <span className="col-span-3 text-xs text-slate-500">Add copy</span>
        <select name="condition" defaultValue="good" className="col-span-3 text-sm border border-slate-200 rounded px-2 py-1 outline-none">
          <option value="good">Good</option>
          <option value="damaged">Damaged</option>
          <option value="poor">Poor</option>
        </select>
        <input
          type="text" name="location" placeholder="Location"
          className="col-span-4 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
        />
        <button type="submit" className="col-span-2 text-xs font-medium bg-indigo-600 text-white rounded px-2 py-1.5 hover:bg-indigo-700">
          Add
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create the page**

```typescript
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditBookForm } from "./EditBookForm";
import { CopiesEditor } from "./CopiesEditor";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const [{ data: book }, { data: cats }, { data: copies }] = await Promise.all([
    supabase
      .from("library_books")
      .select("id, title, author, isbn, publisher, year_published, description, category_id, tags, cover_url")
      .eq("id", id)
      .single(),
    supabase.from("library_categories").select("id, name").order("name"),
    supabase
      .from("library_book_copies")
      .select("id, copy_number, condition, condition_notes, status, location")
      .eq("book_id", id)
      .order("copy_number"),
  ]);

  if (!book) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/library/manage/books" className="text-sm text-slate-500 hover:text-slate-900">← Catalog</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">{book.title}</h1>

      <EditBookForm book={book as any} categories={cats ?? []} />

      <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-3">Copies</h2>
      <CopiesEditor bookId={id} copies={(copies ?? []) as any} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/library/manage/books/[id]/"
git commit -m "feat: edit book + copies management"
```

---

### Task 13: Walk-up checkout

**Files:**
- Create: `src/app/(app)/library/manage/checkout/actions.ts`
- Create: `src/app/(app)/library/manage/checkout/CheckoutForm.tsx`
- Create: `src/app/(app)/library/manage/checkout/page.tsx`

- [ ] **Step 1: Create the action**

```typescript
"use server";

import { redirect } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function walkUpCheckoutAction(formData: FormData): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const borrowerId = formData.get("borrower_id") as string;
  const copyId = formData.get("copy_id") as string;
  const dueAt = formData.get("due_at") as string;

  if (!borrowerId || !copyId || !dueAt) return { error: "Pick borrower, copy, and due date." };

  const dueIso = new Date(dueAt + "T23:59:59").toISOString();

  const supabase = await createClient();
  const { error } = await supabase.rpc("walk_up_checkout", {
    p_borrower_id: borrowerId,
    p_copy_id: copyId,
    p_due_at: dueIso,
  });
  if (error) {
    if (error.message.includes("unavailable")) return { error: "That copy is not available." };
    return { error: "Could not check out — please try again." };
  }
  redirect("/library/manage");
}
```

- [ ] **Step 2: Create the client form**

```typescript
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { walkUpCheckoutAction } from "./actions";

type Profile = { id: string; first_name: string; last_name: string; email: string };
type Book = { id: string; title: string; author: string };
type Copy = { id: string; copy_number: number; status: string };

export function CheckoutForm() {
  const [profileQ, setProfileQ] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [borrower, setBorrower] = useState<Profile | null>(null);

  const [bookQ, setBookQ] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book | null>(null);

  const [copies, setCopies] = useState<Copy[]>([]);
  const [copyId, setCopyId] = useState<string>("");

  const [dueAt, setDueAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const [error, setError] = useState<string | null>(null);

  // Profile typeahead
  useEffect(() => {
    if (profileQ.trim().length < 2) { setProfiles([]); return; }
    const t = setTimeout(async () => {
      const supabase = createClient();
      const q = profileQ.trim();
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      setProfiles((data ?? []) as Profile[]);
    }, 200);
    return () => clearTimeout(t);
  }, [profileQ]);

  // Book typeahead
  useEffect(() => {
    if (bookQ.trim().length < 2) { setBooks([]); return; }
    const t = setTimeout(async () => {
      const supabase = createClient();
      const q = bookQ.trim();
      const { data } = await supabase
        .from("library_books")
        .select("id, title, author")
        .or(`title.ilike.%${q}%,author.ilike.%${q}%`)
        .limit(8);
      setBooks((data ?? []) as Book[]);
    }, 200);
    return () => clearTimeout(t);
  }, [bookQ]);

  // Load copies when book selected
  useEffect(() => {
    if (!book) { setCopies([]); setCopyId(""); return; }
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("library_book_copies")
        .select("id, copy_number, status")
        .eq("book_id", book.id)
        .eq("status", "available")
        .order("copy_number");
      setCopies((data ?? []) as Copy[]);
      setCopyId((data && data[0]?.id) ?? "");
    })();
  }, [book]);

  return (
    <form
      action={async (formData) => {
        if (!borrower || !copyId || !dueAt) { setError("Fill out all fields."); return; }
        formData.set("borrower_id", borrower.id);
        formData.set("copy_id", copyId);
        formData.set("due_at", dueAt);
        const res = await walkUpCheckoutAction(formData);
        if (res?.error) setError(res.error);
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Borrower</label>
        {borrower ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-900 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
              {borrower.first_name} {borrower.last_name} <span className="text-slate-500">({borrower.email})</span>
            </span>
            <button type="button" onClick={() => { setBorrower(null); setProfileQ(""); }} className="text-xs text-slate-500">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text" value={profileQ} onChange={(e) => setProfileQ(e.target.value)}
              placeholder="Search name or email…" autoFocus
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
            />
            {profiles.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { setBorrower(p); setProfileQ(""); setProfiles([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{p.first_name} {p.last_name}</div>
                      <div className="text-xs text-slate-500">{p.email}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Book</label>
        {book ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-900 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
              {book.title} <span className="text-slate-500">— {book.author}</span>
            </span>
            <button type="button" onClick={() => { setBook(null); setBookQ(""); }} className="text-xs text-slate-500">Change</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text" value={bookQ} onChange={(e) => setBookQ(e.target.value)}
              placeholder="Search title or author…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
            />
            {books.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {books.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => { setBook(b); setBookQ(""); setBooks([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{b.title}</div>
                      <div className="text-xs text-slate-500">{b.author}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {book && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Copy</label>
          {copies.length === 0 ? (
            <p className="text-sm text-slate-400">No available copies.</p>
          ) : (
            <select value={copyId} onChange={(e) => setCopyId(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
              {copies.map((c) => <option key={c.id} value={c.id}>Copy #{c.copy_number}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Due date</label>
        <input
          type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="submit"
        disabled={!borrower || !copyId}
        className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Check out
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create the page**

```typescript
import Link from "next/link";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { CheckoutForm } from "./CheckoutForm";

export default async function CheckoutPage() {
  await requireLibrarianOrAdmin();
  return (
    <div className="max-w-md">
      <Link href="/library/manage" className="text-sm text-slate-500 hover:text-slate-900">← Library admin</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Walk-up checkout</h1>
      <CheckoutForm />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/library/manage/checkout/"
git commit -m "feat: walk-up checkout form with typeahead"
```

---

### Task 14: Librarian dashboard

**Files:**
- Create: `src/app/(app)/library/manage/actions.ts`
- Create: `src/app/(app)/library/manage/DashboardClient.tsx`
- Create: `src/app/(app)/library/manage/page.tsx`

- [ ] **Step 1: Create the actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function returnLoanAction(
  loanId: string,
  condition: "good" | "damaged" | "poor" | null,
  notes: string | null,
): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_loan", {
    p_loan_id: loanId,
    p_condition: condition,
    p_notes: notes,
  });
  if (error) return { error: "Could not record return." };
  revalidatePath("/library/manage");
  revalidatePath("/library");
  return {};
}

export async function decideExtensionAction(
  extensionId: string,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_extension", {
    p_extension_id: extensionId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) return { error: "Could not save decision." };
  revalidatePath("/library/manage");
  return {};
}

export async function sendManualReminderAction(loanId: string): Promise<void> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const { data: loan } = await supabase
    .from("library_loans")
    .select(`
      id, due_at, borrower_id,
      library_book_copies ( library_books ( title ) )
    `)
    .eq("id", loanId)
    .single();
  if (!loan) return;

  const due = new Date(loan.due_at);
  const days = Math.max(0, Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24)));

  await supabase.from("notifications").insert({
    recipient_id: loan.borrower_id,
    type: "library_loan_overdue",
    payload: {
      loan_id: loan.id,
      book_title: (loan as any).library_book_copies?.library_books?.title ?? "Unknown",
      due_at: loan.due_at,
      days_overdue: days,
    },
  });

  await supabase
    .from("library_loans")
    .update({ last_reminder_at: new Date().toISOString() })
    .eq("id", loanId);

  revalidatePath("/library/manage");
}
```

Note: `sendManualReminderAction` writes directly to `notifications` rather than going through an RPC. Task 2's migration already adds an INSERT policy on `notifications` (`notif_insert_library_staff`) gated by `is_librarian_or_admin()`, so this works without further changes.

- [ ] **Step 2: Create `DashboardClient.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import {
  returnLoanAction, decideExtensionAction, sendManualReminderAction,
} from "./actions";
import { computeOverdueDays } from "@/lib/library";

type ActiveLoan = {
  id: string;
  borrower_name: string;
  book_title: string;
  copy_number: number;
  due_at: string;
  last_reminder_at: string | null;
};

type Extension = {
  id: string;
  loan_id: string;
  borrower_name: string;
  book_title: string;
  current_due_at: string;
  requested_until: string;
  reason: string | null;
};

type Props = {
  overdue: ActiveLoan[];
  active: ActiveLoan[];
  extensions: Extension[];
};

export function DashboardClient({ overdue, active, extensions }: Props) {
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState<"good" | "damaged" | "poor">("good");
  const [returnNotes, setReturnNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function renderLoan(l: ActiveLoan, isOverdue: boolean) {
    const days = computeOverdueDays(l.due_at);
    return (
      <li key={l.id} className={`bg-white border rounded-xl p-3 ${isOverdue ? "border-red-300" : "border-slate-200"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{l.book_title}</div>
            <div className="text-xs text-slate-500">{l.borrower_name} · Copy #{l.copy_number} · Due {new Date(l.due_at).toLocaleDateString()}</div>
            {isOverdue && (
              <div className="text-xs text-red-600 mt-0.5">
                {days} day{days === 1 ? "" : "s"} late
                {l.last_reminder_at && <> · Last reminded {new Date(l.last_reminder_at).toLocaleDateString()}</>}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {isOverdue && (
              <button
                type="button"
                onClick={() => startTransition(() => sendManualReminderAction(l.id))}
                className="text-xs text-amber-600 hover:text-amber-800"
              >
                Send reminder
              </button>
            )}
            <button
              type="button"
              onClick={() => { setReturnFor(l.id); setReturnCondition("good"); setReturnNotes(""); setError(null); }}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-800"
            >
              Mark returned
            </button>
          </div>
        </div>

        {returnFor === l.id && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <select value={returnCondition} onChange={(e) => setReturnCondition(e.target.value as any)} className="text-sm border border-slate-200 rounded px-2 py-1.5 outline-none">
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="poor">Poor</option>
            </select>
            <input
              type="text" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    const res = await returnLoanAction(l.id, returnCondition, returnNotes || null);
                    if (res?.error) setError(res.error);
                    else setReturnFor(null);
                  });
                }}
                className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setReturnFor(null)}
                className="text-xs text-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold text-red-700 mb-3">Overdue ({overdue.length})</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-slate-400">No overdue loans.</p>
        ) : (
          <ul className="space-y-2">{overdue.map((l) => renderLoan(l, true))}</ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Pending extensions ({extensions.length})</h2>
        {extensions.length === 0 ? (
          <p className="text-sm text-slate-400">No pending extension requests.</p>
        ) : (
          <ul className="space-y-2">
            {extensions.map((e) => (
              <li key={e.id} className="bg-white border border-amber-300 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{e.book_title}</div>
                    <div className="text-xs text-slate-500">
                      {e.borrower_name} · Current: {new Date(e.current_due_at).toLocaleDateString()} → Requested: {new Date(e.requested_until).toLocaleDateString()}
                    </div>
                    {e.reason && <div className="text-xs text-slate-600 mt-1">"{e.reason}"</div>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startTransition(() => decideExtensionAction(e.id, "approved", null))}
                      className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = prompt("Reason for rejection (optional)?") ?? null;
                        startTransition(() => decideExtensionAction(e.id, "rejected", reason || null));
                      }}
                      className="text-xs font-medium border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Active loans ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">No active loans.</p>
        ) : (
          <ul className="space-y-2">{active.map((l) => renderLoan(l, false))}</ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

```typescript
import Link from "next/link";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

export default async function LibraryDashboardPage() {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const [{ data: loansRaw }, { data: extRaw }] = await Promise.all([
    supabase
      .from("library_loans")
      .select(`
        id, due_at, last_reminder_at,
        borrower:borrower_id ( first_name, last_name ),
        library_book_copies ( copy_number, library_books ( title ) )
      `)
      .is("returned_at", null)
      .order("due_at"),
    supabase
      .from("library_loan_extensions")
      .select(`
        id, loan_id, requested_until, reason,
        loan:loan_id ( due_at, library_book_copies ( library_books ( title ) ), borrower:borrower_id ( first_name, last_name ) )
      `)
      .eq("status", "pending")
      .order("created_at"),
  ]);

  const now = Date.now();
  const allLoans = (loansRaw ?? []).map((r: any) => ({
    id: r.id,
    due_at: r.due_at,
    last_reminder_at: r.last_reminder_at,
    borrower_name: `${r.borrower?.first_name ?? ""} ${r.borrower?.last_name ?? ""}`.trim() || "—",
    book_title: r.library_book_copies?.library_books?.title ?? "Unknown",
    copy_number: r.library_book_copies?.copy_number ?? 0,
  }));
  const overdue = allLoans.filter((l) => new Date(l.due_at).getTime() < now);
  const active = allLoans.filter((l) => new Date(l.due_at).getTime() >= now);

  const extensions = (extRaw ?? []).map((e: any) => ({
    id: e.id,
    loan_id: e.loan_id,
    requested_until: e.requested_until,
    reason: e.reason,
    current_due_at: e.loan?.due_at ?? "",
    book_title: e.loan?.library_book_copies?.library_books?.title ?? "Unknown",
    borrower_name: `${e.loan?.borrower?.first_name ?? ""} ${e.loan?.borrower?.last_name ?? ""}`.trim() || "—",
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Library admin</h1>
      <div className="flex gap-3 mb-6 text-sm">
        <Link href="/library/manage/checkout" className="text-indigo-600 hover:text-indigo-800">Walk-up checkout</Link>
        <span className="text-slate-300">·</span>
        <Link href="/library/manage/books" className="text-indigo-600 hover:text-indigo-800">Manage catalog</Link>
      </div>
      <DashboardClient overdue={overdue} active={active} extensions={extensions} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/library/manage/page.tsx" "src/app/(app)/library/manage/DashboardClient.tsx" "src/app/(app)/library/manage/actions.ts"
git commit -m "feat: librarian dashboard — overdue, active loans, extension approvals"
```

---

### Task 15: Cron endpoint + vercel.ts

**Files:**
- Create: `vercel.ts`
- Create: `src/app/api/cron/library-reminders/route.ts`

- [ ] **Step 1: Create `vercel.ts`**

This file replaces a standalone `vercel.json` and is the recommended Vercel project configuration format.

```typescript
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/library-reminders', schedule: '0 9 * * *' },
  ],
};
```

If `@vercel/config` isn't installed yet:

```bash
npm install --save-dev @vercel/config
```

- [ ] **Step 2: Create the cron route**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Use the service-role key to bypass RLS for this scheduled task.
  const supabase = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Find overdue loans not yet reminded today
  const { data: loans, error } = await supabase
    .from("library_loans")
    .select(`
      id, due_at, borrower_id, last_reminder_at,
      library_book_copies ( library_books ( title ) )
    `)
    .is("returned_at", null)
    .lt("due_at", new Date().toISOString())
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${todayIso}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let count = 0;
  const nowIso = new Date().toISOString();

  for (const loan of loans ?? []) {
    const due = new Date(loan.due_at).getTime();
    const days = Math.max(1, Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24)));
    const title = (loan as any).library_book_copies?.library_books?.title ?? "Unknown";

    const { error: insErr } = await supabase.from("notifications").insert({
      recipient_id: loan.borrower_id,
      type: "library_loan_overdue",
      payload: { loan_id: loan.id, book_title: title, due_at: loan.due_at, days_overdue: days },
    });
    if (insErr) continue;

    await supabase
      .from("library_loans")
      .update({ last_reminder_at: nowIso })
      .eq("id", loan.id);

    count++;
  }

  return NextResponse.json({ ok: true, reminders_sent: count });
}
```

- [ ] **Step 3: Add `CRON_SECRET` to local `.env.local` (placeholder)**

```bash
# Generate a random secret for local testing
echo "CRON_SECRET=$(openssl rand -hex 32)" >> .env.local
```

For production: add `CRON_SECRET` (the same generated value) in the Vercel dashboard under Project → Settings → Environment Variables for **Production**, **Preview**, and **Development**. Vercel cron will inject `Authorization: Bearer ${CRON_SECRET}` automatically.

Also confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel envs (it's needed by the cron handler — the existing `.env.local` should already have it for local dev).

- [ ] **Step 4: Smoke-test the cron locally**

```bash
npm run dev
curl -H "Authorization: Bearer $(grep '^CRON_SECRET' .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/library-reminders
```

Expected: `{"ok":true,"reminders_sent":0}` (until you have actual overdue loans).

- [ ] **Step 5: Commit**

```bash
git add vercel.ts src/app/api/cron/library-reminders/route.ts package.json
git commit -m "feat: daily library reminders cron + vercel.ts config"
```

If `package.json` was modified (from `npm install --save-dev @vercel/config`), include it. If not, omit from the add.

---

### Task 16: Nav + NotificationsList extension

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomTabs.tsx`
- Modify: `src/app/(app)/notifications/NotificationsList.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Add `Library`, `BookOpen` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  ClipboardList,
  Boxes,
  Wrench,
  Music,
  UtensilsCrossed,
  FileText,
  Library,
  BookOpen,
} from "lucide-react";
```

Widen the role union in `SidebarProps`:

```typescript
type SidebarProps = {
  firstName: string;
  lastName: string;
  role: "admin" | "member" | "logistics" | "librarian";
};
```

Update the `NavItem` type to include `librarianOrAdmin`:

```typescript
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  staffOnly?: boolean;
  librarianOrAdmin?: boolean;
  indent?: boolean;
};
```

Add the Library nav items:

```typescript
  { href: "/library",         label: "Library",         icon: Library },
  { href: "/library/manage",  label: "Manage library",  icon: BookOpen, librarianOrAdmin: true, indent: true },
```

Update the filter logic in the render:

```typescript
        {NAV_ITEMS.map(({ href, label, icon: Icon, adminOnly, staffOnly, librarianOrAdmin, indent }) => {
          if (adminOnly && role !== "admin") return null;
          if (staffOnly && role !== "admin" && role !== "logistics") return null;
          if (librarianOrAdmin && role !== "admin" && role !== "librarian") return null;
          // ... rest unchanged
```

- [ ] **Step 2: Update BottomTabs.tsx**

Widen the role prop:

```typescript
type BottomTabsProps = {
  role: "admin" | "member" | "logistics" | "librarian";
};
```

Add `Library` to the lucide imports:

```typescript
import { LayoutDashboard, Boxes, Calendar, Settings, Wrench, Music, UtensilsCrossed, FileText, Library, BookOpen } from "lucide-react";
```

Update the `tabs` array:

```typescript
  const tabs = [
    { href: "/dashboard",     label: "Home",        icon: LayoutDashboard },
    { href: "/library",       label: "Library",     icon: Library },
    { href: "/inventory",     label: "Inventory",   icon: Boxes },
    { href: "/schedule",      label: "Schedule",    icon: Calendar },
    { href: "/worship/songs", label: "Songs",       icon: Music },
    { href: "/hospitality",   label: "Hospitality", icon: UtensilsCrossed },
    { href: "/brief",         label: "Brief",       icon: FileText },
    ...(role === "admin"
      ? [{ href: "/admin",            label: "Admin",   icon: Settings }]
      : role === "logistics"
      ? [{ href: "/inventory/manage", label: "Manage",  icon: Wrench }]
      : role === "librarian"
      ? [{ href: "/library/manage",   label: "Manage",  icon: BookOpen }]
      : []),
  ];
```

- [ ] **Step 3: Extend `NotificationsList.tsx`**

In `renderNotification`, add four new branches before the catch-all `return { title: n.type, ... }`:

```typescript
  if (n.type === "library_loan_overdue") {
    const p = n.payload as { loan_id: string; book_title: string; days_overdue: number };
    return {
      title: `"${p.book_title}" is ${p.days_overdue} day${p.days_overdue === 1 ? "" : "s"} overdue`,
      subtitle: "Please return it as soon as possible.",
      href: "/library/me",
    };
  }
  if (n.type === "library_book_available") {
    const p = n.payload as { book_id: string; book_title: string };
    return {
      title: `"${p.book_title}" is available for you`,
      subtitle: "Visit the library to pick it up.",
      href: `/library/${p.book_id}`,
    };
  }
  if (n.type === "library_extension_requested") {
    const p = n.payload as { extension_id: string; loan_id: string; book_title: string; borrower_name: string };
    return {
      title: `${p.borrower_name} requested an extension`,
      subtitle: `For "${p.book_title}"`,
      href: "/library/manage",
    };
  }
  if (n.type === "library_extension_decision") {
    const p = n.payload as { decision: "approved" | "rejected"; book_title: string; reason: string | null };
    return {
      title: `Extension ${p.decision} for "${p.book_title}"`,
      subtitle: p.reason || "",
      href: "/library/me",
    };
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. The Sidebar/BottomTabs role-union mismatch from earlier tasks is now resolved.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/BottomTabs.tsx "src/app/(app)/notifications/NotificationsList.tsx"
git commit -m "feat: add Library nav + 4 new notification types"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run unit tests**

```bash
npx vitest run
```

Expected: all pass — 11 new from `library.test.ts` plus existing.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Smoke-test full flow**

```bash
npm run dev
```

As admin (or after manually setting your profile role to `librarian` in Supabase):

1. `/library/manage/books` — add a category "Theology", then add a book "Mere Christianity" by C.S. Lewis with 2 copies
2. `/library` — see the book card with "2/2 in"
3. `/library/{book_id}` — click "Borrow" → success, redirected back, "1/2 in" shows
4. `/library/me` — see active loan, due in 30 days
5. Check out the second copy too. Now "0/2 in".
6. As a different test member, visit the book → click "Reserve" → "wait list" appears
7. As admin, return one loan → second copy frees → notification fires to reserver
8. As borrower of the still-out loan, request extension → admin sees pending → approves → due_at updates
9. `/library/manage/checkout` — walk-up checkout for another member
10. Trigger cron locally (Step 4 of Task 15) — should mark 0 reminders since no loans are overdue yet (manually adjust a `due_at` to past for testing)

- [ ] **Step 4: Commit any post-integration tweaks**

```bash
git add -p
git commit -m "fix: post-integration tweaks for library"
```
