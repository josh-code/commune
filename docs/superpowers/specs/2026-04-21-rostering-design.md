# Rostering Design

**Date:** 2026-04-21
**Plan:** 03 — Rostering

---

## Goal

Build the full rostering module for Commune: team & position management, service creation, a grid-based roster builder, and a member-facing schedule page with confirm/decline and unavailability marking.

---

## Visual Design System

Inherits the design system from Plan 02 (white base, slate greys, indigo accent `#6366f1`). Team cards in the roster builder use each team's `color` field for their header tint.

---

## Architecture

### New routes

| Route | Who | Description |
|---|---|---|
| `/roster` | Admin | Service list — create, view draft/published/completed |
| `/roster/new` | Admin | Create a new service (name, date, type) |
| `/roster/[id]` | Admin | Service detail + roster builder grid |
| `/schedule` | All users | My upcoming assignments + confirm/decline + unavailability |
| `/admin/teams` | Admin | Team list with position/member counts |
| `/admin/teams/[id]` | Admin | Team detail — manage positions and member assignments |

### Extended routes

| Route | Change |
|---|---|
| `/dashboard` | Add "Upcoming assignments" section (next 3 slots with confirm/decline) |
| `/admin` | Add Teams card alongside Invite and Import |
| `/people/[id]` | Teams tab shows position + team_role instead of flat team chips |

### New source files

```
src/app/(app)/roster/
  page.tsx                  — service list
  new/
    page.tsx                — create service form
  [id]/
    page.tsx                — service detail (server wrapper)
    RosterBuilder.tsx       — client component: team grid + draft state
    actions.ts              — saveDraftAction, publishAction, completeAction

src/app/(app)/schedule/
  page.tsx                  — my assignments + unavailability
  actions.ts                — confirmAction, declineAction, markUnavailableAction

src/app/(app)/admin/teams/
  page.tsx                  — team list
  [id]/
    page.tsx                — team detail
    actions.ts              — addPosition, updatePositionOrder, deletePosition,
                              assignMember, updateMemberRole, removeMember

supabase/migrations/
  0004_rostering.sql        — new tables + drop member_teams
```

### Modified source files

```
src/app/(app)/dashboard/page.tsx      — add upcoming assignments section
src/app/(app)/admin/page.tsx          — add Teams card
src/app/(app)/people/[id]/page.tsx    — rewrite Teams tab
src/app/(app)/people/[id]/actions.ts  — update addTeam/removeTeam to use team_member_positions
src/components/layout/Sidebar.tsx     — enable Roster nav item, add Schedule nav item
src/components/layout/BottomTabs.tsx  — update tabs (4 tabs: Home · People · Schedule · Admin)
src/types/database.ts                 — regenerate from updated schema
```

---

## Database Changes

### New tables

```sql
-- Positions within a team
CREATE TABLE team_positions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  "order"    int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, name)
);

-- Member assigned to a position within a team
CREATE TABLE team_member_positions (
  profile_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id    uuid        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  position_id uuid       NOT NULL REFERENCES team_positions(id) ON DELETE CASCADE,
  team_role  text        NOT NULL DEFAULT 'member' CHECK (team_role IN ('leader', 'member')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, position_id)
);

-- Church services
CREATE TABLE services (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  date       date        NOT NULL,
  type       text        NOT NULL DEFAULT 'regular_sunday'
               CHECK (type IN ('regular_sunday', 'special_event')),
  status     text        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'completed')),
  created_by uuid        NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One member assigned to one position for one service
CREATE TABLE roster_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES services(id)       ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES teams(id)          ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES team_positions(id) ON DELETE CASCADE,
  profile_id  uuid          REFERENCES profiles(id)       ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'unassigned'
                CHECK (status IN ('unassigned', 'pending', 'confirmed', 'declined')),
  notified_at  timestamptz,
  responded_at timestamptz,
  UNIQUE (service_id, position_id)
);

-- Member marks themselves unavailable for a specific service
CREATE TABLE service_unavailability (
  profile_id uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, service_id)
);

-- Swap requests (data model only — UI deferred)
CREATE TABLE swap_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_slot_id          uuid NOT NULL REFERENCES roster_slots(id) ON DELETE CASCADE,
  requester_id            uuid NOT NULL REFERENCES profiles(id),
  proposed_replacement_id uuid          REFERENCES profiles(id),
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at              timestamptz NOT NULL DEFAULT now()
);
```

