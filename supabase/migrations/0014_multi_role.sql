-- supabase/migrations/0014_multi_role.sql
-- Convert profiles.role (single enum) to profiles.roles (array).
-- Adds a SECURITY DEFINER helper current_user_has_role() to avoid RLS recursion,
-- rewrites every RLS policy and internal RPC that read the old column, then drops it.

-- ── 1. Add the new array column with a safe default ───────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN roles profile_role[] NOT NULL DEFAULT '{member}';

-- ── 2. Backfill: copy each row's existing single role into the array ──────────

UPDATE public.profiles SET roles = ARRAY[role];

-- ── 3. Helper RPC used by RLS policies ───────────────────────────────────────
-- SECURITY DEFINER so it can read profiles without triggering RLS recursion.

CREATE OR REPLACE FUNCTION public.current_user_has_role(target profile_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND target = ANY(roles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_role(profile_role) TO authenticated;

-- ── 4. Rewrite is_admin() (used by profiles RLS policies) ────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT current_user_has_role('admin');
$$;

-- is_logistics_or_admin (0006_inventory.sql) — original body did
-- `role IN ('admin','logistics)`; rewrite for the roles[] column.
CREATE OR REPLACE FUNCTION public.is_logistics_or_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT current_user_has_role('admin') OR current_user_has_role('logistics');
$$;

-- ── 5. Rewrite profiles RLS policies (currently delegated to is_admin()) ──────
-- The policies already reference is_admin() so they will automatically use the
-- updated function body — no DROP/CREATE needed for those three.
-- However, the ORIGINAL inline policies in 0001 were replaced by is_admin()-based
-- ones in 0002, so the live policies are already non-recursive.

-- ── 6. Rewrite inline RLS policies that still reference profiles.role directly ─

-- songs_admin_delete (0008_worship.sql)
DROP POLICY IF EXISTS "songs_admin_delete" ON public.songs;
CREATE POLICY "songs_admin_delete" ON public.songs
  FOR DELETE USING (current_user_has_role('admin'));

-- versions_admin_delete (0008_worship.sql)
DROP POLICY IF EXISTS "versions_admin_delete" ON public.song_versions;
CREATE POLICY "versions_admin_delete" ON public.song_versions
  FOR DELETE USING (current_user_has_role('admin'));

-- brief_update (0010_projection_brief.sql)
DROP POLICY IF EXISTS "brief_update" ON public.service_briefs;
CREATE POLICY "brief_update" ON public.service_briefs
  FOR UPDATE USING (
    current_user_has_role('admin')
    OR is_service_speaker(service_id)
  );

-- brief_admin_delete (0010_projection_brief.sql)
DROP POLICY IF EXISTS "brief_admin_delete" ON public.service_briefs;
CREATE POLICY "brief_admin_delete" ON public.service_briefs
  FOR DELETE USING (current_user_has_role('admin'));

-- verses_edit (0010_projection_brief.sql)
DROP POLICY IF EXISTS "verses_edit" ON public.brief_verses;
CREATE POLICY "verses_edit" ON public.brief_verses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_briefs sb
       WHERE sb.id = brief_id
         AND (
           current_user_has_role('admin')
           OR is_service_speaker(sb.service_id)
         )
    )
  );

-- attachments_edit (0010_projection_brief.sql)
DROP POLICY IF EXISTS "attachments_edit" ON public.brief_attachments;
CREATE POLICY "attachments_edit" ON public.brief_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.service_briefs sb
       WHERE sb.id = brief_id
         AND (
           current_user_has_role('admin')
           OR is_service_speaker(sb.service_id)
         )
    )
  );

-- ── 7. Rewrite RPCs that read profiles.role ───────────────────────────────────

-- is_worship_write_allowed (0008_worship.sql)
CREATE OR REPLACE FUNCTION public.is_worship_write_allowed() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    current_user_has_role('admin')
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid()
        AND tmp.team_role = 'leader'
        AND t.name = 'Worship'
    )
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid()
        AND t.name = 'Media'
    );
$$;

-- is_setlist_viewer (0008_worship.sql)
CREATE OR REPLACE FUNCTION public.is_setlist_viewer(sid uuid) RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    current_user_has_role('admin')
    OR EXISTS (
      SELECT 1 FROM roster_slots rs
      JOIN teams t ON t.id = rs.team_id
      WHERE rs.service_id = sid
        AND rs.profile_id = auth.uid()
        AND t.name IN ('Worship', 'Media')
    );
$$;

-- is_service_worship_leader (0008_worship.sql)
CREATE OR REPLACE FUNCTION public.is_service_worship_leader(sid uuid) RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    current_user_has_role('admin')
    OR EXISTS (
      SELECT 1 FROM roster_slots rs
      JOIN team_positions tp ON tp.id = rs.position_id
      JOIN teams t ON t.id = tp.team_id
      JOIN team_member_positions tmp
        ON tmp.profile_id = rs.profile_id
       AND tmp.position_id = rs.position_id
      WHERE rs.service_id = sid
        AND rs.profile_id = auth.uid()
        AND t.name = 'Worship'
        AND tmp.team_role = 'leader'
    );
$$;

-- is_hospitality_or_admin (0009_hospitality.sql)
CREATE OR REPLACE FUNCTION public.is_hospitality_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    current_user_has_role('admin')
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid() AND t.name = 'Hospitality'
    );
$$;

