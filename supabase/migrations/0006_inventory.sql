-- supabase/migrations/0006_inventory.sql
-- Plan 05: Inventory & Logistics

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE inventory_condition AS ENUM ('good', 'needs_repair', 'out_of_service');
CREATE TYPE reservation_status  AS ENUM ('pending', 'approved', 'rejected', 'checked_out', 'returned', 'cancelled');

-- ── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_logistics_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin','logistics')
  );
$$;

-- ── inventory_categories ────────────────────────────────────────────────────

CREATE TABLE inventory_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  color       text        NOT NULL DEFAULT '#6366f1',
  icon        text,
  "order"     int         NOT NULL DEFAULT 0,
  is_public   bool        NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── inventory_items ─────────────────────────────────────────────────────────

CREATE TABLE inventory_items (
  id                    uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id           uuid                NOT NULL REFERENCES inventory_categories(id) ON DELETE RESTRICT,
  name                  text                NOT NULL,
  description           text,
  photo_url             text,
  tracked_individually  bool                NOT NULL DEFAULT false,
  total_quantity        int                 NOT NULL DEFAULT 1,
  serial_number         text,
  condition             inventory_condition NOT NULL DEFAULT 'good',
  condition_notes       text,
  approval_required     bool                NOT NULL DEFAULT false,
  location              text,
  is_public             bool                NOT NULL DEFAULT true,
  created_by            uuid                NOT NULL REFERENCES profiles(id),
  created_at            timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT qty_valid CHECK (total_quantity >= 1 AND (tracked_individually = false OR total_quantity = 1))
);

-- ── inventory_reservations ──────────────────────────────────────────────────

CREATE TABLE inventory_reservations (
  id                uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           uuid                NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  profile_id        uuid                NOT NULL REFERENCES profiles(id),
  created_by        uuid                NOT NULL REFERENCES profiles(id),
  quantity          int                 NOT NULL DEFAULT 1,
  start_date        date                NOT NULL,
  end_date          date                NOT NULL,
  status            reservation_status  NOT NULL DEFAULT 'pending',
  notes             text,
  approved_by       uuid                REFERENCES profiles(id),
  approved_at       timestamptz,
  rejection_reason  text,
  checked_out_at    timestamptz,
  returned_at       timestamptz,
  return_condition  inventory_condition,
  return_notes      text,
  created_at        timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT res_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT res_qty_positive CHECK (quantity >= 1)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_items_category ON inventory_items (category_id);
CREATE INDEX idx_items_visible  ON inventory_items (is_public, condition) WHERE condition <> 'out_of_service';
CREATE INDEX idx_res_item       ON inventory_reservations (item_id, status);
CREATE INDEX idx_res_profile    ON inventory_reservations (profile_id, status);
CREATE INDEX idx_res_dates      ON inventory_reservations (start_date, end_date);

-- ── RLS — categories ────────────────────────────────────────────────────────

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_member_read" ON inventory_categories
  FOR SELECT USING (is_public OR is_logistics_or_admin());
CREATE POLICY "cat_staff_all"   ON inventory_categories
  FOR ALL USING (is_logistics_or_admin());

-- ── RLS — items ─────────────────────────────────────────────────────────────

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item_member_read" ON inventory_items
  FOR SELECT USING (
    is_logistics_or_admin()
    OR (
      is_public AND
      EXISTS (
        SELECT 1 FROM inventory_categories c
        WHERE c.id = category_id AND c.is_public
      )
    )
  );
CREATE POLICY "item_staff_all" ON inventory_items
  FOR ALL USING (is_logistics_or_admin());

-- ── RLS — reservations ──────────────────────────────────────────────────────

ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "res_self_read"    ON inventory_reservations
  FOR SELECT USING (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_self_insert"  ON inventory_reservations
  FOR INSERT WITH CHECK (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_self_update"  ON inventory_reservations
  FOR UPDATE USING (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_staff_delete" ON inventory_reservations
  FOR DELETE USING (is_logistics_or_admin());
