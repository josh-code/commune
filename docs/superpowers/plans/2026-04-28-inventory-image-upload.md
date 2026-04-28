# Inventory Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `photo_url` text input on inventory item create/edit forms with a drag-and-drop image upload zone that compresses client-side and uploads to a public Supabase Storage bucket.

**Architecture:** A new public Supabase Storage bucket `item-photos` with RLS policies that restrict writes to logistics/admin. A reusable `ImageUpload` client component handles drag-and-drop, validates file type/size, compresses with the Canvas API to ≤ 1200px JPEG at quality 0.82, and uploads via the browser Supabase client. The new item create page is split into a server-shell + client-form pair (matching the existing edit page pattern). The update action receives `old_photo_url` and best-effort deletes the previous file from storage when the URL changes.

**Tech Stack:** Next.js 16.2.4 App Router, Supabase JS v2 (`@supabase/supabase-js` storage API + `@supabase/ssr` browser client), Canvas API + `createImageBitmap`, Vitest (unit), `crypto.randomUUID()` for client-side IDs (no extra library).

**Spec:** `docs/superpowers/specs/2026-04-28-inventory-image-upload-design.md`

---

## File Map

**Created:**
- `supabase/migrations/0007_item_photos_storage.sql` — storage bucket + RLS
- `src/lib/storage.ts` — pure `storagePathFromUrl` helper
- `tests/unit/storage.test.ts` — unit tests for the helper
- `src/components/inventory/ImageUpload.tsx` — drag-and-drop client component
- `src/app/(app)/inventory/manage/items/new/NewItemForm.tsx` — extracted client form

**Modified:**
- `src/app/(app)/inventory/manage/items/new/page.tsx` — server shell only, delegates to `NewItemForm`
- `src/app/(app)/inventory/manage/items/[id]/EditItemForm.tsx` — replace URL input with `ImageUpload`, add `old_photo_url` hidden field
- `src/app/(app)/inventory/manage/items/[id]/actions.ts` — `updateItemAction` deletes old file when URL changes

---

### Task 1: Storage Bucket Migration

**Files:**
- Create: `supabase/migrations/0007_item_photos_storage.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration**

Run: `cd "/Users/joshuaferndes/Code/Work Projects/Commune" && npx supabase db reset`

Expected: `Finished supabase db reset.` with no errors.

- [ ] **Step 3: Verify bucket exists and policies are present**

Run:
```bash
npx supabase db execute --local "SELECT id, public, file_size_limit FROM storage.buckets WHERE id='item-photos';"
npx supabase db execute --local "SELECT polname FROM pg_policy WHERE polname LIKE 'item_photos_%' ORDER BY polname;"
```

Expected:
- One row with `id=item-photos`, `public=t`, `file_size_limit=5242880`
- Three rows: `item_photos_staff_delete`, `item_photos_staff_insert`, `item_photos_staff_update`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_item_photos_storage.sql
git commit -m "feat: item-photos storage bucket with logistics/admin write policies"
```

---

### Task 2: Path Extraction Helper

**Files:**
- Create: `src/lib/storage.ts`

- [ ] **Step 1: Write the helper**

```ts
// src/lib/storage.ts

/**
 * Extracts the storage path from a Supabase public URL for the given bucket.
 * Returns null if the URL doesn't appear to belong to that bucket.
 *
 * Public URL format:
 *   https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
 *   http://127.0.0.1:54321/storage/v1/object/public/{bucket}/{path}
 */
export function storagePathFromUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length);
  return path.length > 0 ? path : null;
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: storagePathFromUrl helper for extracting bucket paths"
```

---

### Task 3: Unit Tests for Path Helper

**Files:**
- Create: `tests/unit/storage.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/unit/storage.test.ts
import { describe, it, expect } from "vitest";
import { storagePathFromUrl } from "@/lib/storage";

describe("storagePathFromUrl", () => {
  it("extracts the path from a production public URL", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/item-photos/items/123e4567-e89b-12d3-a456-426614174000.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBe("items/123e4567-e89b-12d3-a456-426614174000.jpg");
  });

  it("extracts the path from a local dev URL", () => {
    const url = "http://127.0.0.1:54321/storage/v1/object/public/item-photos/items/abc.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBe("items/abc.jpg");
  });

  it("returns null for a URL pointing at a different bucket", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/other-bucket/items/abc.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBeNull();
  });

  it("returns null for an unrelated URL", () => {
    expect(storagePathFromUrl("https://example.com/photo.jpg", "item-photos")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(storagePathFromUrl("", "item-photos")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(storagePathFromUrl(null, "item-photos")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(storagePathFromUrl(undefined, "item-photos")).toBeNull();
  });

  it("returns null when path portion is empty", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/item-photos/";
    expect(storagePathFromUrl(url, "item-photos")).toBeNull();
  });

  it("handles nested paths correctly", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/item-photos/items/sub/dir/file.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBe("items/sub/dir/file.jpg");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test tests/unit/storage.test.ts`

