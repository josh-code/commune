-- supabase/migrations/0004_rostering.sql
-- Plan 03: Rostering
-- Drops member_teams; adds team_positions, team_member_positions,
-- services, roster_slots, service_unavailability, swap_requests

-- ── New tables ──────────────────────────────────────────────────────────────

CREATE TABLE team_positions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  "order"    int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, name)
);

CREATE TABLE team_member_positions (
  profile_id  uuid NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES teams(id)           ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES team_positions(id)  ON DELETE CASCADE,
  team_role   text NOT NULL DEFAULT 'member'
                CHECK (team_role IN ('leader', 'member')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, position_id)
);

CREATE TABLE services (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  date       date        NOT NULL,
  type       text        NOT NULL DEFAULT 'regular_sunday'
               CHECK (type IN ('regular_sunday', 'special_event')),
  status     text        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'completed')),
  created_by uuid        NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roster_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES services(id)        ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES teams(id)           ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES team_positions(id)  ON DELETE CASCADE,
  profile_id  uuid          REFERENCES profiles(id)        ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'unassigned'
                CHECK (status IN ('unassigned', 'pending', 'confirmed', 'declined')),
  notified_at  timestamptz,
  responded_at timestamptz,
  UNIQUE (service_id, position_id)
);

CREATE TABLE service_unavailability (
  profile_id uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, service_id)
);

CREATE TABLE swap_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_slot_id          uuid NOT NULL REFERENCES roster_slots(id) ON DELETE CASCADE,
  requester_id            uuid NOT NULL REFERENCES profiles(id),
  proposed_replacement_id uuid          REFERENCES profiles(id),
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE team_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp_auth_read" ON team_positions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "tp_admin_all" ON team_positions FOR ALL USING (is_admin());

ALTER TABLE team_member_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmp_auth_read" ON team_member_positions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "tmp_admin_all" ON team_member_positions FOR ALL USING (is_admin());

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_auth_read"  ON services FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "svc_admin_all"  ON services FOR ALL USING (is_admin());

ALTER TABLE roster_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rs_member_read" ON roster_slots FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "rs_admin_all"   ON roster_slots FOR ALL USING (is_admin());

ALTER TABLE service_unavailability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "su_select"        ON service_unavailability FOR SELECT USING (profile_id = auth.uid() OR is_admin());
CREATE POLICY "su_member_insert" ON service_unavailability FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "su_member_delete" ON service_unavailability FOR DELETE USING (profile_id = auth.uid());

ALTER TABLE swap_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sr_member_read"   ON swap_requests FOR SELECT USING (requester_id = auth.uid() OR is_admin());
CREATE POLICY "sr_member_insert" ON swap_requests FOR INSERT WITH CHECK (requester_id = auth.uid());

-- ── Seed positions for default teams ────────────────────────────────────────

INSERT INTO team_positions (team_id, name, "order")
SELECT t.id, pos.name, pos.ord
FROM teams t
JOIN (VALUES
  ('Worship',   'Lead Vocals',     1),
  ('Worship',   'Acoustic Guitar', 2),
  ('Worship',   'Bass Guitar',     3),
  ('Worship',   'Keys',            4),
  ('Worship',   'Drums',           5),
  ('Sound',     'Front of House',  1),
  ('Sound',     'Stage Monitor',   2),
  ('Kids',      'Small Children',  1),
  ('Kids',      'Big Kids',        2),
  ('Welcome',   'Greeter 1',       1),
  ('Welcome',   'Greeter 2',       2),
  ('Welcome',   'Car Park',        3),
  ('Logistics', 'Setup',           1),
  ('Logistics', 'Pack Down',       2)
) AS pos(team_name, name, ord) ON t.name = pos.team_name
ON CONFLICT (team_id, name) DO NOTHING;

-- ── Drop member_teams ────────────────────────────────────────────────────────

DROP TABLE IF EXISTS member_teams;

-- ── Performance indexes ──────────────────────────────────────────────────────

CREATE INDEX ON roster_slots (profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX ON team_member_positions (team_id);
CREATE INDEX ON services (date);
CREATE INDEX ON services (status);
CREATE INDEX ON swap_requests (roster_slot_id);
CREATE INDEX ON swap_requests (requester_id);
CREATE INDEX ON service_unavailability (service_id);
