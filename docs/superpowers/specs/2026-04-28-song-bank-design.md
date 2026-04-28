# Song Bank & Setlists — Design Spec

**Goal:** Give worship leaders, admins, and media team members a shared song library with versioned arrangements, chord sheet uploads, and a per-service setlist editor with drag-to-reorder and key history reminders.

**Date:** 2026-04-28

---

## 1. Data Model

### `songs`

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | NOT NULL |
| created_by | uuid → profiles | |
| created_at | timestamptz | default now() |

### `song_versions`

One song can have multiple arrangements. Each version has its own artist, key, tempo, and optional chord sheet.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| song_id | uuid → songs ON DELETE CASCADE | |
| label | text | e.g. "Original", "Acoustic" |
| artist | text | nullable |
| is_original | boolean | default false — at most one per song |
| written_key | text | key the chord sheet is written in, e.g. "G", "Eb" |
| tempo | integer | BPM, nullable |
| chord_sheet_url | text | nullable — public Supabase Storage URL |
| created_by | uuid → profiles | |
| created_at | timestamptz | default now() |

### `setlists`

One setlist per service, lazy-created on first visit (upsert on `service_id`).

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| service_id | uuid → services | UNIQUE |
| created_at | timestamptz | default now() |

### `setlist_songs`

A song entry within a setlist.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| setlist_id | uuid → setlists ON DELETE CASCADE | |
| song_version_id | uuid → song_versions | |
| position | integer | ordering — lower = earlier in service |
| played_key | text | key chosen for this service (may differ from written_key) |
| notes | text | nullable — per-song notes for this service |
| added_by | uuid → profiles | |

---

## 2. Storage

**Bucket:** `chord-sheets` (Supabase Storage, **public**)

**File path pattern:** `songs/{song_version_uuid}.{ext}` — ext is `pdf`, `jpg`, or `png`

Public read is handled by the bucket setting. The `chord_sheet_url` stored in `song_versions` is a plain public HTTPS URL.

**Storage RLS policies:**

| Operation | Policy |
|-----------|--------|
| SELECT | Open (public bucket) |
| INSERT | Authenticated + worship leader, admin, or media team member |
| UPDATE | Authenticated + worship leader, admin, or media team member |
| DELETE | Authenticated + worship leader, admin, or media team member |

**Cleanup:** When a version's chord sheet is replaced or the version is deleted, the old file is removed from storage inside the server action — same cleanup pattern as `item-photos`. Old files are never deleted eagerly from the client.

---

## 3. Permissions

| Action | Who |
|--------|-----|
| View song bank | Any authenticated user |
| Add songs & versions | Worship leader, Admin, Media team member |
| Edit songs & versions | Worship leader, Admin, Media team member |
| Delete a song or version | Admin only |
| View setlist for a service | Worship team + Media team rostered to that service |
| Edit setlist (add/remove/reorder/key) | The single worship leader rostered to that service |

**Worship leader identity:** The profile in the Worship team with `team_role = 'leader'` in `roster_slots` for that specific service. Exactly one per service.

**Media team:** Members of the team named "Media" in `teams`. Media team members can add/edit songs but cannot edit setlists.

---

## 4. Routes

All routes under `/worship/` — accessible to authenticated users; write actions server-checked per role.

| Path | Purpose |
|------|---------|
| `/worship/songs` | Song bank — searchable list of all songs with version count |
| `/worship/songs/new` | Create a new song + first version |
| `/worship/songs/[id]` | Song detail — all versions, chord sheet download/preview |
| `/worship/songs/[id]/versions/new` | Add a new version to an existing song |
| `/worship/setlist/[service_id]` | Setlist editor for a service |

---

## 5. Setlist Editor

**Access control:** Any authenticated user reaching `/worship/setlist/[service_id]` can view the setlist if they are on the Worship team or Media team rostered to that service. Edit controls (add, remove, reorder, key picker) are only shown to the rostered worship leader.

**Setlist creation:** On page load, the server upserts a `setlists` row for `service_id` — no separate creation step.

**Reordering:** Drag-to-reorder using HTML5 drag-and-drop (no external library). On drop, a server action updates the `position` values for affected rows in a single batch.

**Adding a song:** A slide-out picker lists all songs with a search field. Each song card shows:
- Song name, artist (from the original version if set)
- Version count
- **Your last key:** the `played_key` from the most recent `setlist_songs` entry where this worship leader led a service containing this song
- **Last used:** the `played_key` from the most recent `setlist_songs` entry for this song across all services (any leader)

Both hints are fetched in a single query joining `setlist_songs → setlists → services → roster_slots`. If no history exists the hint is omitted.

When the leader selects a song, they choose a version from a dropdown and set the `played_key` (pre-filled from the most recent own-history key, falling back to `written_key`).

---

## 6. Files Created / Modified

**Created:**
- `src/components/worship/ImageUploadChordSheet.tsx` — chord sheet upload (PDF/image), reuses same Canvas + Supabase pattern as `ImageUpload.tsx` but accepts PDF passthrough without compression
- `src/app/(app)/worship/songs/page.tsx` — song bank list
- `src/app/(app)/worship/songs/new/page.tsx` — new song form
- `src/app/(app)/worship/songs/new/actions.ts` — create song + version server action
- `src/app/(app)/worship/songs/[id]/page.tsx` — song detail
- `src/app/(app)/worship/songs/[id]/versions/new/page.tsx` — add version form
- `src/app/(app)/worship/songs/[id]/versions/new/actions.ts` — create version server action
- `src/app/(app)/worship/setlist/[service_id]/page.tsx` — setlist editor server shell
- `src/app/(app)/worship/setlist/[service_id]/SetlistEditor.tsx` — client component (drag-to-reorder, song picker)
- `src/app/(app)/worship/setlist/[service_id]/actions.ts` — upsert setlist, add/remove/reorder songs
- `supabase/migrations/` — new migration: songs, song_versions, setlists, setlist_songs tables + chord-sheets bucket + RLS policies

**Modified:**
- `src/app/(app)/layout.tsx` (or nav component) — add "Worship" nav section

---

## 7. Out of Scope

- Public-facing setlist display (member app)
- Setlist history / version tracking
- Song tags or genre categorisation
- Audio playback or YouTube embedding
- Multi-service setlist copying
- Notifications to team members when setlist is published