Expected: all 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/storage.test.ts
git commit -m "test: unit tests for storagePathFromUrl"
```

---

### Task 4: ImageUpload Component

**Files:**
- Create: `src/components/inventory/ImageUpload.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/inventory/ImageUpload.tsx
"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "item-photos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

type ImageUploadProps = {
  initialUrl?: string | null;
  onUpload: (url: string | null) => void;
  maxWidthPx?: number;
  quality?: number;
};

async function compressToJpeg(file: File, maxWidthPx: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const ratio = longest > maxWidthPx ? maxWidthPx / longest : 1;
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Image encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export function ImageUpload({
  initialUrl = null,
  onUpload,
  maxWidthPx = 1200,
  quality = 0.82,
}: ImageUploadProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("File must be an image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 5 MB.");
      return;
    }

    setBusy(true);
    try {
      const blob = await compressToJpeg(file, maxWidthPx, quality);
      const path = `items/${crypto.randomUUID()}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = data.publicUrl;
      setUrl(publicUrl);
      onUpload(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setUrl(null);
    setError(null);
    onUpload(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  if (url) {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-slate-600">Photo</div>
        <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Item photo" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={clear}
            className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm"
            aria-label="Remove photo"
          >
            <X className="w-3.5 h-3.5 text-slate-700" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-600">Photo (optional)</div>
      <label
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer transition-colors ${
          isDragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        } ${busy ? "opacity-60 cursor-wait" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            <span className="text-xs text-slate-500">Uploading…</span>
          </>
        ) : (
          <>
            <ImagePlus className="w-5 h-5 text-slate-400" />
            <span className="text-xs text-slate-500">Drop an image or click to browse</span>
          </>
        )}
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/ImageUpload.tsx
git commit -m "feat: ImageUpload component with drag-and-drop, compression, and Supabase upload"
```

---

### Task 5: Extract NewItemForm and Wire ImageUpload (Create Page)

**Files:**
- Create: `src/app/(app)/inventory/manage/items/new/NewItemForm.tsx`
- Modify: `src/app/(app)/inventory/manage/items/new/page.tsx`

- [ ] **Step 1: Create the client form component**

Write `src/app/(app)/inventory/manage/items/new/NewItemForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/inventory/ImageUpload";
import { createItemAction } from "./actions";

type Category = { id: string; name: string };

export function NewItemForm({ categories }: { categories: Category[] }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  return (
    <form action={createItemAction} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <input type="hidden" name="photo_url" value={photoUrl ?? ""} />

      <ImageUpload onUpload={setPhotoUrl} />

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Item name</label>
        <input type="text" name="name" required autoFocus className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Category</label>
        <select name="category_id" required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Description (optional)</label>
        <textarea name="description" rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
        <input type="checkbox" name="tracked_individually" className="rounded border-slate-300 text-indigo-600" />
        Tracked individually (each unit is unique, like Mic #1)
      </label>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Total quantity (ignored if tracked individually)</label>
        <input type="number" name="total_quantity" min="1" defaultValue="1" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Serial number (optional)</label>
        <input type="text" name="serial_number" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Condition</label>
        <select name="condition" defaultValue="good" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
          <option value="good">Good</option>
          <option value="needs_repair">Needs repair</option>
          <option value="out_of_service">Out of service</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Condition notes (optional)</label>
        <input type="text" name="condition_notes" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Location (optional)</label>
        <input type="text" name="location" placeholder="e.g. AV Room" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
        <input type="checkbox" name="approval_required" className="rounded border-slate-300 text-indigo-600" />
        Member reservations need approval
      </label>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
        <input type="checkbox" name="is_public" defaultChecked className="rounded border-slate-300 text-indigo-600" />
        Visible to members (their visibility also depends on the category)
      </label>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
        Create item
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Replace `page.tsx` with a thin server shell**

Replace the entire contents of `src/app/(app)/inventory/manage/items/new/page.tsx` with:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewItemForm } from "./NewItemForm";

export default async function NewItemPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("id, name")
    .order("order");

  if (!categories || categories.length === 0) {
    redirect("/inventory/manage/categories");
  }

  return (
    <div className="max-w-md">
      <Link href="/inventory/manage/items" className="text-sm text-slate-500 hover:text-slate-900">← Items</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">New item</h1>
      <NewItemForm categories={categories} />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript and build**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/inventory/manage/items/new/NewItemForm.tsx \
        src/app/\(app\)/inventory/manage/items/new/page.tsx
git commit -m "feat: replace photo URL input with ImageUpload on create form"
```

---

### Task 6: Wire ImageUpload into EditItemForm

**Files:**
- Modify: `src/app/(app)/inventory/manage/items/[id]/EditItemForm.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/app/(app)/inventory/manage/items/[id]/EditItemForm.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ImageUpload } from "@/components/inventory/ImageUpload";
import { deleteItemAction, updateItemAction } from "./actions";

type Category = { id: string; name: string };
type Item = {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  tracked_individually: boolean;
  total_quantity: number;
  serial_number: string | null;
  condition: "good" | "needs_repair" | "out_of_service";
  condition_notes: string | null;
  approval_required: boolean;
  location: string | null;
  is_public: boolean;
  photo_url: string | null;
};

export function EditItemForm({ item, categories }: { item: Item; categories: Category[] }) {
  const [isPending, startTransition] = useTransition();
  const [photoUrl, setPhotoUrl] = useState<string | null>(item.photo_url);

  return (
    <>
      <form action={updateItemAction.bind(null, item.id)} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <input type="hidden" name="photo_url" value={photoUrl ?? ""} />
        <input type="hidden" name="old_photo_url" value={item.photo_url ?? ""} />

        <ImageUpload initialUrl={item.photo_url} onUpload={setPhotoUrl} />

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Item name</label>
          <input type="text" name="name" required defaultValue={item.name} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" required defaultValue={item.category_id} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Description</label>
          <textarea name="description" rows={2} defaultValue={item.description ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="tracked_individually" defaultChecked={item.tracked_individually} className="rounded border-slate-300 text-indigo-600" />
          Tracked individually
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Total quantity</label>
          <input type="number" name="total_quantity" min="1" defaultValue={item.total_quantity} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Serial number</label>
          <input type="text" name="serial_number" defaultValue={item.serial_number ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition</label>
          <select name="condition" defaultValue={item.condition} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition notes</label>
          <input type="text" name="condition_notes" defaultValue={item.condition_notes ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Location</label>
          <input type="text" name="location" defaultValue={item.location ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="approval_required" defaultChecked={item.approval_required} className="rounded border-slate-300 text-indigo-600" />
          Member reservations need approval
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="is_public" defaultChecked={item.is_public} className="rounded border-slate-300 text-indigo-600" />
          Visible to members
        </label>

        <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Save
        </button>
      </form>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Delete "${item.name}"? This is only allowed if no active reservations exist.`)) return;
          startTransition(async () => {
            await deleteItemAction(item.id);
          });
        }}
        className="mt-4 text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
      >
        Delete item
      </button>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/inventory/manage/items/\[id\]/EditItemForm.tsx
