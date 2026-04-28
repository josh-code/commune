# Projection Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-service "Projection Brief" surface where the rostered Speaker submits sermon title, notes, Bible verse references, and file attachments, and the Media team views/uses them for projection slides.

**Architecture:** Three new tables (`service_briefs`, `brief_verses`, `brief_attachments`) + `brief-attachments` public Supabase Storage bucket. Lazy-fetch-then-insert pattern in the server shell creates a brief on first visit (without overwriting existing data). Submit fires a SECURITY DEFINER RPC that flips `sermon_submitted_at` and inserts notifications for Media + Admin atomically. Status (`pending | complete | late`) is computed at view time, never stored.

**Tech Stack:** Next.js 16.2.4 App Router (`params` is `Promise<{}>`), Supabase JS v2 SSR, Vitest, Tailwind CSS, Lucide icons, Canvas API for image compression, `useOptimistic` for mutations.

**Dependencies:** This plan depends on Plan C (`notifications` table) being merged first. The `notifications` table is referenced by the `notify_brief_submitted` RPC.

---

## File Map

**Created:**
- `supabase/migrations/0009_projection_brief.sql` — tables, RLS, helper functions, RPC, Preaching team + Speaker position seed, brief-attachments bucket
- `src/lib/bible-structure.ts` — static `BIBLE_BOOKS` and `BIBLE_VERSIONS`
- `src/lib/brief.ts` — pure helpers (`computeBriefStatus`, `defaultDeadlineFor`, `formatVerseRef`, `storagePathFromBriefAttachmentUrl`)
- `tests/unit/brief.test.ts` — unit tests
- `src/components/brief/AttachmentUpload.tsx` — multi-format upload (PDF/image/Office)
- `src/components/brief/VerseInput.tsx` — verse picker (book/chapter/verse range/version)
- `src/app/(app)/brief/page.tsx` — index server shell
- `src/app/(app)/brief/[service_id]/page.tsx` — brief server shell
- `src/app/(app)/brief/[service_id]/BriefEditor.tsx` — client editor
- `src/app/(app)/brief/[service_id]/actions.ts` — all server actions

**Modified:**
- `src/types/database.ts` — 3 new tables + new RPC type
- `src/lib/auth.ts` — `requireBriefViewAccess`, `requireBriefEditAccess`, `isAdmin` exposed if needed
- `src/components/layout/Sidebar.tsx` — Brief nav item
- `src/components/layout/BottomTabs.tsx` — Brief tab
- `src/app/(app)/notifications/NotificationsList.tsx` — handle `brief_submitted` type

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0009_projection_brief.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0009_projection_brief.sql
-- Plan D: Projection Brief — Sermon submission

-- ── Preaching team + Speaker position seed ──────────────────────────────────

INSERT INTO teams (name, color)
SELECT 'Preaching', '#dc2626'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = 'Preaching');

INSERT INTO team_positions (team_id, name, "order")
SELECT t.id, 'Speaker', 0
  FROM teams t
 WHERE t.name = 'Preaching'
   AND NOT EXISTS (
     SELECT 1 FROM team_positions p WHERE p.team_id = t.id AND p.name = 'Speaker'
   );

-- ── Helper functions ────────────────────────────────────────────────────────

-- True if current user is admin OR in Media team
CREATE OR REPLACE FUNCTION is_media_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid() AND t.name = 'Media'
    );
$$;

-- True if current user is the rostered Speaker for the given service
-- (i.e., rostered to a Preaching team's "Speaker" position for that service)
CREATE OR REPLACE FUNCTION is_service_speaker(sid uuid) RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM roster_slots rs
      JOIN team_positions tp ON tp.id = rs.position_id
      JOIN teams t ON t.id = tp.team_id
     WHERE rs.service_id = sid
       AND rs.profile_id = auth.uid()
       AND t.name = 'Preaching'
       AND tp.name = 'Speaker'
  );
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE service_briefs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id            uuid        NOT NULL UNIQUE REFERENCES services(id) ON DELETE CASCADE,
  sermon_title          text,
  sermon_notes          text,
  default_bible_version text        NOT NULL DEFAULT 'NIV',
  deadline              timestamptz NOT NULL,
  sermon_submitted_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brief_verses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id         uuid NOT NULL REFERENCES service_briefs(id) ON DELETE CASCADE,
  book             text NOT NULL,
  chapter          int  NOT NULL CHECK (chapter >= 1),
  verse_start      int  NOT NULL CHECK (verse_start >= 1),
  verse_end        int  CHECK (verse_end IS NULL OR verse_end >= verse_start),
  version_override text,
  position         int  NOT NULL,
  UNIQUE (brief_id, position)
);

CREATE INDEX idx_brief_verses_brief ON brief_verses (brief_id, position);

CREATE TABLE brief_attachments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id    uuid        NOT NULL REFERENCES service_briefs(id) ON DELETE CASCADE,
  file_name   text        NOT NULL,
  file_url    text        NOT NULL,
  mime_type   text        NOT NULL,
  size_bytes  int         NOT NULL CHECK (size_bytes >= 0),
  uploaded_by uuid        NOT NULL REFERENCES profiles(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brief_attachments_brief ON brief_attachments (brief_id);

-- ── RLS — service_briefs ────────────────────────────────────────────────────

ALTER TABLE service_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brief_view" ON service_briefs
  FOR SELECT USING (is_media_or_admin() OR is_service_speaker(service_id));

CREATE POLICY "brief_insert" ON service_briefs
  FOR INSERT WITH CHECK (is_media_or_admin() OR is_service_speaker(service_id));

CREATE POLICY "brief_update" ON service_briefs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR is_service_speaker(service_id)
  );

CREATE POLICY "brief_admin_delete" ON service_briefs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── RLS — brief_verses ──────────────────────────────────────────────────────

ALTER TABLE brief_verses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verses_view" ON brief_verses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (is_media_or_admin() OR is_service_speaker(sb.service_id))
    )
  );

CREATE POLICY "verses_edit" ON brief_verses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (
           EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
           OR is_service_speaker(sb.service_id)
         )
    )
  );

-- ── RLS — brief_attachments ─────────────────────────────────────────────────

ALTER TABLE brief_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_view" ON brief_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (is_media_or_admin() OR is_service_speaker(sb.service_id))
    )
  );

CREATE POLICY "attachments_edit" ON brief_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM service_briefs sb
       WHERE sb.id = brief_id
         AND (
           EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
           OR is_service_speaker(sb.service_id)
         )
    )
  );

