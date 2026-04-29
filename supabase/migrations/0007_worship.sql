-- supabase/migrations/0007_worship.sql
-- Plan B: Song Bank & Setlists

-- ── Media team seed ──────────────────────────────────────────────────────────

INSERT INTO teams (name, color)
SELECT 'Media', '#8b5cf6'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = 'Media');

-- ── Helper functions ─────────────────────────────────────────────────────────

-- True if the current user can write to the song bank:
-- admin, OR worship team leader, OR any media team member
CREATE OR REPLACE FUNCTION is_worship_write_allowed() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
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

-- True if the current user can view the setlist for the given service
CREATE OR REPLACE FUNCTION is_setlist_viewer(sid uuid) RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM roster_slots rs
      JOIN teams t ON t.id = rs.team_id
      WHERE rs.service_id = sid
        AND rs.profile_id = auth.uid()
        AND t.name IN ('Worship', 'Media')
    );
$$;

-- True if the current user is the rostered worship leader for the given service,
-- OR is an admin (admins can always edit)
CREATE OR REPLACE FUNCTION is_service_worship_leader(sid uuid) RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
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

-- Returns all service IDs for which the current user is the rostered worship leader.
-- Used to build the "your last key" history on the setlist picker.
CREATE OR REPLACE FUNCTION get_worship_leader_service_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT DISTINCT rs.service_id
  FROM roster_slots rs
  JOIN team_positions tp ON tp.id = rs.position_id
  JOIN teams t ON t.id = tp.team_id
  JOIN team_member_positions tmp
    ON tmp.profile_id = rs.profile_id
   AND tmp.position_id = rs.position_id
  WHERE rs.profile_id = auth.uid()
    AND t.name = 'Worship'
    AND tmp.team_role = 'leader';
$$;

-- ── songs ────────────────────────────────────────────────────────────────────

CREATE TABLE songs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── song_versions ────────────────────────────────────────────────────────────

CREATE TABLE song_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id         uuid        NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  label           text        NOT NULL,
  artist          text,
  is_original     boolean     NOT NULL DEFAULT false,
  written_key     text        NOT NULL,
  tempo           int,
  chord_sheet_url text,
  created_by      uuid        NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- At most one version per song can be marked is_original
CREATE UNIQUE INDEX idx_song_versions_one_original
  ON song_versions (song_id) WHERE is_original = true;

CREATE INDEX idx_song_versions_song ON song_versions (song_id);

-- ── setlists ─────────────────────────────────────────────────────────────────

CREATE TABLE setlists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid        NOT NULL UNIQUE REFERENCES services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── setlist_songs ────────────────────────────────────────────────────────────

CREATE TABLE setlist_songs (
  id              uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id      uuid NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  song_version_id uuid NOT NULL REFERENCES song_versions(id),
  position        int  NOT NULL,
  played_key      text NOT NULL,
  notes           text,
  added_by        uuid NOT NULL REFERENCES profiles(id),
  UNIQUE (setlist_id, position)
);

CREATE INDEX idx_setlist_songs_setlist ON setlist_songs (setlist_id, position);

-- ── RLS — songs ──────────────────────────────────────────────────────────────

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "songs_auth_read" ON songs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "songs_write_insert" ON songs
  FOR INSERT WITH CHECK (is_worship_write_allowed());

CREATE POLICY "songs_write_update" ON songs
  FOR UPDATE USING (is_worship_write_allowed());

CREATE POLICY "songs_admin_delete" ON songs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── RLS — song_versions ──────────────────────────────────────────────────────

ALTER TABLE song_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "versions_auth_read" ON song_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "versions_write_insert" ON song_versions
  FOR INSERT WITH CHECK (is_worship_write_allowed());

CREATE POLICY "versions_write_update" ON song_versions
  FOR UPDATE USING (is_worship_write_allowed());

CREATE POLICY "versions_admin_delete" ON song_versions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── RLS — setlists ───────────────────────────────────────────────────────────

ALTER TABLE setlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setlists_viewer_read" ON setlists
  FOR SELECT USING (is_setlist_viewer(service_id));

-- Any authenticated user can upsert a setlist row (the server action does this
-- on first visit; RLS on setlist_songs still gates what they can do with it)
CREATE POLICY "setlists_auth_insert" ON setlists
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── RLS — setlist_songs ──────────────────────────────────────────────────────

ALTER TABLE setlist_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setlist_songs_viewer_read" ON setlist_songs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM setlists sl
      WHERE sl.id = setlist_id AND is_setlist_viewer(sl.service_id)
    )
  );

CREATE POLICY "setlist_songs_leader_all" ON setlist_songs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM setlists sl
      WHERE sl.id = setlist_id AND is_service_worship_leader(sl.service_id)
    )
  );

-- ── Storage: chord-sheets ────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('chord-sheets', 'chord-sheets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chord_sheets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chord-sheets');

CREATE POLICY "chord_sheets_write_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chord-sheets'
    AND auth.uid() IS NOT NULL
    AND is_worship_write_allowed()
  );

CREATE POLICY "chord_sheets_write_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'chord-sheets' AND is_worship_write_allowed()
  );

CREATE POLICY "chord_sheets_write_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chord-sheets' AND is_worship_write_allowed()
  );
