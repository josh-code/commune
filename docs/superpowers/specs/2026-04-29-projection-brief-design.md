# Projection Brief — Design Spec

**Goal:** Give the rostered Speaker for each service a place to submit sermon title, notes, Bible verse references, and supporting file attachments. The Media team uses the brief alongside the worship setlist (Plan B) to prepare projection slides. Admin can adjust deadlines.

**Date:** 2026-04-29

---

## 1. Data Model

### `service_briefs`

One row per service, lazy-upserted on first visit.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| service_id | uuid → services ON DELETE CASCADE | UNIQUE |
| sermon_title | text | nullable |
| sermon_notes | text | nullable |
| default_bible_version | text | NOT NULL, default `'NIV'` |
| deadline | timestamptz | NOT NULL, default `service.date − 4 days @ 23:59` |
| sermon_submitted_at | timestamptz | nullable |
| created_at | timestamptz | default now() |

### `brief_verses`

Bible references, multiple per brief. Drag-to-reorder via integer `position`.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| brief_id | uuid → service_briefs ON DELETE CASCADE | |
| book | text | e.g. `'John'`, validated against bible-structure |
| chapter | int | NOT NULL, ≥ 1 |
| verse_start | int | NOT NULL, ≥ 1 |
| verse_end | int | nullable — single verse if null |
| version_override | text | nullable — falls back to `default_bible_version` |
| position | int | NOT NULL, lower = earlier |
| | | UNIQUE (brief_id, position) |

### `brief_attachments`

Files attached to a brief.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| brief_id | uuid → service_briefs ON DELETE CASCADE | |
| file_name | text | original filename for display |
| file_url | text | public Supabase Storage URL |
| mime_type | text | e.g. `'application/pdf'` |
| size_bytes | int | |
| uploaded_by | uuid → profiles | |
| uploaded_at | timestamptz | default now() |

### Status (computed, not stored)

```
complete  ← sermon_submitted_at IS NOT NULL
late      ← sermon_submitted_at IS NULL AND deadline < now()
pending   ← otherwise
```

---

## 2. Routes & Pages

All under `/brief/`.

| Path | Purpose | Access |
|------|---------|--------|
| `/brief` | Index — upcoming services with brief status | Admin & Media see all; Speaker sees only their assignments |
| `/brief/[service_id]` | Brief editor / viewer | Admin + Media + the rostered Speaker |

### Index (`/brief`)

Lists upcoming services (where `services.date >= today`) sorted by `deadline` ascending. Each row shows:
- Service name + date
- Speaker name (from roster slot)
- Status badge (pending / complete / late)
- "X days remaining" or "Y days late"

A toggle reveals past services collapsed at the bottom.

### Brief page (`/brief/[service_id]`)

Server component upserts the `service_briefs` row on first visit. Client editor handles all subsequent mutations.

**Sections (vertical flow):**
1. **Header:** service name + date, deadline ("X days remaining" / "X days late"), status badge, "Adjust deadline" button (admin only)
2. **Sermon details:** title input, notes textarea, default Bible version dropdown
3. **Verses:** ordered list with drag-to-reorder, delete per row, "Add verse" form with book/chapter/verse-range/version-override
4. **Attachments:** drag-and-drop upload zone, list of uploaded files with download link + delete button
5. **Submit:** large primary "Submit brief" button (visible to Speaker + Admin); when already submitted, shows a "Resubmit" variant + the most recent submission timestamp

**Bible references UI:** uses `src/lib/bible-structure.ts` to populate book dropdown and validate chapter/verse ranges. Verse-range input enforces `verse_end >= verse_start` if `verse_end` provided.

---

## 3. Permissions

| Action | Who |
|--------|-----|
| View `/brief` index | Admin (all); Media (all); Speaker (own only) |
| View a specific brief | Admin; Media; rostered Speaker |
| Edit sermon fields, verses, attachments | Speaker; Admin |
| Submit / resubmit brief | Speaker; Admin |
| Adjust deadline | Admin only |
| Delete a brief | Admin only (rare) |

### DB helper functions