-- ── Storage: brief-attachments bucket ───────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('brief-attachments', 'brief-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Helper: parse "briefs/{brief_id}/..." prefix and check edit permission
CREATE OR REPLACE FUNCTION can_edit_brief_attachment(p_name text) RETURNS bool
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_brief_id  uuid;
  v_service   uuid;
BEGIN
  -- Path format: briefs/{uuid}/...
  IF p_name !~ '^briefs/[0-9a-f-]+/' THEN
    RETURN false;
  END IF;
  v_brief_id := substring(p_name FROM 'briefs/([0-9a-f-]+)/')::uuid;
  SELECT service_id INTO v_service FROM service_briefs WHERE id = v_brief_id;
  IF v_service IS NULL THEN
    RETURN false;
  END IF;
  RETURN
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR is_service_speaker(v_service);
END;
$$;

CREATE POLICY "brief_files_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'brief-attachments');

CREATE POLICY "brief_files_edit_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'brief-attachments'
    AND auth.uid() IS NOT NULL
    AND can_edit_brief_attachment(name)
  );

CREATE POLICY "brief_files_edit_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'brief-attachments' AND can_edit_brief_attachment(name)
  );

CREATE POLICY "brief_files_edit_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'brief-attachments' AND can_edit_brief_attachment(name)
  );

-- ── RPC: notify on submit ───────────────────────────────────────────────────
-- Inserts a notifications row for each Media member + each admin (deduped)
-- Returns count of recipients.

