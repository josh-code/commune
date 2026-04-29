-- supabase/migrations/0007_item_photos_storage.sql
-- Inventory item photos: public bucket, logistics/admin-only writes

-- ── Bucket ──────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-photos',
  'item-photos',
  true,
  5242880, -- 5 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── RLS — restrict writes to logistics/admin ────────────────────────────────
-- Public read is handled by bucket.public = true; no SELECT policy needed.

CREATE POLICY "item_photos_staff_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-photos' AND is_logistics_or_admin());

CREATE POLICY "item_photos_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'item-photos' AND is_logistics_or_admin())
  WITH CHECK (bucket_id = 'item-photos' AND is_logistics_or_admin());

CREATE POLICY "item_photos_staff_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'item-photos' AND is_logistics_or_admin());
