-- supabase/migrations/0008_hospitality.sql
-- Plan C: Hospitality Needs List

-- ── Hospitality team seed ────────────────────────────────────────────────────

INSERT INTO teams (name, color)
SELECT 'Hospitality', '#06b6d4'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = 'Hospitality');

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE hospitality_need_status AS ENUM ('needed', 'requested', 'fulfilled');

-- ── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_hospitality_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid() AND t.name = 'Hospitality'
    );
$$;

-- ── hospitality_categories ───────────────────────────────────────────────────

CREATE TABLE hospitality_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── hospitality_items ────────────────────────────────────────────────────────

CREATE TABLE hospitality_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  category_id uuid        NOT NULL REFERENCES hospitality_categories(id) ON DELETE RESTRICT,
  created_by  uuid        NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

CREATE INDEX idx_hosp_items_category ON hospitality_items (category_id);

-- ── hospitality_needs ────────────────────────────────────────────────────────

CREATE TABLE hospitality_needs (
  id            uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    uuid                       NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_id       uuid                       NOT NULL REFERENCES hospitality_items(id) ON DELETE RESTRICT,
  quantity      text                       NOT NULL,
  notes         text,
  status        hospitality_need_status    NOT NULL DEFAULT 'needed',
  requested_at  timestamptz,
  fulfilled_by  uuid                       REFERENCES profiles(id),
  fulfilled_at  timestamptz,
  created_by    uuid                       NOT NULL REFERENCES profiles(id),
  created_at    timestamptz                NOT NULL DEFAULT now()
);

CREATE INDEX idx_hosp_needs_service ON hospitality_needs (service_id, status);

-- ── notifications (generic) ──────────────────────────────────────────────────

CREATE TABLE notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         text        NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_unread
  ON notifications (recipient_id, read_at, created_at DESC);

-- ── RLS — hospitality_categories ────────────────────────────────────────────

ALTER TABLE hospitality_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_cat_read" ON hospitality_categories
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_cat_all"  ON hospitality_categories
  FOR ALL USING (is_hospitality_or_admin());

-- ── RLS — hospitality_items ──────────────────────────────────────────────────

ALTER TABLE hospitality_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_item_read" ON hospitality_items
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_item_all"  ON hospitality_items
  FOR ALL USING (is_hospitality_or_admin());

-- ── RLS — hospitality_needs ──────────────────────────────────────────────────

ALTER TABLE hospitality_needs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_needs_read" ON hospitality_needs
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_needs_all"  ON hospitality_needs
  FOR ALL USING (is_hospitality_or_admin());

-- ── RLS — notifications ──────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_self_read" ON notifications
  FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notif_self_update" ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());
-- No INSERT/DELETE policy: writes go through SECURITY DEFINER RPCs.

-- ── RPC: request hospitality order ───────────────────────────────────────────
-- Atomically flips needed → requested for one service AND inserts notifications
-- for admins + Hospitality leaders. Returns the number of items requested (0 if
-- nothing was needed).

CREATE OR REPLACE FUNCTION request_hospitality_order(p_service_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
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
   WHERE p.role = 'admin'
      OR p.id IN (
        SELECT tmp.profile_id
          FROM team_member_positions tmp
          JOIN teams t ON t.id = tmp.team_id
         WHERE t.name = 'Hospitality' AND tmp.team_role = 'leader'
      );

  RETURN v_count;
END;
$$;