CREATE OR REPLACE FUNCTION notify_brief_submitted(p_brief_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_service_id   uuid;
  v_service_name text;
  v_service_date date;
  v_speaker_name text;
  v_count        int;
BEGIN
  -- Permission check: caller must be Speaker for the service or Admin
  SELECT sb.service_id INTO v_service_id
    FROM service_briefs sb WHERE sb.id = p_brief_id;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'brief not found';
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR is_service_speaker(v_service_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Service info for payload
  SELECT name, date INTO v_service_name, v_service_date
    FROM services WHERE id = v_service_id;

  -- Speaker name for payload
  SELECT trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    INTO v_speaker_name
    FROM roster_slots rs
    JOIN team_positions tp ON tp.id = rs.position_id
    JOIN teams t ON t.id = tp.team_id
    JOIN profiles p ON p.id = rs.profile_id
   WHERE rs.service_id = v_service_id
     AND t.name = 'Preaching'
     AND tp.name = 'Speaker'
   LIMIT 1;

  -- Insert notifications
  INSERT INTO notifications (recipient_id, type, payload)
  SELECT DISTINCT p.id,
                  'brief_submitted',
                  jsonb_build_object(
                    'brief_id',     p_brief_id,
                    'service_id',   v_service_id,
                    'service_name', v_service_name,
                    'service_date', v_service_date,
                    'speaker_name', coalesce(v_speaker_name, 'Speaker')
                  )
    FROM profiles p
   WHERE p.role = 'admin'
      OR p.id IN (
        SELECT tmp.profile_id
          FROM team_member_positions tmp
          JOIN teams t ON t.id = tmp.team_id
         WHERE t.name = 'Media'
      );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: applies cleanly. If storage policies fail in local Supabase, apply those four `CREATE POLICY` statements (and `can_edit_brief_attachment`) manually in the dashboard SQL editor.

- [ ] **Step 3: Verify tables and team seed**

```bash
supabase db execute --sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('service_briefs','brief_verses','brief_attachments') ORDER BY table_name;"
supabase db execute --sql "SELECT t.name, p.name FROM team_positions p JOIN teams t ON t.id = p.team_id WHERE t.name = 'Preaching';"
```

Expected: 3 tables; 1 row "Preaching | Speaker".

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_projection_brief.sql
git commit -m "feat: projection brief schema — service_briefs, brief_verses, brief_attachments, RPC, Preaching team"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add 3 table types**

Inside `public > Tables`, in alphabetical position (between `brief_*` is the right place — they sort first), add:

```typescript
      brief_attachments: {
        Row: {
          brief_id: string
          file_name: string
          file_url: string
          id: string
          mime_type: string
          size_bytes: number
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          brief_id: string
          file_name: string
          file_url: string
          id?: string
          mime_type: string
          size_bytes: number
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          brief_id?: string
          file_name?: string
          file_url?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          { foreignKeyName: "brief_attachments_brief_id_fkey"; columns: ["brief_id"]; referencedRelation: "service_briefs"; referencedColumns: ["id"] },
          { foreignKeyName: "brief_attachments_uploaded_by_fkey"; columns: ["uploaded_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      brief_verses: {
        Row: {
          book: string
          brief_id: string
          chapter: number
          id: string
          position: number
          verse_end: number | null
          verse_start: number
          version_override: string | null
        }
        Insert: {
          book: string
          brief_id: string
          chapter: number
          id?: string
          position: number
          verse_end?: number | null
          verse_start: number
          version_override?: string | null
        }
        Update: {
          book?: string
          brief_id?: string
          chapter?: number
          id?: string
          position?: number
          verse_end?: number | null
          verse_start?: number
          version_override?: string | null
        }
        Relationships: [
          { foreignKeyName: "brief_verses_brief_id_fkey"; columns: ["brief_id"]; referencedRelation: "service_briefs"; referencedColumns: ["id"] }
        ]
      }
      service_briefs: {
        Row: {
          created_at: string
          deadline: string
          default_bible_version: string
          id: string
          sermon_notes: string | null
          sermon_submitted_at: string | null
          sermon_title: string | null
          service_id: string
        }
        Insert: {
          created_at?: string
          deadline: string
          default_bible_version?: string
          id?: string
          sermon_notes?: string | null
          sermon_submitted_at?: string | null
          sermon_title?: string | null
          service_id: string
        }
        Update: {
          created_at?: string
          deadline?: string
          default_bible_version?: string
          id?: string
          sermon_notes?: string | null
          sermon_submitted_at?: string | null
          sermon_title?: string | null
          service_id?: string
        }
        Relationships: [
          { foreignKeyName: "service_briefs_service_id_fkey"; columns: ["service_id"]; referencedRelation: "services"; referencedColumns: ["id"] }
        ]
      }
```

- [ ] **Step 2: Add the RPC type**

Inside `public > Functions`, add (or update if `is_media_or_admin` exists):

```typescript
      is_media_or_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_service_speaker: {
        Args: { sid: string }
        Returns: boolean
      }
      notify_brief_submitted: {
        Args: { p_brief_id: string }
        Returns: number
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add brief tables and RPC types"
```

---

### Task 3: Bible structure static data

**Files:**
- Create: `src/lib/bible-structure.ts`

- [ ] **Step 1: Create the file with the full data**

```typescript
// Static Bible book/chapter/verse-count structure. No external API used.
// Each book: chapters is an array of verse counts per chapter (length = number of chapters).

export type BibleBook = { name: string; chapters: number[] };

export const BIBLE_BOOKS: BibleBook[] = [
  { name: "Genesis",        chapters: [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26] },
  { name: "Exodus",         chapters: [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38] },
  { name: "Leviticus",      chapters: [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34] },
  { name: "Numbers",        chapters: [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13] },
  { name: "Deuteronomy",    chapters: [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12] },
  { name: "Joshua",         chapters: [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33] },
  { name: "Judges",         chapters: [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25] },
  { name: "Ruth",           chapters: [22,23,18,22] },
  { name: "1 Samuel",       chapters: [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13] },
  { name: "2 Samuel",       chapters: [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25] },
  { name: "1 Kings",        chapters: [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53] },
  { name: "2 Kings",        chapters: [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30] },
  { name: "1 Chronicles",   chapters: [54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30] },
  { name: "2 Chronicles",   chapters: [17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23] },
  { name: "Ezra",           chapters: [11,70,13,24,17,22,28,36,15,44] },
  { name: "Nehemiah",       chapters: [11,20,32,23,19,19,73,18,38,39,36,47,31] },
  { name: "Esther",         chapters: [22,23,15,17,14,14,10,17,32,3] },
  { name: "Job",            chapters: [22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17] },
  { name: "Psalms",         chapters: [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,9,5,8,8,11,12,8,7,12,15,11,5,12,11,8,38,22,8,11,4,16,9,8,5,12,8,8,9,11,16,8,2,11,29,4,8,8,11,6,7,9,16,5,15,10,10,9,12,8,17,4,10,18,11,9,12,12,12,10,18,7,8,8,8,6,4,8,12,15,11,9,5,11,11,5,17,5,9,12,7,11,21,7,9,10,16,16,7,9,7,9,9,9,16,5,17,176,7,8,9,4,7,5,6,5,6,5,6,8,9,4,8,5,7,8,8,8,7,5,6,9,2,7,7,5,9,5,3,3,5,5,3,3,4,6] },
  { name: "Proverbs",       chapters: [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31] },
  { name: "Ecclesiastes",   chapters: [18,26,22,16,20,12,29,17,18,20,10,14] },
  { name: "Song of Solomon",chapters: [17,17,11,16,16,13,13,14] },
  { name: "Isaiah",         chapters: [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24] },
  { name: "Jeremiah",       chapters: [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34] },
  { name: "Lamentations",   chapters: [22,22,66,22,22] },
  { name: "Ezekiel",        chapters: [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35] },
  { name: "Daniel",         chapters: [21,49,30,37,31,28,28,27,27,21,45,13] },
  { name: "Hosea",          chapters: [11,23,5,19,15,11,16,14,17,15,12,14,16,9] },
  { name: "Joel",           chapters: [20,32,21] },
  { name: "Amos",           chapters: [15,16,15,13,27,14,17,14,15] },
  { name: "Obadiah",        chapters: [21] },
  { name: "Jonah",          chapters: [17,10,10,11] },
  { name: "Micah",          chapters: [16,13,12,13,15,16,20] },
  { name: "Nahum",          chapters: [15,13,19] },
  { name: "Habakkuk",       chapters: [17,20,19] },
  { name: "Zephaniah",      chapters: [18,15,20] },
  { name: "Haggai",         chapters: [15,23] },
  { name: "Zechariah",      chapters: [21,13,10,14,11,15,14,23,17,12,17,14,9,21] },
  { name: "Malachi",        chapters: [14,17,18,6] },
  { name: "Matthew",        chapters: [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20] },
  { name: "Mark",           chapters: [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20] },
  { name: "Luke",           chapters: [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53] },
  { name: "John",           chapters: [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25] },
  { name: "Acts",           chapters: [26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31] },
  { name: "Romans",         chapters: [32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27] },
  { name: "1 Corinthians",  chapters: [31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24] },
  { name: "2 Corinthians",  chapters: [24,17,18,18,21,18,16,24,15,18,33,21,14] },
  { name: "Galatians",      chapters: [24,21,29,31,26,18] },
  { name: "Ephesians",      chapters: [23,22,21,32,33,24] },
  { name: "Philippians",    chapters: [30,30,21,23] },
  { name: "Colossians",     chapters: [29,23,25,18] },
  { name: "1 Thessalonians",chapters: [10,20,13,18,28] },
  { name: "2 Thessalonians",chapters: [12,17,18] },
  { name: "1 Timothy",      chapters: [20,15,16,16,25,21] },
  { name: "2 Timothy",      chapters: [18,26,17,22] },
  { name: "Titus",          chapters: [16,15,15] },
  { name: "Philemon",       chapters: [25] },
  { name: "Hebrews",        chapters: [14,18,19,16,14,20,28,13,28,39,40,29,25] },
  { name: "James",          chapters: [27,26,18,17,20] },
  { name: "1 Peter",        chapters: [25,25,22,19,14] },
  { name: "2 Peter",        chapters: [21,22,18] },
  { name: "1 John",         chapters: [10,29,24,21,21] },
  { name: "2 John",         chapters: [13] },
  { name: "3 John",         chapters: [14] },
  { name: "Jude",           chapters: [25] },
  { name: "Revelation",     chapters: [20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21] },
];

export const BIBLE_VERSIONS = ["NIV", "ESV", "KJV", "NKJV", "NLT", "AMP", "MSG"];

export function findBook(name: string): BibleBook | undefined {
  return BIBLE_BOOKS.find((b) => b.name === name);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/bible-structure.ts
git commit -m "feat: static Bible book/chapter/verse-count reference data"
```

---

### Task 4: Pure helpers + unit tests

**Files:**
- Create: `src/lib/brief.ts`
- Create: `tests/unit/brief.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/brief.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  computeBriefStatus,
  defaultDeadlineFor,
  formatVerseRef,
  storagePathFromBriefAttachmentUrl,
  type BriefStatus,
} from "@/lib/brief";

describe("computeBriefStatus", () => {
  it("returns 'complete' when sermon_submitted_at is set", () => {
    const status: BriefStatus = computeBriefStatus({
      sermon_submitted_at: "2026-04-29T10:00:00Z",
      deadline: "2026-04-25T23:59:00Z",
      now: new Date("2026-04-30T10:00:00Z"),
    });
    expect(status).toBe("complete");
  });
  it("returns 'late' when not submitted and deadline passed", () => {
    expect(computeBriefStatus({
      sermon_submitted_at: null,
      deadline: "2026-04-25T23:59:00Z",
      now: new Date("2026-04-30T10:00:00Z"),
    })).toBe("late");
  });
  it("returns 'pending' when not submitted and deadline future", () => {
    expect(computeBriefStatus({
      sermon_submitted_at: null,
      deadline: "2026-05-01T23:59:00Z",
      now: new Date("2026-04-29T10:00:00Z"),
    })).toBe("pending");
  });
});

describe("defaultDeadlineFor", () => {
  it("returns 4 days before service date at 23:59 (local time)", () => {
    // service is Sunday 2026-05-03 → deadline is Wednesday 2026-04-29 23:59
    const result = defaultDeadlineFor("2026-05-03");
    const d = new Date(result);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(29);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

describe("formatVerseRef", () => {
  it("single verse without override → uses default version", () => {
    expect(formatVerseRef({
      book: "John", chapter: 3, verse_start: 16, verse_end: null, version_override: null,
    }, "NIV")).toBe("John 3:16 (NIV)");
  });
  it("verse range", () => {
    expect(formatVerseRef({
      book: "John", chapter: 3, verse_start: 16, verse_end: 17, version_override: null,
    }, "NIV")).toBe("John 3:16-17 (NIV)");
  });
  it("override beats default", () => {
    expect(formatVerseRef({
      book: "Romans", chapter: 8, verse_start: 28, verse_end: null, version_override: "ESV",
    }, "NIV")).toBe("Romans 8:28 (ESV)");
  });
});

describe("storagePathFromBriefAttachmentUrl", () => {
  const BASE = "https://abc.supabase.co/storage/v1/object/public/brief-attachments/";
  it("extracts the path", () => {
    expect(storagePathFromBriefAttachmentUrl(`${BASE}briefs/abc/file.pdf`))
      .toBe("briefs/abc/file.pdf");
  });
  it("throws on a different bucket URL", () => {
    expect(() => storagePathFromBriefAttachmentUrl(
      "https://abc.supabase.co/storage/v1/object/public/chord-sheets/x.pdf"
    )).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify the tests fail**

```bash
npx vitest run tests/unit/brief.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/brief'`.

- [ ] **Step 3: Implement `src/lib/brief.ts`**

```typescript
export type BriefStatus = "pending" | "complete" | "late";

export function computeBriefStatus(args: {
  sermon_submitted_at: string | null;
  deadline: string;
  now?: Date;
}): BriefStatus {
  const now = args.now ?? new Date();
  if (args.sermon_submitted_at) return "complete";
  if (new Date(args.deadline) < now) return "late";
  return "pending";
}

// Returns ISO timestamp 4 days before service date at 23:59 local time
export function defaultDeadlineFor(serviceDateIso: string): string {
  const d = new Date(serviceDateIso + "T00:00:00");
  d.setDate(d.getDate() - 4);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

export function formatVerseRef(
  v: {
    book: string;
    chapter: number;
    verse_start: number;
    verse_end: number | null;
    version_override: string | null;
  },
  defaultVersion: string,
): string {
  const range = v.verse_end ? `${v.verse_start}-${v.verse_end}` : `${v.verse_start}`;
  const version = v.version_override ?? defaultVersion;
  return `${v.book} ${v.chapter}:${range} (${version})`;
}

const ATTACHMENT_PREFIX = "/storage/v1/object/public/brief-attachments/";

export function storagePathFromBriefAttachmentUrl(url: string): string {
  const idx = url.indexOf(ATTACHMENT_PREFIX);
  if (idx === -1) throw new Error(`Not a brief-attachments URL: ${url}`);
  return url.slice(idx + ATTACHMENT_PREFIX.length);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/brief.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief.ts tests/unit/brief.test.ts
git commit -m "feat: brief helpers — computeBriefStatus, defaultDeadlineFor, formatVerseRef, storagePathFromBriefAttachmentUrl"
```

---

### Task 5: Auth helpers

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Append the helpers**

Add after the existing exports in `src/lib/auth.ts`:

```typescript
export async function requireBriefViewAccess(serviceId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;

  const supabase = await createClient();
  const [{ data: media }, { data: speaker }] = await Promise.all([
    supabase.rpc("is_media_or_admin"),
    supabase.rpc("is_service_speaker", { sid: serviceId }),
  ]);

  if (!media && !speaker) redirect("/dashboard");
  return user;
}

export async function requireBriefEditAccess(serviceId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;

  const supabase = await createClient();
  const { data: speaker } = await supabase.rpc("is_service_speaker", { sid: serviceId });
  if (!speaker) redirect("/dashboard");
  return user;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: requireBriefViewAccess and requireBriefEditAccess helpers"
```

---

### Task 6: VerseInput component

**Files:**
- Create: `src/components/brief/VerseInput.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import { BIBLE_BOOKS, BIBLE_VERSIONS, findBook } from "@/lib/bible-structure";

export type VerseValue = {
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  version_override: string | null;
};

type Props = {
  initial?: Partial<VerseValue>;
  onSubmit: (v: VerseValue) => void;
  submitLabel?: string;
};

export function VerseInput({ initial, onSubmit, submitLabel = "Add" }: Props) {
  const [book, setBook] = useState(initial?.book ?? "John");
  const [chapter, setChapter] = useState<number>(initial?.chapter ?? 1);
  const [vStart, setVStart] = useState<number>(initial?.verse_start ?? 1);
  const [vEnd, setVEnd] = useState<string>(
    initial?.verse_end != null ? String(initial.verse_end) : ""
  );
  const [version, setVersion] = useState<string>(initial?.version_override ?? "");
  const [error, setError] = useState<string | null>(null);

  const bookData = findBook(book);
  const maxChapter = bookData?.chapters.length ?? 1;
  const maxVerse = bookData && chapter >= 1 && chapter <= bookData.chapters.length
    ? bookData.chapters[chapter - 1]
    : 1;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!bookData) return setError("Pick a valid book.");
    if (chapter < 1 || chapter > maxChapter) {
      return setError(`Chapter must be 1–${maxChapter}.`);
    }
    if (vStart < 1 || vStart > maxVerse) {
      return setError(`Verse must be 1–${maxVerse}.`);
    }
    const endNum = vEnd ? parseInt(vEnd, 10) : null;
    if (endNum != null) {
      if (Number.isNaN(endNum) || endNum < vStart || endNum > maxVerse) {
        return setError(`End verse must be ${vStart}–${maxVerse}.`);
      }
    }

    onSubmit({
      book,
      chapter,
      verse_start: vStart,
      verse_end: endNum,
      version_override: version || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-12 gap-2">
        <select
          value={book}
          onChange={(e) => { setBook(e.target.value); setChapter(1); setVStart(1); setVEnd(""); }}
          className="col-span-5 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {BIBLE_BOOKS.map((b) => (
            <option key={b.name} value={b.name}>{b.name}</option>
          ))}
        </select>
        <input
          type="number" min={1} max={maxChapter} value={chapter}
          onChange={(e) => setChapter(parseInt(e.target.value, 10) || 1)}
          className="col-span-2 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <input
          type="number" min={1} max={maxVerse} value={vStart}
          onChange={(e) => setVStart(parseInt(e.target.value, 10) || 1)}
          className="col-span-2 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <input
          type="number" min={vStart} max={maxVerse} value={vEnd} placeholder="end"
          onChange={(e) => setVEnd(e.target.value)}
          className="col-span-3 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
      <div className="flex items-center gap-2">
        <select
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
        >
          <option value="">Use default version</option>
          {BIBLE_VERSIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button
          type="submit"
          className="ml-auto text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/brief/VerseInput.tsx
git commit -m "feat: VerseInput component with validation"
```

---

### Task 7: AttachmentUpload component

**Files:**
- Create: `src/components/brief/AttachmentUpload.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, Loader2 } from "lucide-react";

type Props = {
  briefId: string;
  onUploaded: (info: {
    file_name: string;
    file_url: string;
    mime_type: string;
    size_bytes: number;
  }) => void;
};

const BUCKET = "brief-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMG_EDGE = 1600;
const IMG_QUALITY = 0.85;

const ACCEPTED = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

async function compressImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", IMG_QUALITY),
  );
  return { blob, ext: "jpg" };
}

function extFromMime(mime: string, fallback: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.ms-powerpoint") return "ppt";
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return fallback;
}

export function AttachmentUpload({ briefId, onUploaded }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("File type not supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File must be 10 MB or smaller.");
      return;
    }

    setLoading(true);
    try {
      const isImage = file.type.startsWith("image/");
      let blob: Blob;
      let ext: string;
      let mime: string;

      if (isImage) {
        const compressed = await compressImage(file);
        blob = compressed.blob;
        ext = compressed.ext;
        mime = "image/jpeg";
      } else {
        blob = file;
        const fallback = file.name.split(".").pop() ?? "bin";
        ext = extFromMime(file.type, fallback);
        mime = file.type;
      }

      const path = `briefs/${briefId}/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: mime });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onUploaded({
        file_name: file.name,
        file_url: data.publicUrl,
        mime_type: mime,
        size_bytes: blob.size,
      });
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`w-full border-2 border-dashed rounded-lg px-4 py-6 flex flex-col items-center gap-2 transition-colors ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-slate-400"
        } disabled:opacity-50`}
      >
        {loading
          ? <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          : <Upload className="w-6 h-6 text-slate-400" />}
        <span className="text-xs text-slate-500">
          {loading ? "Uploading…" : "Drop a PDF, image, slide deck, or click to browse"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/brief/AttachmentUpload.tsx
git commit -m "feat: AttachmentUpload component — multi-format upload with image compression"
```

---

### Task 8: Brief server actions

**Files:**
- Create: `src/app/(app)/brief/[service_id]/actions.ts`

- [ ] **Step 1: Create the actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireBriefEditAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromBriefAttachmentUrl } from "@/lib/brief";

function pathFor(serviceId: string) {
  return `/brief/${serviceId}`;
}

async function loadServiceForBrief(supabase: Awaited<ReturnType<typeof createClient>>, briefId: string) {
  const { data } = await supabase
    .from("service_briefs")
    .select("service_id")
    .eq("id", briefId)
    .single();
  return data?.service_id ?? null;
}

export async function updateBriefDetailsAction(
  briefId: string,
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;
  await requireBriefEditAccess(serviceId);

  const sermonTitle = (formData.get("sermon_title") as string)?.trim() || null;
  const sermonNotes = (formData.get("sermon_notes") as string)?.trim() || null;
  const defaultBibleVersion =
    (formData.get("default_bible_version") as string)?.trim() || "NIV";

  await supabase
    .from("service_briefs")
    .update({
      sermon_title: sermonTitle,
      sermon_notes: sermonNotes,
      default_bible_version: defaultBibleVersion,
    })
    .eq("id", briefId);

  revalidatePath(pathFor(serviceId));
}

export async function addVerseAction(
  briefId: string,
  payload: {
    book: string;
    chapter: number;
    verse_start: number;
    verse_end: number | null;
    version_override: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;
  await requireBriefEditAccess(serviceId);

  const { data: maxRow } = await supabase
    .from("brief_verses")
    .select("position")
    .eq("brief_id", briefId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = maxRow && maxRow.length > 0 ? maxRow[0].position + 1 : 1;

  await supabase.from("brief_verses").insert({
    brief_id: briefId,
    position: nextPosition,
    book: payload.book,
    chapter: payload.chapter,
    verse_start: payload.verse_start,
    verse_end: payload.verse_end,
    version_override: payload.version_override,
  });

  revalidatePath(pathFor(serviceId));
}

export async function deleteVerseAction(verseId: string, serviceId: string): Promise<void> {
  await requireBriefEditAccess(serviceId);
  const supabase = await createClient();
  await supabase.from("brief_verses").delete().eq("id", verseId);
  revalidatePath(pathFor(serviceId));
}

export async function reorderVersesAction(
  briefId: string,
  serviceId: string,
  newOrderIds: string[],
): Promise<void> {
  await requireBriefEditAccess(serviceId);
  const supabase = await createClient();
  await Promise.all(
    newOrderIds.map((id, i) =>
      supabase.from("brief_verses").update({ position: i + 1 }).eq("id", id)
    ),
  );
  revalidatePath(pathFor(serviceId));
}

export async function addAttachmentAction(
  briefId: string,
  serviceId: string,
  payload: { file_name: string; file_url: string; mime_type: string; size_bytes: number },
): Promise<void> {
  const user = await requireBriefEditAccess(serviceId);
  const supabase = await createClient();
  await supabase.from("brief_attachments").insert({
    brief_id: briefId,
    file_name: payload.file_name,
    file_url: payload.file_url,
    mime_type: payload.mime_type,
    size_bytes: payload.size_bytes,
    uploaded_by: user.id,
  });
  revalidatePath(pathFor(serviceId));
}

export async function deleteAttachmentAction(
  attachmentId: string,
  serviceId: string,
): Promise<void> {
  await requireBriefEditAccess(serviceId);
  const supabase = await createClient();

  const { data: att } = await supabase
    .from("brief_attachments")
    .select("file_url")
    .eq("id", attachmentId)
    .single();

  if (att?.file_url) {
    try {
      const path = storagePathFromBriefAttachmentUrl(att.file_url);
      await supabase.storage.from("brief-attachments").remove([path]);
    } catch {}
  }

  await supabase.from("brief_attachments").delete().eq("id", attachmentId);
  revalidatePath(pathFor(serviceId));
}

export async function submitBriefAction(briefId: string): Promise<void> {
  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;
  await requireBriefEditAccess(serviceId);

  await supabase
    .from("service_briefs")
    .update({ sermon_submitted_at: new Date().toISOString() })
    .eq("id", briefId);

  await supabase.rpc("notify_brief_submitted", { p_brief_id: briefId });
  revalidatePath(pathFor(serviceId));
  revalidatePath("/brief");
}

export async function updateDeadlineAction(
  briefId: string,
  isoTimestamp: string,
): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin") return;

  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;

  await supabase
    .from("service_briefs")
    .update({ deadline: isoTimestamp })
    .eq("id", briefId);

  revalidatePath(pathFor(serviceId));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/brief/[service_id]/actions.ts"
git commit -m "feat: brief server actions — details, verses, attachments, submit, deadline"
```

---

### Task 9: BriefEditor client component

**Files:**
- Create: `src/app/(app)/brief/[service_id]/BriefEditor.tsx`

- [ ] **Step 1: Create the editor**

```typescript
"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Send, Trash2, FileText, Image as ImageIcon, GripVertical, Calendar } from "lucide-react";
import { BIBLE_VERSIONS } from "@/lib/bible-structure";
import { formatVerseRef, computeBriefStatus } from "@/lib/brief";
import { VerseInput } from "@/components/brief/VerseInput";
import { AttachmentUpload } from "@/components/brief/AttachmentUpload";
import {
  updateBriefDetailsAction,
  addVerseAction,
  deleteVerseAction,
  reorderVersesAction,
  addAttachmentAction,
  deleteAttachmentAction,
  submitBriefAction,
  updateDeadlineAction,
} from "./actions";

type Brief = {
  id: string;
  service_id: string;
  sermon_title: string | null;
  sermon_notes: string | null;
  default_bible_version: string;
  deadline: string;
  sermon_submitted_at: string | null;
};

type Verse = {
  id: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  version_override: string | null;
  position: number;
};

type Attachment = {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
};

type Props = {
  brief: Brief;
  initialVerses: Verse[];
  initialAttachments: Attachment[];
  canEdit: boolean;
  isAdmin: boolean;
};

type VerseOp =
  | { type: "remove"; id: string }
  | { type: "reorder"; ids: string[] };

type AttOp = { type: "remove"; id: string };

function reorderLocal(ids: string[], moved: string, targetIndex: number): string[] {
  const from = ids.indexOf(moved);
  if (from === -1) return ids;
  const result = [...ids];
  result.splice(from, 1);
  result.splice(targetIndex, 0, moved);
  return result;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function BriefEditor({ brief, initialVerses, initialAttachments, canEdit, isAdmin }: Props) {
  // Bind useOptimistic directly to the server-supplied props so revalidatePath
  // resets the baseline correctly. No intermediate useState.
  const [optimisticVerses, applyVerseOp] = useOptimistic(
    initialVerses,
    (current: Verse[], op: VerseOp) => {
      if (op.type === "remove") return current.filter((v) => v.id !== op.id);
      return op.ids
        .map((id) => current.find((v) => v.id === id))
        .filter((v): v is Verse => Boolean(v))
        .map((v, i) => ({ ...v, position: i + 1 }));
    },
  );
  const [optimisticAtts, applyAttOp] = useOptimistic(
    initialAttachments,
    (current: Attachment[], op: AttOp) => current.filter((a) => a.id !== op.id),
  );

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [showDeadline, setShowDeadline] = useState(false);
  const [deadline, setDeadline] = useState(brief.deadline);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const status = computeBriefStatus({
    sermon_submitted_at: brief.sermon_submitted_at,
    deadline: brief.deadline,
  });

  const deadlineDate = new Date(brief.deadline);
  const now = new Date();
  const msDiff = deadlineDate.getTime() - now.getTime();
  const daysDiff = Math.round(msDiff / (1000 * 60 * 60 * 24));
  const deadlineHint = brief.sermon_submitted_at
    ? `Submitted ${new Date(brief.sermon_submitted_at).toLocaleString()}`
    : daysDiff >= 0
      ? `${daysDiff} day${daysDiff === 1 ? "" : "s"} remaining`
      : `${-daysDiff} day${-daysDiff === 1 ? "" : "s"} late`;

  function handleDrop(targetVerseId: string) {
    if (!draggedId || draggedId === targetVerseId || !canEdit) return;
    const ids = optimisticVerses.map((v) => v.id);
    const targetIndex = ids.indexOf(targetVerseId);
    const newIds = reorderLocal(ids, draggedId, targetIndex);
    startTransition(() => {
      applyVerseOp({ type: "reorder", ids: newIds });
      reorderVersesAction(brief.id, brief.service_id, newIds);
    });
    setDraggedId(null);
  }

  return (
    <div className="space-y-8">
      {/* ── Status header ───────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {status === "complete" && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Complete</span>
            )}
            {status === "pending" && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
            )}
            {status === "late" && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Late</span>
            )}
            <span className="text-xs text-slate-500">{deadlineHint}</span>
          </div>
          <div className="text-xs text-slate-400">
            Deadline: {deadlineDate.toLocaleString()}
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowDeadline((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-1.5 rounded-lg"
          >
            <Calendar className="w-3.5 h-3.5" />
            Adjust deadline
          </button>
        )}
      </div>

      {showDeadline && (
        <form
          action={async () => {
            startTransition(async () => {
              await updateDeadlineAction(brief.id, new Date(deadline).toISOString());
              setShowDeadline(false);
            });
          }}
          className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-2"
        >
          <input
            type="datetime-local"
            value={new Date(deadline).toISOString().slice(0, 16)}
            onChange={(e) => setDeadline(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
          />
          <button
            type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setShowDeadline(false)}
            className="text-xs text-slate-500"
          >
            Cancel
          </button>
        </form>
      )}

      {/* ── Sermon details ──────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Sermon</h2>
        {canEdit ? (
          <form
            action={updateBriefDetailsAction.bind(null, brief.id)}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Title</label>
              <input
                type="text" name="sermon_title" defaultValue={brief.sermon_title ?? ""}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Notes</label>
              <textarea
                name="sermon_notes" defaultValue={brief.sermon_notes ?? ""} rows={4}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Default Bible version</label>
              <select
                name="default_bible_version" defaultValue={brief.default_bible_version}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
              >
                {BIBLE_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <button
              type="submit"
              className="text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
            >
              Save details
            </button>
          </form>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div>
              <div className="text-xs text-slate-500">Title</div>
              <div className="text-sm text-slate-900">{brief.sermon_title || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Notes</div>
              <div className="text-sm text-slate-900 whitespace-pre-wrap">{brief.sermon_notes || "—"}</div>
            </div>
            <div className="text-xs text-slate-500">Default version: {brief.default_bible_version}</div>
          </div>
        )}
      </section>

      {/* ── Verses ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Verses</h2>
        <ul className="space-y-2 mb-3">
          {optimisticVerses.map((v) => (
            <li
              key={v.id}
              draggable={canEdit}
              onDragStart={() => setDraggedId(v.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(v.id)}
              className={`flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 ${
                draggedId === v.id ? "opacity-50" : ""
              }`}
            >
              {canEdit && <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />}
              <span className="flex-1 text-sm text-slate-900">
                {formatVerseRef(v, brief.default_bible_version)}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      applyVerseOp({ type: "remove", id: v.id });
                      await deleteVerseAction(v.id, brief.service_id);
                    });
                  }}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <VerseInput
              onSubmit={(value) => {
                startTransition(async () => {
                  await addVerseAction(brief.id, value);
                });
              }}
            />
          </div>
        )}
      </section>

      {/* ── Attachments ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Attachments</h2>
        <ul className="space-y-2 mb-3">
          {optimisticAtts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2"
            >
              {a.mime_type.startsWith("image/")
                ? <ImageIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                : <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />}
              <a
                href={a.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm text-indigo-600 hover:text-indigo-800 truncate"
              >
                {a.file_name}
              </a>
              <span className="text-xs text-slate-400 flex-shrink-0">{fmtBytes(a.size_bytes)}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Remove "${a.file_name}"?`)) return;
                    startTransition(async () => {
                      applyAttOp({ type: "remove", id: a.id });
                      await deleteAttachmentAction(a.id, brief.service_id);
                    });
                  }}
                  className="text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <AttachmentUpload
            briefId={brief.id}
            onUploaded={(payload) => {
              startTransition(async () => {
                await addAttachmentAction(brief.id, brief.service_id, payload);
                // No optimistic add — revalidatePath in the server action
                // refreshes initialAttachments so the row appears next render.
              });
            }}
          />
        )}
      </section>

      {/* ── Submit ──────────────────────────────────────────── */}
      {canEdit && (
        <div>
          {submitMsg && (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">{submitMsg}</p>
          )}
          <button
            type="button"
            onClick={() => {
              if (!confirm(brief.sermon_submitted_at ? "Resubmit the brief?" : "Submit the brief?")) return;
              startTransition(async () => {
                await submitBriefAction(brief.id);
                setSubmitMsg(brief.sermon_submitted_at ? "Resubmitted." : "Submitted — Media team notified.");
              });
            }}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-amber-500 text-white px-4 py-3 rounded-xl hover:bg-amber-600"
          >
            <Send className="w-4 h-4" />
            {brief.sermon_submitted_at ? "Resubmit brief" : "Submit brief"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/brief/[service_id]/BriefEditor.tsx"
git commit -m "feat: BriefEditor client component with optimistic UI"
```

---

### Task 10: Brief page (server shell)

**Files:**
- Create: `src/app/(app)/brief/[service_id]/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBriefViewAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { defaultDeadlineFor } from "@/lib/brief";
import { BriefEditor } from "./BriefEditor";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ service_id: string }>;
}) {
  const { service_id } = await params;
  const user = await requireBriefViewAccess(service_id);
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select("id, name, date")
    .eq("id", service_id)
    .single();
  if (!service) notFound();

  // Lazy-fetch-then-insert (do not overwrite existing deadline on every load)
  let { data: brief } = await supabase
    .from("service_briefs")
    .select("*")
    .eq("service_id", service_id)
    .maybeSingle();

  if (!brief) {
    const { data: newBrief } = await supabase
      .from("service_briefs")
      .insert({
        service_id,
        deadline: defaultDeadlineFor(service.date),
        default_bible_version: "NIV",
      })
      .select("*")
      .single();
    brief = newBrief;
  }
  if (!brief) notFound();

  const [{ data: verses }, { data: attachments }, { data: speaker }] = await Promise.all([
    supabase
      .from("brief_verses")
      .select("id, book, chapter, verse_start, verse_end, version_override, position")
      .eq("brief_id", brief.id)
      .order("position"),
    supabase
      .from("brief_attachments")
      .select("id, file_name, file_url, mime_type, size_bytes")
      .eq("brief_id", brief.id)
      .order("uploaded_at"),
    supabase.rpc("is_service_speaker", { sid: service_id }),
  ]);

  const isAdmin = user.role === "admin";
  const canEdit = isAdmin || (speaker ?? false);

  const dateStr = new Date(service.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="max-w-2xl">
      <Link href="/brief" className="text-sm text-slate-500 hover:text-slate-900">← Briefs</Link>
      <div className="mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{service.name} — projection brief</h1>
        <div className="text-sm text-slate-500 mt-0.5">{dateStr}</div>
      </div>

      <BriefEditor
        brief={brief}
        initialVerses={verses ?? []}
        initialAttachments={attachments ?? []}
        canEdit={canEdit}
        isAdmin={isAdmin}
      />
    </div>
  );
}
```

- [ ] **Step 2: Test the page in browser**

Pick a service ID where you (admin) are testing:

```bash
supabase db execute --sql "SELECT id, name, date FROM services LIMIT 3;"
```

Visit `http://localhost:3000/brief/{id}`. Expected: page loads with empty fields, deadline set to 4 days before service at 23:59. As admin, all editor sections are visible.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/brief/[service_id]/page.tsx"
git commit -m "feat: brief server page with lazy upsert"
```

---

### Task 11: Brief index page

**Files:**
- Create: `src/app/(app)/brief/page.tsx`

- [ ] **Step 1: Create the index**

```typescript
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeBriefStatus } from "@/lib/brief";
import { FileText } from "lucide-react";