### Migration from Plan 02

`member_teams` is dropped. Team membership is now derived from `team_member_positions` — a member is on a team if they have at least one row there. All queries that read `member_teams` are rewritten in the same migration.

### RLS policies

- `team_positions`: authenticated read; admin all
- `team_member_positions`: authenticated read; admin all
- `services`: authenticated read; admin insert/update/delete
- `roster_slots`: member reads own slots (`profile_id = auth.uid()`), admin reads all; admin insert/update/delete
- `service_unavailability`: member read/insert/delete own rows; admin read all
- `swap_requests`: member read/insert own rows; admin read all

---

## Navigation Shell

### Sidebar (desktop)

Updated nav items:
- Dashboard
- People
- **Schedule** (new — all users) → `/schedule`
- **Roster** (was disabled — now enabled, admin-only) → `/roster`
- Admin (admin-only)

### BottomTabs (mobile)

4 tabs to keep mobile clean: **Home · People · Schedule · Admin**. Roster is accessible via the Admin hub on mobile.

---

## Team Management

### `/admin/teams`

List of all teams. Each row: colour swatch, team name, position count, member count, "Manage →" link. No create/delete team UI in this plan — the 5 seeded teams are sufficient. Team creation/deletion is deferred.

### `/admin/teams/[id]`

Two sections:

**Positions**
Ordered list of positions for this team. Admin can:
- Add a position (inline text input, saves on enter/blur)
- Reorder via up/down buttons (updates `order` column)
- Delete a position — blocked with an error message if any `roster_slots` reference it

**Members**
Table of all members in `team_member_positions` for this team. Columns: Avatar + Name · Position · Team Role · Actions.
- Add member — modal: pick from active members not already assigned to this team, pick position, pick team role (Leader / Member)
- Change role — inline dropdown toggling Leader ↔ Member
- Remove member — blocked if they have future published `roster_slots` for this team (show a message listing the conflicting services)

### `/admin` hub update

Add a Teams card (alongside existing Invite and Import cards):
- Icon: `Users` (lucide)
- Title: "Manage teams"
- Description: "Set up teams, positions, and member assignments"
- Links to `/admin/teams`

### Profile page — Teams tab

Rewritten to show `team_member_positions` data:
- Each row: team colour chip + team name · position name · role badge (Leader / Member)
- Admin can still add/remove from here — "Add to team" button opens the same modal as `/admin/teams/[id]` (pick team → pick position → pick role)
- Members see read-only

---

## Services

### `/roster`

Service list in three groups:
- **Upcoming** — draft and published services, ordered by date ascending
- **Past** — completed services, ordered by date descending, collapsed by default

Each row: date, service name, type badge, status badge (Draft / Published / Completed), filled/total slot count. "New service" button at top right.

### `/roster/new`

Form fields: Name (text), Date (date picker), Type (Regular Sunday / Special Event). Submits via server action → creates service in `draft` → redirects to `/roster/[id]`.

---

## Roster Builder

### `/roster/[id]`

Server component fetches:
- Service record
- All teams with their positions (from `team_positions`)
- All existing `roster_slots` for this service (slots are created lazily — only when a member is first assigned to a position, not upfront for every position)
- All `team_member_positions` (who is eligible for each position)
- All `service_unavailability` for this service (who has marked themselves off)

Passes all of this as props to `<RosterBuilder>`.

### `RosterBuilder.tsx` (client component)

State: `Map<positionId, profileId | null>` initialised from the server-fetched slots. Tracks whether state differs from the initial load ("unsaved changes" indicator).

**Layout:** 2-column grid of team cards on `md:` and up, single column on mobile.

