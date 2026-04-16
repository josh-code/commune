# People Management Design

**Date:** 2026-04-17
**Plan:** 02 — People Management

---

## Goal

Build the full people management module for Commune: a member directory, individual profile pages, an improved invite flow, and CSV bulk import — all wrapped in the app-wide adaptive navigation shell that all future plans will inherit.

---

## Visual Design System

Established during brainstorming. Applies to all screens in this plan and all future plans.

- **Palette:** White base (`#ffffff`), slate greys (`#f8fafc`, `#f1f5f9`, `#e2e8f0`, `#64748b`), indigo accent (`#6366f1`)
- **Navigation:** Adaptive — sidebar on `md:` and up, bottom tab bar on mobile
- **People list:** Avatar list (coloured initial, name, role/team, status badge)
- **Profile page:** Full dedicated page with tabs (Details, Teams, History)

---

## Architecture

### New routes

| Route | Description |
|---|---|
| `/people` | Member directory (people list) |
| `/people/[id]` | Full profile page |
| `/admin/import` | CSV bulk import |

### Extended routes

| Route | Change |
|---|---|
| `/admin/invites` | Add phone + team multi-select to invite form |
| `/dashboard` | Sits inside the new AppShell |

### New source files

```
src/components/layout/
  AppShell.tsx        — root wrapper, conditionally renders Sidebar or BottomTabs
  Sidebar.tsx         — desktop fixed left nav (240px, collapsible to 64px)
  BottomTabs.tsx      — mobile fixed bottom nav (4 tabs)

src/app/(app)/
  people/
    page.tsx          — people list
    [id]/
      page.tsx        — profile page
  admin/
    import/
      page.tsx        — CSV import UI
      actions.ts      — bulk create server action
```

### Database changes

**New tables:**

```sql
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE member_teams (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, team_id)
);
```

**Profiles table — new columns:**

```sql
ALTER TABLE profiles ADD COLUMN phone   text;
ALTER TABLE profiles ADD COLUMN address text;
ALTER TABLE profiles ADD COLUMN bio     text;
```

**RLS policies:**
- `teams`: authenticated users can read; admins can insert/update/delete
- `member_teams`: authenticated users can read; admins can insert/delete
- `profiles` new columns: members can update their own `phone`, `address`, `bio`; role/status remain admin-only

---

## Navigation Shell

`AppShell` is the new root layout for all `(app)` routes, replacing the bare wrapper. It renders both `Sidebar` and `BottomTabs`; CSS controls which is visible.

### Desktop Sidebar (`md:` and up)

- Fixed left, 240px wide
- Collapsible to 64px icon-only mode (toggle button at bottom)
- **Top:** Commune wordmark + church name
- **Middle nav items:** Dashboard · People · Roster (disabled, Plan 3) · Admin (admin-only)
- **Bottom:** User avatar + display name + Sign out button
- Active route: indigo background pill on the nav item
- Route detection: reads `usePathname()` — no extra state

### Mobile Bottom Tabs (below `md:`)

- Fixed bottom, 4 tabs: Home · People · Roster · Admin
- Icon + label; active tab in indigo
- Admin tab hidden for non-admin users → 3-tab layout
- `padding-bottom` accounts for iOS safe area inset

### Permission gating

Shell reads `user.role` from the session (already available via `requireUser()`). Admin-only nav items simply aren't rendered for members.

---

## People List (`/people`)

### Layout

Avatar list — each row:
```
[Coloured initial avatar]  [Full name]           [Status badge]
                           [Role · Team name]
```

### Features

- **Search bar** — client-side filter on name as you type (`useState` + `useMemo`)
- **Filter chips** — All / Active / On Leave / Invited
- **Teams dropdown** — filter by team membership
- **"Invite member" button** — admin-only, links to `/admin/invites`
- Rows are `<Link>` to `/people/[id]`
- Data fetched server-side on page load; no pagination (suitable up to ~500 members)

### Data query

