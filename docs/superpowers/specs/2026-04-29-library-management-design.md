# Library Management — Design Spec

**Goal:** Build a standalone physical-book library with a browseable catalog (categories + tags), per-copy tracking, member self-checkout AND librarian walk-up checkout, a 30-day default loan with extension-request approval flow, a per-book wait list, and daily overdue reminders driven by a Vercel cron job.

**Date:** 2026-04-29

---

## 1. Profile Role Addition

A new `librarian` role is added to the existing `profiles.role` check constraint. Roles become: `admin | member | logistics | librarian`. The `SessionUser.role` TypeScript type updates to match.

A DB helper:
```sql
CREATE FUNCTION is_librarian_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'librarian')
  );
$$;
```

A matching auth helper `requireLibrarianOrAdmin()` mirrors `requireLogisticsOrAdmin()`.

---

## 2. Data Model

### `library_categories`

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | UNIQUE NOT NULL |
| color | text | hex, default `#6366f1` |
| created_at | timestamptz | default now() |

### `library_books`

Catalog entries — one row per title regardless of how many copies exist.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| title | text | NOT NULL |
| author | text | NOT NULL |
| isbn | text | nullable |
| publisher | text | nullable |
| year_published | int | nullable |
| description | text | nullable |
| cover_url | text | nullable, public Supabase Storage URL |
| category_id | uuid → library_categories ON DELETE RESTRICT | |
| tags | text[] | NOT NULL, default `'{}'` |
| created_by | uuid → profiles | |
| created_at | timestamptz | default now() |

### `library_book_copies`

Physical copies. Status persists across loans so it can also reflect non-loan states (`lost`, `retired`).

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| book_id | uuid → library_books ON DELETE CASCADE | |
| copy_number | int | NOT NULL, e.g. 1, 2, 3 |
| condition | enum `library_condition` | `good | damaged | poor`, default `good` |
| condition_notes | text | nullable |
| status | enum `library_copy_status` | `available | checked_out | lost | retired`, default `available` |
| location | text | optional shelf code |
| created_at | timestamptz | default now() |
| | | UNIQUE (book_id, copy_number) |

### `library_loans`

Active and historical loans. A loan is "active" while `returned_at IS NULL`.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| copy_id | uuid → library_book_copies ON DELETE RESTRICT | |
| borrower_id | uuid → profiles | |
| checked_out_at | timestamptz | NOT NULL, default now() |
| due_at | timestamptz | NOT NULL |
| returned_at | timestamptz | nullable |
| checked_out_by | uuid → profiles | who processed the checkout (self for self-checkout, librarian for walk-up) |
| returned_by | uuid → profiles | nullable, librarian who marked it returned |
| return_condition | library_condition | nullable |
| return_notes | text | nullable |
| last_reminder_at | timestamptz | nullable — throttles cron reminders to once per day |

### `library_loan_extensions`

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| loan_id | uuid → library_loans ON DELETE CASCADE | |
| requested_by | uuid → profiles | should match loan.borrower_id |
| requested_until | timestamptz | NOT NULL — must be after current `due_at` |
| reason | text | nullable |
| status | enum `library_extension_status` | `pending | approved | rejected`, default `pending` |
| decided_by | uuid → profiles | nullable |
| decided_at | timestamptz | nullable |
| created_at | timestamptz | default now() |

### `library_reservations`

Per-book wait list. Same person can't be on the same book's queue twice (UNIQUE constraint).

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| book_id | uuid → library_books ON DELETE CASCADE | |
| profile_id | uuid → profiles ON DELETE CASCADE | |
| notified_at | timestamptz | nullable — set when "your turn" notification fires |
| created_at | timestamptz | default now() |
| | | UNIQUE (book_id, profile_id) |

Queue position is computed at view time as `ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at)`.

---

## 3. Routes & Pages

| Path | Purpose | Access |
|------|---------|--------|
| `/library` | Catalog (search + filter, grid of book cards) | Any authenticated |
| `/library/[book_id]` | Book detail; borrow / reserve | Any authenticated |
| `/library/me` | My loans (active + history), my reservations, my extension requests | Self only |
| `/library/manage` | Librarian dashboard — overdue, active loans, pending extensions | Librarian + Admin |
| `/library/manage/books` | Catalog management (books + categories) | Librarian + Admin |
| `/library/manage/books/new` | New book + first copy | Librarian + Admin |
| `/library/manage/books/[id]` | Edit book metadata + manage copies | Librarian + Admin |
| `/library/manage/checkout` | Walk-up checkout form | Librarian + Admin |

### Catalog (`/library`)