export default async function BriefIndexPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: services }, { data: briefs }, { data: speakerSlots }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, date")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(30),
    supabase
      .from("service_briefs")
      .select("service_id, deadline, sermon_submitted_at"),
    // Speaker for each upcoming service via Preaching team's Speaker position
    supabase
      .from("roster_slots")
      .select(`
        service_id,
        profile:profile_id ( first_name, last_name ),
        team_positions!inner ( name, teams!inner ( name ) )
      `)
      .eq("team_positions.name", "Speaker")
      .eq("team_positions.teams.name", "Preaching")
      .gte("status", "unassigned"),
  ]);

  const briefByService = new Map<string, { deadline: string; sermon_submitted_at: string | null }>();
  for (const b of briefs ?? []) briefByService.set(b.service_id, b);

  const speakerByService = new Map<string, string>();
  for (const s of (speakerSlots ?? []) as any[]) {
    if (s.profile) {
      speakerByService.set(
        s.service_id,
        `${s.profile.first_name ?? ""} ${s.profile.last_name ?? ""}`.trim() || "—",
      );
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Projection briefs</h1>

      {!services || services.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No upcoming services.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => {
            const b = briefByService.get(s.id);
            const speakerName = speakerByService.get(s.id) ?? "Speaker not assigned";
            const status = b
              ? computeBriefStatus({
                  sermon_submitted_at: b.sermon_submitted_at,
                  deadline: b.deadline,
                })
              : "pending";
            const date = new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
            });
            return (
              <li key={s.id}>
                <Link
                  href={`/brief/${s.id}`}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{date} · {speakerName}</div>
                  </div>
                  {status === "complete" && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Complete</span>
                  )}
                  {status === "pending" && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
                  )}
                  {status === "late" && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Late</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

Note: The `services.id` query above doesn't filter by view access — the RLS policies on `service_briefs` already gate which briefs the user can see. Speakers will only see briefs for their services because `is_service_speaker(service_id)` is checked at SELECT time. Media + Admin see all.

For now, the index lists *all* upcoming services regardless of brief access. Following list rows that the user can't visit will redirect them. Acceptable for v1; future plan can refine to hide unauthorized rows.

- [ ] **Step 2: Test in browser**

Visit `http://localhost:3000/brief`. Expected: list of upcoming services with status badges. Click any row → loads brief page (or redirects if unauthorized).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/brief/page.tsx"
git commit -m "feat: brief index page with status badges"
```

---

### Task 12: Nav update

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomTabs.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Add `FileText` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  ClipboardList,
  Boxes,
  Wrench,
  Music,
  UtensilsCrossed,
  FileText,
} from "lucide-react";
```

In `NAV_ITEMS`, add the Brief item after Hospitality:

```typescript
  { href: "/brief", label: "Brief", icon: FileText },
```

- [ ] **Step 2: Update BottomTabs.tsx**

Add `FileText` to the lucide-react import:

```typescript
import { LayoutDashboard, Boxes, Calendar, Settings, Wrench, Music, UtensilsCrossed, FileText } from "lucide-react";
```

In the `tabs` array, add Brief:

```typescript
  const tabs = [
    { href: "/dashboard",     label: "Home",        icon: LayoutDashboard },
    { href: "/inventory",     label: "Inventory",   icon: Boxes },
    { href: "/schedule",      label: "Schedule",    icon: Calendar },
    { href: "/worship/songs", label: "Songs",       icon: Music },
    { href: "/hospitality",   label: "Hospitality", icon: UtensilsCrossed },
    { href: "/brief",         label: "Brief",       icon: FileText },
    ...(role === "admin"
      ? [{ href: "/admin",            label: "Admin",  icon: Settings }]
      : role === "logistics"
      ? [{ href: "/inventory/manage", label: "Manage", icon: Wrench }]
      : []),
  ];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/BottomTabs.tsx
git commit -m "feat: add Brief to sidebar and bottom nav"
```

---

### Task 13: Notifications list — handle brief_submitted

**Files:**
- Modify: `src/app/(app)/notifications/NotificationsList.tsx`

- [ ] **Step 1: Add a branch for brief_submitted in `renderNotification`**

Open `src/app/(app)/notifications/NotificationsList.tsx`. Find the `renderNotification` function. Replace its body with:

```typescript
function renderNotification(n: Notification) {
  if (n.type === "hospitality_order_requested") {
    const p = n.payload as {
      service_id: string;
      service_name: string;
      service_date: string;
      item_count: number;
    };
    return {
      title: `Hospitality requested ${p.item_count} item${p.item_count === 1 ? "" : "s"}`,
      subtitle: `For ${p.service_name} (${p.service_date})`,
      href: `/hospitality/services/${p.service_id}`,
    };
  }
  if (n.type === "brief_submitted") {
    const p = n.payload as {
      brief_id: string;
      service_id: string;
      service_name: string;
      service_date: string;
      speaker_name: string;
    };
    return {
      title: `${p.speaker_name} submitted the brief`,
      subtitle: `For ${p.service_name} (${p.service_date})`,
      href: `/brief/${p.service_id}`,
    };
  }
  return { title: n.type, subtitle: "", href: "/notifications" };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/notifications/NotificationsList.tsx"
git commit -m "feat: notifications list handles brief_submitted type"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run unit tests**

```bash
npx vitest run
```

Expected: all tests pass — 9 new from `brief.test.ts` plus existing.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Smoke-test full flow**

```bash
npm run dev
```

As admin:
1. `/brief` — see list of upcoming services with status badges
2. Click a service → brief page loads
3. Add sermon title "Test Sermon" + notes "Some notes" → save
4. Add a verse "John 3:16" — appears in list
5. Add a verse "Romans 8:28" with version override "ESV" — appears as "Romans 8:28 (ESV)"
6. Drag to reorder → succeeds
7. Upload a small PDF → appears in attachments
8. Click "Submit brief" → confirm → status flips to Complete; success message shown
9. Bell icon shows new notification
10. `/notifications` shows "{your name} submitted the brief — For {service} ({date})"
11. Click notification → returns to brief page
12. Click "Adjust deadline" → datetime picker → save → deadline updated

- [ ] **Step 4: Commit any post-integration fixes**

```bash
git add -p
git commit -m "fix: post-integration tweaks for projection brief"
```