git commit -m "feat: replace photo URL input with ImageUpload on edit form"
```

---

### Task 7: Update Action — Old File Cleanup

**Files:**
- Modify: `src/app/(app)/inventory/manage/items/[id]/actions.ts`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/app/(app)/inventory/manage/items/[id]/actions.ts` with:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromUrl } from "@/lib/storage";

const PHOTO_BUCKET = "item-photos";

export async function updateItemAction(id: string, formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();

  const name              = (formData.get("name") as string)?.trim();
  const description       = (formData.get("description") as string)?.trim() || null;
  const categoryId        = formData.get("category_id") as string;
  const trackedIndividually = formData.get("tracked_individually") === "on";
  const totalQuantity     = trackedIndividually ? 1 : Math.max(1, Number(formData.get("total_quantity") ?? "1"));
  const serialNumber      = (formData.get("serial_number") as string)?.trim() || null;
  const condition         = (formData.get("condition") as "good" | "needs_repair" | "out_of_service") ?? "good";
  const conditionNotes    = (formData.get("condition_notes") as string)?.trim() || null;
  const approvalRequired  = formData.get("approval_required") === "on";
  const location          = (formData.get("location") as string)?.trim() || null;
  const isPublic          = formData.get("is_public") === "on";
  const photoUrl          = (formData.get("photo_url") as string)?.trim() || null;
  const oldPhotoUrl       = (formData.get("old_photo_url") as string)?.trim() || null;

  if (!name || !categoryId) return;

  const supabase = await createClient();
  await supabase
    .from("inventory_items")
    .update({
      name,
      description,
      category_id: categoryId,
      tracked_individually: trackedIndividually,
      total_quantity: totalQuantity,
      serial_number: serialNumber,
      condition,
      condition_notes: conditionNotes,
      approval_required: approvalRequired,
      location,
      is_public: isPublic,
      photo_url: photoUrl,
    })
    .eq("id", id);

  if (oldPhotoUrl && oldPhotoUrl !== photoUrl) {
    const oldPath = storagePathFromUrl(oldPhotoUrl, PHOTO_BUCKET);
    if (oldPath) {
      await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    }
  }

  revalidatePath(`/inventory/manage/items/${id}`);
  revalidatePath("/inventory/manage/items");
}

