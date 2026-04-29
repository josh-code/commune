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