- Search box: title / author / ISBN (case-insensitive substring)
- Category dropdown filter
- Tag filter chips (multi-select; intersection)
- Grid of `BookCard` components: cover, title, author, availability badge ("3 of 5 available" / "All checked out"), category badge

### Book detail (`/library/[book_id]`)

- Header: cover, title, author, year, publisher, ISBN, description, category, tags
- Copies section: list of all copies with their `status`, `condition`, `location`
- Primary action button:
  - If at least one copy `available` and the user has no active loan on this book → "Borrow"
  - If all copies checked out / lost / retired and user has no reservation yet → "Reserve" (joins wait list)
  - If user already has a reservation → "Cancel reservation" + queue position display
  - If user already has an active loan → "You have this book until {due_at}"
- Librarian/Admin: extra "Edit book" link

### My loans (`/library/me`)

Three sections:
- **Active loans:** card per loan with copy number, due date, days remaining or "X days late", "Request extension" button, pending extension status if any
- **Reservations:** book + queue position + created_at, "Cancel" button
- **History:** collapsed list of returned loans with date and condition

### Librarian dashboard (`/library/manage`)

- **Overdue loans (red):** borrower name, book title, copy #, days late, last reminder date, "Send reminder now" + "Mark returned" buttons
- **Active loans:** borrower, book, due date (sortable)
- **Pending extension requests:** borrower, current due date, requested date, reason, "Approve" + "Reject" buttons

### Catalog management (`/library/manage/books`)

Mirrors the inventory categories editor pattern:
- Categories section at top — add, rename, recolor, delete (delete blocked if any book references it)
- Books section: list of all books grouped by category, edit / delete per row, "+ New book" button at top

### New book form (`/library/manage/books/new`)

Inputs: title*, author*, ISBN, publisher, year, description, category*, tags (comma-separated input that splits to array), CoverUpload, plus initial copy fields (copy_number defaults to 1, condition, location).

### Edit book (`/library/manage/books/[id]`)

Same fields as new, plus a Copies section to add/edit/delete copies (delete blocked if any non-returned loans reference the copy).

### Walk-up checkout (`/library/manage/checkout`)

Form:
- Borrower picker — typeahead by `first_name + last_name` against profiles
- Book picker — typeahead by title/author
- Copy dropdown — populated with available copies of selected book
- Due date — defaults to today + 30 days; editable
- Submit → creates loan with `checked_out_by = librarian.id`

---

## 4. Permissions

| Action | Who |
|--------|-----|
| Read books, categories, copies | Any authenticated |
| Read own loans, reservations, extensions | Self only (RLS predicate) |
| Self-checkout an available copy | Self (`borrower_id = auth.uid()`) |
| Reserve a book / cancel own reservation | Self |
| Request loan extension | Owner of the loan |
| Read all loans, dashboard, all extensions | `is_librarian_or_admin()` |
| Walk-up checkout | `is_librarian_or_admin()` |
| Mark loan returned | `is_librarian_or_admin()` |
| Approve / reject extension | `is_librarian_or_admin()` |
| Manage books, categories, copies | `is_librarian_or_admin()` |
| Upload / delete cover images | `is_librarian_or_admin()` |
| Manually trigger overdue reminder | `is_librarian_or_admin()` |

---

## 5. Storage

**Bucket:** `book-covers` (Supabase Storage, **public**)

**Path pattern:** `books/{book_id}/{uuid}.jpg`

**Limits:** 5 MB per file. Compressed client-side via Canvas API: longest edge 1200px, JPEG quality 0.82 — same approach as Plan A inventory photos.

**Cleanup:** When a cover URL is replaced or the book is deleted, the old file is removed from storage in the server action via `storagePathFromCoverUrl`.

**Storage RLS:**

| Op | Policy |
|----|--------|
| SELECT | Open (public bucket) |
| INSERT / UPDATE / DELETE | Authenticated AND `is_librarian_or_admin()` |

---

## 6. Loan Lifecycle

```
Available ──checkout──▶ Checked out ──return──▶ Available
                            │
                            ├── extension request → pending → approved/rejected
                            │
                            └── overdue (cron sends daily reminders)
```

**Self-checkout (member):**
1. Member visits a book detail page where ≥ 1 copy is `available` and they don't already have an active loan on that book
2. Clicks "Borrow"
3. Server action `selfCheckoutAction(bookId)` (transactional via SECURITY DEFINER RPC `self_checkout`):
   - Selects an `available` copy of the book (lowest `copy_number`)
   - Inserts `library_loans` row with `borrower_id = auth.uid()`, `checked_out_by = auth.uid()`, `checked_out_at = now()`, `due_at = now() + 30 days`
   - Updates that copy's `status = 'checked_out'`
   - Returns the loan id

