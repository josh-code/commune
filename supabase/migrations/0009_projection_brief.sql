-- supabase/migrations/0009_projection_brief.sql
-- Plan D: Projection Brief — Sermon submission

-- ── Preaching team + Speaker position seed ──────────────────────────────────

INSERT INTO teams (name, color)
SELECT 'Preaching', '#dc2626'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = 'Preaching');

INSERT INTO team_positions (team_id, name, "order")
SELECT t.id, 'Speaker', 0
  FROM teams t
 WHERE t.name = 'Preaching'
   AND NOT EXISTS (
     SELECT 1 FROM team_positions p WHERE p.team_id = t.id AND p.name = 'Speaker'
   );

-- ── Helper functions ────────────────────────────────────────────────────────

-- True if current user is admin OR in Media team
CREATE OR REPLACE FUNCTION is_media_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid() AND t.name = 'Media'
    );
$$;

-- True if current user is the rostered Speaker for the given service
-- (i.e., rostered to a Preaching team's "Speaker" position for that service)
CREATE OR REPLACE FUNCTION is_service_speaker(sid uuid) RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM roster_slots rs
      JOIN team_positions tp ON tp.id = rs.position_id
      JOIN teams t ON t.id = tp.team_id
     WHERE rs.service_id = sid
       AND rs.profile_id = auth.uid()
       AND t.name = 'Preaching'
       AND tp.name = 'Speaker'
  );
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE service_briefs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id            uuid        NOT NULL UNIQUE REFERENCES services(id) ON DELETE CASCADE,
  sermon_title          text,
  sermon_notes          text,
  default_bible_version text        NOT NULL DEFAULT 'NIV',
  deadline              timestamptz NOT NULL,
  sermon_submitted_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brief_verses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id         uuid NOT NULL REFERENCES service_briefs(id) ON DELETE CASCADE,
  book             text NOT NULL,
  chapter          int  NOT NULL CHECK (chapter >= 1),
  verse_start      int  NOT NULL CHECK (verse_start >= 1),
  verse_end        int  CHECK (verse_end IS NULL OR verse_end >= verse_start),
  version_override text,
  position         int  NOT NULL,
  UNIQUE (brief_id, position)
);

CREATE INDEX idx_brief_verses_brief ON brief_verses (brief_id, position);

CREATE TABLE brief_attachments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id    uuid        NOT NULL REFERENCES service_briefs(id) ON DELETE CASCADE,
  file_name   text        NOT NULL,
  file_url    text        NOT NULL,
  mime_type   text        NOT NULL,
  size_bytes  int         NOT NULL CHECK (size_bytes >= 0),
  uploaded_by uuid        NOT NULL REFERENCES profiles(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brief_attachments_brief ON brief_attachments (brief_id);

-- ── RLS — service_briefs ────────────────────────────────────────────────────

ALTER TABLE service_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brief_view" ON service_briefs
  FOR SELECT USING (is_media_or_admin() OR is_service_speaker(service_id));

CREATE POLICY "brief_insert" ON service_briefs
  FOR INSERT WITH CHECK (is_media_or_admin() OR is_service_speaker(service_id));

CREATE POLICY "brief_update" ON service_briefs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR is_service_speaker(service_id)
  );

CREATE POLICY "brief_admin_delete" ON service_briefs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── RLS — brief_verses ──────────────────────────────────────────────────────

ALTER TABLE brief_verses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verses_view" ON brief_verses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (is_media_or_admin() OR is_service_speaker(sb.service_id))
    )
  );

CREATE POLICY "verses_edit" ON brief_verses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (
           EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
           OR is_service_speaker(sb.service_id)
         )
    )
  );

-- ── RLS — brief_attachments ─────────────────────────────────────────────────

ALTER TABLE brief_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_view" ON brief_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (is_media_or_admin() OR is_service_speaker(sb.service_id))
    )
  );

CREATE POLICY "attachments_edit" ON brief_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (
           EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
           OR is_service_speaker(sb.service_id)
         )
    )
  );

-- ── Storage: brief-attachments bucket ───────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('brief-attachments', 'brief-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Helper: parse "briefs/{brief_id}/..." prefix and check edit permission
CREATE OR REPLACE FUNCTION can_edit_brief_attachment(p_name text) RETURNS bool
LANGUAGE plpgsql SECURITY DEFINER STABLE
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
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR is_service_speaker(v_service);
END;
$$;

CREATE POLICY "brief_files_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'brief-attachments');

CREATE POLICY "brief_files_edit_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'brief-attachments'
    AND auth.uid() IS NOT NULL
    AND can_edit_brief_attachment(name)
  );

CREATE POLICY "brief_files_edit_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'brief-attachments' AND can_edit_brief_attachment(name)
  );

CREATE POLICY "brief_files_edit_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'brief-attachments' AND can_edit_brief_attachment(name)
  );

-- ── RPC: notify on submit ───────────────────────────────────────────────────
-- Inserts a notifications row for each Media member + each admin (deduped)
-- Returns count of recipients.

CREATE OR REPLACE FUNCTION notify_brief_submitted(p_brief_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
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
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
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

  -- Insert notifications
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
   WHERE p.role = 'admin'
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