```sql
SELECT p.*, array_agg(t.name) AS team_names
FROM profiles p
LEFT JOIN member_teams mt ON mt.profile_id = p.id
LEFT JOIN teams t ON t.id = mt.team_id
WHERE p.status != 'left'
GROUP BY p.id
ORDER BY p.full_name;
```

---

## Profile Page (`/people/[id]`)

### Header

- Large coloured initial avatar (48px)
- Full name, role badge, status badge
- "Edit" button — shown to admins (all fields) and to the member themselves (limited fields)

### Tabs

**Details**
- Email (always read-only — tied to auth)
- Phone, address, bio — editable by the member themselves and by admins
- Joined date (read-only)

**Teams**
- List of team badges
- Admin sees a "+" button to add teams (dropdown of all teams) and "×" to remove
- Members see read-only

**History**
- Placeholder: "Roster history will appear here once rostering is set up (Plan 3)."
- Tab exists and is visible; content is deferred

### Admin-only actions (visible on any profile when viewer is admin)

- **Status** dropdown: Active / On Leave / Left
- **Role** dropdown: Member / Logistics / Admin
- **Remove member** button: sets status to `left`, does not delete the row

### Edit permissions

| Field | Member (own profile) | Admin (any profile) |
|---|---|---|
| Email | Read-only | Read-only |
| Phone / Address / Bio | Editable | Editable |
| Role | Read-only | Editable |
| Status | Read-only | Editable |
| Teams | Read-only | Editable |

---

## Invite Flow (`/admin/invites`)

Extends the existing page. New fields added to the invite form:

- **Phone** — optional text input
- **Teams** — multi-select of all teams in the `teams` table

On submit, `sendInviteAction` is extended to:
1. Create `auth.users` + `profiles` row (with `phone`)
2. Insert rows into `member_teams` for each selected team
3. Generate invite token (existing logic)
4. Return copyable invite URL (existing behaviour)

---

## CSV Import (`/admin/import`)

### Expected format

```csv
name,email,phone,teams
Joshua Fernandes,josh@church.com,+61412345678,Worship|Sound
Sarah Mitchell,sarah@church.com,,Kids
```

- `teams` column is pipe-separated team names
- `phone` is optional
- Column order is flexible; headers are matched by name (case-insensitive)

### Flow

1. **Upload** — file input accepts `.csv`; parsed client-side with a lightweight parser (no library dependency — native `FileReader` + split)
2. **Preview** — table showing parsed rows; invalid rows highlighted (missing name or email)
3. **Confirm** — calls `bulkImportAction` server action
4. **Results** — "23 invited, 2 skipped (email already exists)"

### Server action (`bulkImportAction`)

For each valid row:
- Skip if email already exists in `profiles`
- Create `auth.users` entry + `profiles` row (status: `invited`)
- Insert `member_teams` rows for named teams (create team if it doesn't exist)
- Generate invite token (same logic as single invite)
- Collect result (created / skipped / invite URL)

Returns `{ created: number, skipped: string[] }` where `skipped` contains the emails that were duplicates.

**Invite URL handling:** After confirm, the results screen shows a table of all created members with their invite URLs. The admin can copy individual URLs or use a "Download as CSV" button to export `name, email, invite_url` for distribution outside the app.

---

## Testing

### Unit tests (Vitest)

- CSV parser: valid rows, duplicate detection, missing required fields, pipe-separated teams
- `bulkImportAction`: mock Supabase admin client, verify skip logic for existing emails

### E2E tests (Playwright)

- Admin invites a member with phone + team → member appears in people list with correct team badge
- Admin opens profile → changes status to "On Leave" → badge updates in list
- Member logs in → edits own phone → change persists on reload
- Member cannot see the edit button for role/status/teams fields
- CSV upload → preview shows correct row count → confirm → results show correct created/skipped counts

---

## Out of Scope (deferred to later plans)

- Roster history on the History tab (Plan 3)
- Team management UI — creating, editing, deleting teams (Plan 3)
- Member-facing directory (members browsing each other's profiles)
- Push notification preferences
- Profile photo upload
