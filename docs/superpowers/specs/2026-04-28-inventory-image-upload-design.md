# Inventory Item Image Upload — Design Spec

**Goal:** Allow logistics/admin users to attach a photo to each inventory item via a drag-and-drop upload zone, using Supabase Storage as the backend.

**Date:** 2026-04-28

---

## 1. Storage Setup

**Bucket:** `item-photos` (Supabase Storage), set to **public**.

Public read is handled by the bucket setting — no signed URLs needed for display. The `photo_url` stored in `inventory_items` is a plain public HTTPS URL.

**Storage RLS policies:**

| Operation | Policy |
|-----------|--------|
| SELECT | Open (public bucket) |
| INSERT | Authenticated + `is_logistics_or_admin()` |
| UPDATE | Authenticated + `is_logistics_or_admin()` |
| DELETE | Authenticated + `is_logistics_or_admin()` |

**File path pattern:** `items/{uuid}.{ext}`

A client-generated UUID is used per file. This avoids any dependency on the item ID, which does not exist yet at create time.

---

## 2. `ImageUpload` Component

**Location:** `src/components/inventory/ImageUpload.tsx` (shared by create and edit forms)

**Props:**
```ts
type ImageUploadProps = {
  initialUrl?: string | null;   // shown immediately in edit mode
  onUpload: (url: string | null) => void;
};
```

**Behaviour:**

1. Renders a dashed drag-and-drop zone with an upload icon and label. Also accepts click-to-browse.
2. On file drop/select:
   - Validates: type must be `image/*`, size must be ≤ 5 MB. Shows an inline error if invalid.
   - Uploads immediately to Supabase Storage (`item-photos/items/{uuid}.{ext}`).
   - Shows a spinner while the upload is in-flight.
3. On upload success: replaces the zone with a square image preview. An × button overlaid on the preview clears the selection (calls `onUpload(null)`).
4. Calls `onUpload(url)` whenever the URL changes (new upload or clear).

**Edit mode:** If `initialUrl` is provided, the component renders the preview immediately on mount — no re-upload. From that point, replacement and clearing work identically to create mode.

---

## 3. Integration Points

### Create form — `src/app/(app)/admin/inventory/items/new/page.tsx`

- `photo_url` state starts as `null`.
- `ImageUpload` renders at the top of the form.
- `onUpload` updates local state.
- The create server action receives `photo_url` (string or null) alongside all other fields.

### Edit form — `src/app/(app)/admin/inventory/items/[id]/EditItemForm.tsx`

- `initialUrl` is seeded from the item's current `photo_url`.
- A hidden input `old_photo_url` carries the original URL into the form submission.
- `onUpload` updates local state.

---

## 4. Server Action — Image Lifecycle on Update

The `updateItemAction` server action handles image cleanup:

```
if old_photo_url !== new photo_url:
  if old_photo_url is not null:
    extract storage path from old URL (strip Supabase public prefix)
    call supabase.storage.from('item-photos').remove([path])
  save new photo_url (may be null) to inventory_items
else:
  update other fields only (no storage operation)
```

**Path extraction:** The public URL format is:
```
https://{project}.supabase.co/storage/v1/object/public/item-photos/{path}
```
Strip everything up to and including `/item-photos/` to get the storage path.

**Timing:** Old files are never deleted eagerly on the client. Deletion only occurs inside the server action, so a cancelled form leaves no orphaned files.

---

## 5. Files Created / Modified

**Created:**
- `src/components/inventory/ImageUpload.tsx` — shared upload component

**Modified:**
- `src/app/(app)/admin/inventory/items/new/page.tsx` — add `ImageUpload`, pass `photo_url` to action
- `src/app/(app)/admin/inventory/items/new/actions.ts` — accept `photo_url` in create action
- `src/app/(app)/admin/inventory/items/[id]/EditItemForm.tsx` — add `ImageUpload` with `initialUrl`, hidden `old_photo_url`
- `src/app/(app)/admin/inventory/items/[id]/actions.ts` — add cleanup logic to update action
- `supabase/migrations/` — new migration to create `item-photos` bucket + storage policies

---

## 6. Out of Scope

- Image resizing or optimisation (store original)
- Multiple photos per item
- Member-side upload
- Bulk photo import