```sql
-- True if current user is admin
-- (already exists implicitly via profiles.role check)

-- True if current user is in the Media team OR admin
CREATE FUNCTION is_media_or_admin() RETURNS bool ...

-- True if current user is the rostered Speaker for the given service
-- Speaker = profile rostered to a Preaching team's "Speaker" position for that service
CREATE FUNCTION is_service_speaker(sid uuid) RETURNS bool ...
```

### Auth helper

```typescript
// src/lib/auth.ts
async function requireBriefViewAccess(serviceId: string): Promise<SessionUser>
async function requireBriefEditAccess(serviceId: string): Promise<SessionUser>
```

`requireBriefEditAccess` allows Speaker + Admin. `requireBriefViewAccess` allows Speaker + Media + Admin.

### Seed data

A new **Preaching** team is seeded with color `#dc2626` (red) and a default `Speaker` position with `order = 0`.

---

## 4. Storage & File Lifecycle

**Bucket:** `brief-attachments` (Supabase Storage, **public**)

**Path pattern:** `briefs/{brief_id}/{uuid}.{ext}`

**Limits:**
- 10 MB per file (enforced client-side; server confirms via storage RLS check on size)
- No total-per-brief limit for v1

**Accepted MIME types:**
- `application/pdf`
- `image/*` (JPEG, PNG, WebP, GIF)
- `application/vnd.ms-powerpoint`
- `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Compression:** images are resized client-side (longest edge 1600px) and re-encoded as JPEG at quality 0.85 — same Canvas API approach as Plan A. PDFs / Office files upload as-is.

**Storage RLS:**

| Op | Policy |
|----|--------|
| SELECT | Open (public bucket) |
| INSERT | Authenticated AND user can edit the brief at `briefs/{brief_id}/...` |
| UPDATE | Same |
| DELETE | Same |

The path-based check uses a SECURITY DEFINER function `can_edit_brief_attachment(name text)` that parses the `briefs/{brief_id}/...` prefix and validates against `is_service_speaker(brief.service_id) OR admin`.

**Cleanup:**
- Deleting a `brief_attachments` row also removes the underlying storage file inside the server action (using `storagePathFromBriefAttachmentUrl`).
- When a `service_briefs` row is deleted (admin-only, rare), all attachment rows cascade and the server action pre-deletes all files.

A new shared component `src/components/brief/AttachmentUpload.tsx` handles upload UX. Mirrors `ChordSheetUpload` from Plan B but:
- Accepts the wider MIME list above
- Compresses images, passes through other types unchanged
- Renders an icon + filename + size for non-image attachments instead of a thumbnail

---

## 5. Submission & Notification Workflow

### Auto-create

On first visit to `/brief/[service_id]`:
```
INSERT INTO service_briefs (service_id, deadline, default_bible_version)
VALUES ($1, ($service.date - INTERVAL '4 days')::date + TIME '23:59', 'NIV')
ON CONFLICT (service_id) DO NOTHING
RETURNING id;
```

The deadline is computed once at creation. Subsequent visits do not modify it (admin-only deadline edits go through a dedicated action).

### Editing

Each section has its own server action — fine-grained for clean revalidation:
- `updateBriefDetails(briefId, formData)` — title, notes, default version
- `addVerse(briefId, formData)`
- `updateVerse(verseId, formData)`
- `deleteVerse(verseId, briefId)`
- `reorderVerses(briefId, ids[], draggedId, targetIndex)`
- `addAttachment(briefId, formData)` — called after client-side upload, persists row
- `deleteAttachment(attachmentId, briefId)` — deletes storage file + row
- `updateDeadlineAction(briefId, isoTimestamp)` — admin only

All actions call `requireBriefEditAccess(serviceId)` (or the admin-only equivalent for deadline) before any DB mutation.

### Submitting

```typescript
// submitBriefAction(briefId)
1. Resolve brief.service_id → check requireBriefEditAccess
2. UPDATE service_briefs SET sermon_submitted_at = now() WHERE id = briefId
3. Call RPC notify_brief_submitted(briefId)
4. revalidatePath(`/brief/${serviceId}`) and `/brief`
```

The RPC `notify_brief_submitted(p_brief_id uuid)`:
1. Loads service info (name, date) and speaker name (joins through roster_slots)
2. Inserts one `notifications` row per recipient where recipient = admins ∪ Media team members
3. Each row: `type = 'brief_submitted'`, payload `{ brief_id, service_id, service_name, service_date, speaker_name }`

### Resubmission

Identical flow — sets `sermon_submitted_at = now()` again, fires fresh notification. No flag distinguishes initial vs. follow-up submission; the Media team simply sees a new notification.

### Late detection

Status `late` is computed at view time. No background job creates late notifications (no cron infrastructure available). The index page renders late items with a red badge.

---

## 6. RLS Policies

```sql
-- service_briefs
ALTER TABLE service_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brief_view" ON service_briefs
  FOR SELECT USING (
    is_media_or_admin() OR is_service_speaker(service_id)
  );