export async function deleteItemAction(id: string): Promise<void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("inventory_reservations")
    .select("id", { count: "exact", head: true })
    .eq("item_id", id)
    .in("status", ["pending", "approved", "checked_out"]);

  if (count && count > 0) return;

  const { data: item } = await supabase
    .from("inventory_items")
    .select("photo_url")
    .eq("id", id)
    .single();

  await supabase.from("inventory_items").delete().eq("id", id);

  if (item?.photo_url) {
    const path = storagePathFromUrl(item.photo_url, PHOTO_BUCKET);
    if (path) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    }
  }

  redirect("/inventory/manage/items");
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 3: Run all unit tests**

Run: `pnpm test`

Expected: all tests pass (existing inventory + csv + invites + recurring + rostering + new storage).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/inventory/manage/items/\[id\]/actions.ts
git commit -m "feat: delete old photo from storage when item photo changes or item is deleted"
```

---

### Task 8: Manual Smoke Test

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

Open in browser: `http://localhost:3000`

- [ ] **Step 2: Sign in as a logistics or admin user**

Navigate to `/inventory/manage/items`. The "New item" button should be visible.

- [ ] **Step 3: Test the create flow with image**

1. Click "New item"
2. Drag any JPG/PNG (under 5 MB) onto the photo zone
3. Verify spinner appears, then preview replaces the zone
4. Fill name + category + click "Create item"
5. Verify the item detail page shows the photo

- [ ] **Step 4: Test the edit flow with replacement**

1. Open the item just created
2. The existing photo should be visible immediately (no re-upload)
3. Drop a different image onto the upload zone
4. Verify the new preview appears
5. Save the form
6. Verify the new photo shows on the detail page
7. Run: `npx supabase db execute --local "SELECT name FROM storage.objects WHERE bucket_id='item-photos' ORDER BY created_at DESC LIMIT 5;"`
8. Verify the old file is gone (only the new path appears)

- [ ] **Step 5: Test the clear flow**

1. Open the item again
2. Click the × on the photo preview
3. The drop zone should reappear
4. Save the form
5. Verify the detail page no longer shows a photo
6. Run the storage query from Step 4 again — verify the file is gone

- [ ] **Step 6: Test validation errors**

1. New item form: try to drop a non-image file (e.g. a `.pdf`) — verify error "File must be an image."
2. Try to drop a >5 MB image — verify error "Image must be under 5 MB."

- [ ] **Step 7: Verify category visibility constraint still works**

The member catalogue at `/inventory` should show the photo for items in public categories with `is_public=true`. Open `/inventory` as a member and confirm the new item is visible with its photo.

---

## Self-Review Notes

**Spec coverage check:**
- §1 Storage Setup → Task 1 ✓
- §2 ImageUpload Component (props, behaviour, edit mode) → Task 4 ✓
- §3 Integration: create form → Task 5 ✓
- §3 Integration: edit form → Task 6 ✓
- §4 Server-side cleanup on update → Task 7 ✓
- §4 Path extraction helper → Task 2 + Task 3 ✓
- §5 File list matches Tasks 1, 2, 4, 5, 6, 7 ✓

**Type consistency:**
- `ImageUploadProps` matches between component (Task 4) and call sites (Tasks 5, 6).
- `storagePathFromUrl(url, bucket)` signature matches between definition (Task 2), tests (Task 3), and consumer (Task 7).
- `BUCKET = "item-photos"` constant referenced in both Task 4 (component) and Task 7 (action via `PHOTO_BUCKET`).

**Bonus:** Task 7 also cleans up the photo when the item is deleted entirely (not in spec, but the same cleanup logic applies and prevents orphans).