**Walk-up checkout (librarian):**
1. Form on `/library/manage/checkout`
2. Server action `walkUpCheckoutAction(borrower_id, copy_id, due_at)`:
   - Verifies caller is librarian/admin
   - Verifies the copy is `available`
   - Same insert + status update

**Return (librarian only):**
1. From dashboard or book detail, librarian clicks "Mark returned" on an active loan
2. Modal: optional condition (defaults to current copy condition), notes
3. Server action `returnLoanAction(loan_id, condition, notes)` (RPC `return_loan`):
   - Updates loan: `returned_at = now()`, `returned_by = auth.uid()`, `return_condition`, `return_notes`
   - Updates copy: `status = 'available'`; if condition supplied and changed, also updates copy `condition`
   - Calls `notify_next_reservation(book_id)` — finds the earliest unnotified reservation for the book; if found, inserts a `library_book_available` notification for the reserver and sets `notified_at = now()` on the reservation

**Extension request (member):**
1. Member clicks "Request extension" on an active loan
2. Modal: pick new due date (must be > current `due_at`), optional reason
3. Server action `requestExtensionAction(loan_id, requested_until, reason)`:
   - Verifies caller owns the loan and `requested_until > current due_at`
   - Inserts `library_loan_extensions` with `status = 'pending'`
   - RPC `notify_extension_requested(extension_id)` notifies all librarians + admins (via `notifications` table)

**Extension decision (librarian):**
1. Librarian clicks Approve/Reject on dashboard
2. Server action `decideExtensionAction(extension_id, decision, reason)` (RPC `decide_extension`):
   - Updates extension row: `status`, `decided_by`, `decided_at`, optional reason
   - On approval: also updates the loan's `due_at = requested_until`
   - Inserts a `library_extension_decision` notification for the borrower with the outcome and reason

**Cancel own reservation (member):**
- `cancelReservationAction(reservation_id)` deletes the row if `profile_id = auth.uid()`

---

## 7. Cron — Overdue Reminders

**Endpoint:** `/api/cron/library-reminders` (Vercel Cron route handler)

**Schedule:** daily at 09:00 UTC

**vercel.ts config:**
```ts
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/library-reminders', schedule: '0 9 * * *' },
  ],
};
```

**Authentication:** request must include `Authorization: Bearer ${CRON_SECRET}` header. Vercel attaches this header automatically when `CRON_SECRET` env var is set in the project settings. Implementer adds `CRON_SECRET` to Vercel env (with a step in the plan).

**Logic:**
```
- Verify Authorization header
- SELECT loans WHERE returned_at IS NULL
                 AND due_at < now()
                 AND (last_reminder_at IS NULL OR last_reminder_at::date < CURRENT_DATE)
- For each: INSERT INTO notifications (recipient = borrower, type = 'library_loan_overdue',
            payload = { loan_id, book_title, due_at, days_overdue })
            UPDATE library_loans SET last_reminder_at = now() WHERE id = ...
- Return 200 with count
```

**Manual override:** the librarian dashboard "Send reminder now" button calls a separate server action `sendManualReminderAction(loan_id)` that performs the same insert + update for one loan, gated by `is_librarian_or_admin()`. This bypasses the once-per-day check.

**Idempotency:** running the cron twice on the same day inserts at most one reminder per loan because `last_reminder_at::date < CURRENT_DATE` is false after the first run.

---

## 8. Notifications

Reuses the generic `notifications` table from Plan C. Four new notification types:

| type | recipient | payload |
|------|-----------|---------|
| `library_loan_overdue` | borrower | `{ loan_id, book_title, due_at, days_overdue }` |
| `library_book_available` | next reserver | `{ book_id, book_title, reservation_id }` |
| `library_extension_requested` | librarians + admins | `{ extension_id, loan_id, book_title, borrower_name, requested_until, reason }` |
| `library_extension_decision` | borrower | `{ extension_id, loan_id, book_title, decision, reason }` |

`NotificationsList.tsx` extended with one branch per type.

---

## 9. RLS Policies