CREATE POLICY "brief_insert" ON service_briefs
  FOR INSERT WITH CHECK (
    is_media_or_admin() OR is_service_speaker(service_id)
  );
CREATE POLICY "brief_update" ON service_briefs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR is_service_speaker(service_id)
  );
CREATE POLICY "brief_admin_delete" ON service_briefs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- brief_verses
ALTER TABLE brief_verses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verses_view" ON brief_verses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM service_briefs sb
            WHERE sb.id = brief_id
              AND (is_media_or_admin() OR is_service_speaker(sb.service_id)))
  );
CREATE POLICY "verses_edit" ON brief_verses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM service_briefs sb
            WHERE sb.id = brief_id
              AND (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
                   OR is_service_speaker(sb.service_id)))
  );

-- brief_attachments
ALTER TABLE brief_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments_view" ON brief_attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM service_briefs sb
            WHERE sb.id = brief_id
              AND (is_media_or_admin() OR is_service_speaker(sb.service_id)))
  );
CREATE POLICY "attachments_edit" ON brief_attachments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM service_briefs sb
            WHERE sb.id = brief_id
              AND (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
                   OR is_service_speaker(sb.service_id)))
  );
```

Storage RLS uses `can_edit_brief_attachment(name)` as described in §4.

---

## 7. Files Created / Modified

**Created:**
- `supabase/migrations/0009_projection_brief.sql` — tables, RLS, helper functions, RPC, Preaching team + Speaker position seed, brief-attachments bucket + storage RLS
- `src/lib/bible-structure.ts` — static `BIBLE_BOOKS` and `BIBLE_VERSIONS`
- `src/lib/brief.ts` — pure helpers (`computeBriefStatus`, `defaultDeadlineFor`, `formatVerseRef`, `storagePathFromBriefAttachmentUrl`)
- `tests/unit/brief.test.ts` — unit tests for helpers
- `src/components/brief/AttachmentUpload.tsx` — multi-format upload component
- `src/components/brief/VerseInput.tsx` — book/chapter/verse picker
- `src/app/(app)/brief/page.tsx` — index server shell
- `src/app/(app)/brief/[service_id]/page.tsx` — brief server shell
- `src/app/(app)/brief/[service_id]/BriefEditor.tsx` — client editor
- `src/app/(app)/brief/[service_id]/actions.ts` — all server actions

**Modified:**
- `src/types/database.ts` — 3 new tables + new RPC types
- `src/lib/auth.ts` — `requireBriefViewAccess`, `requireBriefEditAccess`
- `src/components/layout/Sidebar.tsx` — Brief nav item
- `src/components/layout/BottomTabs.tsx` — Brief tab
- `src/app/(app)/notifications/NotificationsList.tsx` — handle `brief_submitted` notification type

---

## 8. Out of Scope

- Bible API integration (references only — full text never fetched or stored)
- Sermon series tracking
- Worship-side submission on the brief (worship info lives entirely in setlists per Plan B)
- Late notifications (no cron infrastructure)
- Pre-deadline reminders (same — needs cron)
- Real-time collaborative editing
- Brief templates / clone-from-previous-week
- Member-side brief visibility
- Markdown rendering of sermon notes (plain text for now; users can paste-and-go)
- Bulk attachment download / zip