-- is_media_or_admin (0010_projection_brief.sql)
CREATE OR REPLACE FUNCTION public.is_media_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    current_user_has_role('admin')
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid() AND t.name = 'Media'
    );
$$;

-- can_edit_brief_attachment (0010_projection_brief.sql)
CREATE OR REPLACE FUNCTION public.can_edit_brief_attachment(p_name text) RETURNS bool
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_brief_id  uuid;
  v_service   uuid;
BEGIN
  -- Path format: briefs/{uuid}/...
  IF p_name !~ '^briefs/[0-9a-f-]+/' THEN
    RETURN false;
  END IF;
  v_brief_id := substring(p_name FROM 'briefs/([0-9a-f-]+)/')::uuid;
  SELECT service_id INTO v_service FROM service_briefs WHERE id = v_brief_id;
  IF v_service IS NULL THEN
    RETURN false;
  END IF;
  RETURN
    current_user_has_role('admin')
    OR is_service_speaker(v_service);
END;
$$;

-- notify_brief_submitted (0010_projection_brief.sql)
-- The p.role = 'admin' in the INSERT...SELECT targets notification recipients,
-- not the calling user — rewrite using array overlap.
CREATE OR REPLACE FUNCTION public.notify_brief_submitted(p_brief_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_service_id   uuid;
  v_service_name text;
  v_service_date date;
  v_speaker_name text;
  v_count        int;
BEGIN
  -- Permission check: caller must be Speaker for the service or Admin
  SELECT sb.service_id INTO v_service_id
    FROM service_briefs sb WHERE sb.id = p_brief_id;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'brief not found';
  END IF;
  IF NOT (
    current_user_has_role('admin')
    OR is_service_speaker(v_service_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Service info for payload
  SELECT name, date INTO v_service_name, v_service_date
    FROM services WHERE id = v_service_id;

  -- Speaker name for payload
  SELECT trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO v_speaker_name
    FROM roster_slots rs
    JOIN team_positions tp ON tp.id = rs.position_id
    JOIN teams t ON t.id = tp.team_id
    JOIN profiles p ON p.id = rs.profile_id
   WHERE rs.service_id = v_service_id
     AND t.name = 'Preaching'
     AND tp.name = 'Speaker'
   LIMIT 1;

  -- Insert notifications for admins and Media team members
  INSERT INTO notifications (recipient_id, type, payload)
  SELECT DISTINCT p.id,
                  'brief_submitted',
                  jsonb_build_object(
                    'brief_id',     p_brief_id,
                    'service_id',   v_service_id,
                    'service_name', v_service_name,
                    'service_date', v_service_date,
                    'speaker_name', coalesce(v_speaker_name, 'Speaker')
                  )
    FROM profiles p
   WHERE 'admin' = ANY(p.roles)
      OR p.id IN (
        SELECT tmp.profile_id
          FROM team_member_positions tmp
          JOIN teams t ON t.id = tmp.team_id
         WHERE t.name = 'Media'
      );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- is_librarian_or_admin (0012_library.sql)
CREATE OR REPLACE FUNCTION public.is_librarian_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (
         'admin'    = ANY(roles)
         OR 'librarian' = ANY(roles)
       )
  );
$$;

-- request_hospitality_order (0009_hospitality.sql)
-- The p.role = 'admin' in the INSERT...SELECT targets notification recipients.
CREATE OR REPLACE FUNCTION public.request_hospitality_order(p_service_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_count        int;
  v_service_name text;
  v_service_date date;
BEGIN
  IF NOT is_hospitality_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE hospitality_needs
     SET status = 'requested', requested_at = now()
   WHERE service_id = p_service_id
     AND status = 'needed';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  SELECT name, date INTO v_service_name, v_service_date
    FROM services WHERE id = p_service_id;

  INSERT INTO notifications (recipient_id, type, payload)
  SELECT DISTINCT p.id,
                  'hospitality_order_requested',
                  jsonb_build_object(
                    'service_id',   p_service_id,
                    'service_name', v_service_name,
                    'service_date', v_service_date,
                    'item_count',   v_count,
                    'requested_by', v_caller_id
                  )
    FROM profiles p
   WHERE 'admin' = ANY(p.roles)
      OR p.id IN (
        SELECT tmp.profile_id
          FROM team_member_positions tmp
          JOIN teams t ON t.id = tmp.team_id
         WHERE t.name = 'Hospitality' AND tmp.team_role = 'leader'
      );

  RETURN v_count;
END;
$$;

-- request_extension (0012_library.sql)
-- The p.role IN ('admin', 'librarian') targets notification recipients.
-- Preserve all original logic; only swap the WHERE clause.
CREATE OR REPLACE FUNCTION public.request_extension(
  p_loan_id          uuid,
  p_requested_until  timestamptz,
  p_reason           text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_borrower   uuid;
  v_due        timestamptz;
  v_returned   timestamptz;
  v_ext_id     uuid;
  v_book_t     text;
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
   WHERE 'admin'     = ANY(p.roles)
      OR 'librarian' = ANY(p.roles);

  RETURN v_ext_id;
END;
$$;

-- ── 8. Drop the legacy single-role column ─────────────────────────────────────

ALTER TABLE public.profiles DROP COLUMN role;

-- ── 9. Clean up the now-redundant index on the old column ────────────────────
-- (profiles_role_idx was created in 0001_foundation.sql)
-- The index was dropped automatically when the column was dropped.
-- No action needed.