```sql
-- library_categories
ALTER TABLE library_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_cat_read"  ON library_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lib_cat_write" ON library_categories FOR ALL USING (is_librarian_or_admin());

-- library_books
ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_book_read"  ON library_books FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lib_book_write" ON library_books FOR ALL USING (is_librarian_or_admin());

-- library_book_copies
ALTER TABLE library_book_copies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_copy_read"  ON library_book_copies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lib_copy_write" ON library_book_copies FOR ALL USING (is_librarian_or_admin());

-- library_loans
ALTER TABLE library_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_loan_self_read"  ON library_loans FOR SELECT
  USING (borrower_id = auth.uid() OR is_librarian_or_admin());
CREATE POLICY "lib_loan_staff_write" ON library_loans FOR ALL USING (is_librarian_or_admin());
-- Self-checkout INSERT goes through the SECURITY DEFINER RPC `self_checkout` —
-- no direct INSERT policy for members. Same for return / extensions.

-- library_loan_extensions
ALTER TABLE library_loan_extensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_ext_read" ON library_loan_extensions FOR SELECT
  USING (
    requested_by = auth.uid() OR is_librarian_or_admin()
  );
-- INSERT/UPDATE go through RPCs.

-- library_reservations
ALTER TABLE library_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_res_self_read"   ON library_reservations FOR SELECT
  USING (profile_id = auth.uid() OR is_librarian_or_admin());
CREATE POLICY "lib_res_self_insert" ON library_reservations FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR is_librarian_or_admin());
CREATE POLICY "lib_res_self_delete" ON library_reservations FOR DELETE
  USING (profile_id = auth.uid() OR is_librarian_or_admin());
```

---

## 10. Files Created / Modified

**Created:**
- `supabase/migrations/0010_library.sql` — all schema, RLS, helper, RPCs, role-constraint update, book-covers bucket
- `src/lib/library.ts` — pure helpers (`computeOverdueDays`, `defaultDueDate`, `storagePathFromCoverUrl`)
- `tests/unit/library.test.ts`
- `src/components/library/CoverUpload.tsx` — book cover upload (mirrors ImageUpload from Plan A)
- `src/components/library/BookCard.tsx` — catalog card
- `src/app/(app)/library/page.tsx` — catalog
- `src/app/(app)/library/[book_id]/page.tsx` — book detail
- `src/app/(app)/library/[book_id]/actions.ts` — borrow, reserve, cancel reservation
- `src/app/(app)/library/me/page.tsx` — my page
- `src/app/(app)/library/me/MyLoansList.tsx` — client (extension request modal)
- `src/app/(app)/library/me/actions.ts` — request extension, cancel reservation
- `src/app/(app)/library/manage/page.tsx` — dashboard
- `src/app/(app)/library/manage/DashboardClient.tsx` — client (manual reminder, approve/reject)
- `src/app/(app)/library/manage/actions.ts` — return loan, approve/reject extension, send manual reminder
- `src/app/(app)/library/manage/books/page.tsx` — catalog admin
- `src/app/(app)/library/manage/books/CatalogManager.tsx` — client editor (categories + books)
- `src/app/(app)/library/manage/books/actions.ts` — categories CRUD
- `src/app/(app)/library/manage/books/new/page.tsx` — new book form
- `src/app/(app)/library/manage/books/new/NewBookForm.tsx` — client form
- `src/app/(app)/library/manage/books/new/actions.ts` — create book + first copy
- `src/app/(app)/library/manage/books/[id]/page.tsx` — edit
- `src/app/(app)/library/manage/books/[id]/EditBookForm.tsx` — client form
- `src/app/(app)/library/manage/books/[id]/CopiesEditor.tsx` — copies CRUD
- `src/app/(app)/library/manage/books/[id]/actions.ts` — book + copy actions
- `src/app/(app)/library/manage/checkout/page.tsx` — walk-up form
- `src/app/(app)/library/manage/checkout/CheckoutForm.tsx` — client typeahead
- `src/app/(app)/library/manage/checkout/actions.ts` — walk-up checkout
- `src/app/api/cron/library-reminders/route.ts` — daily cron handler
- `vercel.ts` — cron config

**Modified:**
- `src/types/database.ts` — 6 new tables + new enums + RPC types + role enum widening
- `src/lib/auth.ts` — `SessionUser.role` includes `librarian`; new `requireLibrarianOrAdmin`
- `src/components/layout/Sidebar.tsx` — Library nav for everyone, Manage Library for librarian/admin
- `src/components/layout/BottomTabs.tsx` — Library tab; admin/librarian see Manage tab
- `src/app/(app)/notifications/NotificationsList.tsx` — handle 4 new notification types

---

## 11. Out of Scope

- ISBN auto-lookup via external API
- Barcode scanning at checkout
- Fines for overdue books
- Per-member loan limits (e.g. max 5 concurrent)
- Member-side return marking (librarian-only by spec)
- Browse-by-tag landing pages (tags are filter chips, not pages)
- Book ratings or reviews
- Email/SMS delivery of reminders (in-app only — cron infrastructure can later branch into email)
- Book series tracking
- Cross-link to inventory items
- Bulk import via CSV