**Team card:**
- Coloured header (team's `color` field tinted) with team name and filled/total counter
- One row per position:
  - If assigned: avatar initial + member name + × button to unassign (updates local state only)
  - If unassigned: dashed "+ Assign" button

**Assign dropdown (inline, not a modal):**
Clicking "+ Assign" expands an inline list of eligible members for that position (from `team_member_positions`). Each member shows:
- Green dot — not in `service_unavailability` for this service
- Red dot + strikethrough name + "unavailable" label — in `service_unavailability`; still clickable (admin can override)

Clicking a member name assigns them (updates local state, closes dropdown).

**Conflict detection (client-side):**
If a member is already assigned to another position in this service, show a warning inline: "Already assigned to [Position] — [Team]". Allow override.

**Page header actions:**
- **Save Draft** — calls `saveDraftAction(serviceId, assignments: {positionId, profileId}[])`. Receives only assigned slots; any existing slot not in the list has its `profile_id` set to null (unassigned). Clears "unsaved changes" indicator.
- **Publish Roster** — saves first (same as Save Draft), then sets service status to `published` and all assigned slot statuses to `pending`. Confirms with a dialog: "Publish roster for [Service Name]? Members will see their assignments immediately."
- **Mark Complete** (shown only on published services) — sets service status to `completed`.
- **Delete** (shown only on draft services) — deletes service + all its roster_slots. Confirms with a dialog.

---

## Member Schedule

### Dashboard — "Upcoming assignments" section

Shown only if the member has at least one upcoming published roster slot. Shows the next 3 slots:
- Service date + name
- Team + position
- Status badge: Pending (amber) / Confirmed (green) / Declined (red)
- Pending slots: Confirm and Decline buttons (call `confirmAction` / `declineAction`)

"View all →" link to `/schedule`.

### `/schedule`

**My assignments section**

All upcoming published roster slots for the logged-in user, grouped by service. Each slot shows service name, date, team, position, status badge. Pending slots have Confirm and Decline buttons.

Below upcoming: a collapsed "Past" section showing completed services with their final confirmed/declined/no-response status. This data also populates the History tab on the member's `/people/[id]` profile page.

**Mark unavailability section**

Titled "Services I can't make". Checklist of all upcoming services (draft and published) ordered by date. Checked = `service_unavailability` row exists for this member + service.

- Checking a service → `markUnavailableAction(serviceId)` → inserts row
- Unchecking → `markUnavailableAction(serviceId, false)` → deletes row

Warning shown if the member is already assigned to the checked service: "You're already rostered for this service — marking unavailable won't remove your assignment. Contact your admin."

### Server actions

```ts
// src/app/(app)/schedule/actions.ts
confirmAction(slotId)            // sets roster_slots.status = 'confirmed', responded_at = now()
declineAction(slotId)            // sets roster_slots.status = 'declined', responded_at = now()
markUnavailableAction(serviceId) // inserts row into service_unavailability
unmarkUnavailableAction(serviceId) // deletes row from service_unavailability
```

All three require the slot/service to belong to the calling user (enforced server-side, not just RLS).

---

## Testing

### Unit tests (Vitest)

- Conflict detection: same member assigned to two positions in the same service → warning message returned
- Unavailability warning: member assigned + marks unavailable → correct warning text
- Status transition guard: `publishAction` with zero assigned slots → returns error

### E2E tests (Playwright)

- Admin creates a team position, assigns a member → member visible in team members list
- Admin creates a service → redirected to roster builder, team cards visible
- Admin assigns members, saves draft → assignments persist on page reload
- Admin publishes roster → member sees assignment on dashboard with Confirm/Decline
- Member confirms → badge updates to Confirmed
- Member declines → badge updates to Declined
- Member marks a service unavailable → red dot on that member in roster builder for that service
- Member already assigned marks that service unavailable → warning message shown

---

## Out of Scope (deferred)

- Swap request UI (data model created, UI ships in a follow-on plan)
- WhatsApp notifications (Plan 07)
- Team creation / deletion UI (later plan)
- Extended profile fields: date_of_birth, gender, marital_status, emergency contacts (later plan)
- Worship setlist, hospitality needs, projection brief (Plan 04)
