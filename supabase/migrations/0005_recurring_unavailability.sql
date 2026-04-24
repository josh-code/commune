-- supabase/migrations/0005_recurring_unavailability.sql
-- Plan 04: Recurring Services & Date Range Unavailability

-- ── service_templates ────────────────────────────────────────────────────────

CREATE TABLE service_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  type          text        NOT NULL DEFAULT 'regular_sunday'
                              CHECK (type IN ('regular_sunday', 'special_event')),
  frequency     text        NOT NULL
                              CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  day_of_week   int         CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month  int         CHECK (day_of_month BETWEEN 1 AND 31),
  month_of_year int         CHECK (month_of_year BETWEEN 1 AND 12),
  created_by    uuid        NOT NULL REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── unavailability_ranges ────────────────────────────────────────────────────

CREATE TABLE unavailability_ranges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_range CHECK (end_date >= start_date)
);

-- ── Add template_id to services ──────────────────────────────────────────────

ALTER TABLE services
  ADD COLUMN template_id uuid REFERENCES service_templates(id) ON DELETE SET NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE service_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_auth_read" ON service_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "st_admin_all" ON service_templates FOR ALL USING (is_admin());

ALTER TABLE unavailability_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ur_select"        ON unavailability_ranges FOR SELECT USING (profile_id = auth.uid() OR is_admin());
CREATE POLICY "ur_member_insert" ON unavailability_ranges FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "ur_member_delete" ON unavailability_ranges FOR DELETE USING (profile_id = auth.uid());

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX ON unavailability_ranges (profile_id);
CREATE INDEX ON unavailability_ranges (start_date, end_date);
CREATE INDEX ON services (template_id) WHERE template_id IS NOT NULL;
