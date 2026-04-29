# Spreadsheet Roster View — Design Spec

**Goal:** Add a wide, scrollable spreadsheet view of the roster at `/roster/grid` that lets admins, roster_makers, and team leaders see who's serving when across many services and positions, with click-to-edit cells (services-as-rows orientation) and unavailability signals on the person picker.

**Date:** 2026-04-29

---

## 1. Profile Role Addition

A new `roster_maker` value is added to the `profile_role` enum. Roles become: `admin | member | logistics | librarian | roster_maker`.

Like Plan E's `librarian`, this requires its **own migration** because Postgres does not allow new enum values to be referenced in the same transaction in which they were added.

**Powers:** `roster_maker` has full read + edit access on the spreadsheet view (assign / unassign anyone to any position on any service). The role grants no other admin powers (member management, services CRUD, etc. remain admin-only).

The `SessionUser.role` TypeScript type union is widened. `Sidebar` and `BottomTabs` role props are widened correspondingly.

A new auth helper:
```typescript
async function requireRosterGridAccess(): Promise<{
  user: SessionUser;
  canEditAll: boolean;          // true for admin and roster_maker
  editableTeamIds: string[];    // team IDs where the user has team_role = 'leader'
}>
```

If the user is none of admin / roster_maker / any team leader, `redirect("/dashboard")`.

---

## 2. Routes & Pages

| Path | Purpose | Access |
|------|---------|--------|
| `/roster/grid` | Spreadsheet roster view | Admin + roster_maker + any team leader |

**Header bar (sticky):**
- **Date range picker:** two `<input type="date">` fields. Defaults: today → today + 56 days. Persisted in URL search params `?start=YYYY-MM-DD&end=YYYY-MM-DD`.
- **Orientation toggle:** "Services as rows" / "People as rows". Persisted in `localStorage` key `roster-grid-orientation`. Default = `"services"`.
- **Team filter:** multi-select chips listing every team. Default = all teams selected. Filtering hides position columns / person rows belonging to deselected teams.
- **Edit mode toggle:** off by default. Hidden if the user has no editable cells.
- **Legend:** small chip key for the cell badges used in the picker — see §4.

**Grid (services-as-rows):**
- Sticky left column: service date + name + status badge
- Sticky top row: team name (spanning its position columns) on row 1; position names on row 2
- Cells: each `(service, position)` pair shows the assigned person's first name + last initial, or `—` if unassigned
- In Edit mode: editable cells get a hover ring; clicking opens the cell popover (§4)

**Grid (people-as-rows):**
- Sticky left column: person name + their team badges
- Sticky top row: service date + name
- Cells: list of position names this person fills for that service (e.g., "Drums" or "Drums + Lead Vocals" if multi-position)
- People-as-rows is **always read-only** (see §4)

**Mobile:** below the `md` Tailwind breakpoint, the page renders only a notice: "Open on a larger screen to use the roster grid." No collapsed grid attempted.

---

## 3. Permissions & Access Matrix

| Action | Admin | roster_maker | Team leader | Other |
|--------|:-----:|:------------:|:-----------:|:-----:|
| View `/roster/grid` | ✅ | ✅ | ✅ | ❌ |
| Toggle Edit mode | ✅ | ✅ | ✅ (only if they lead at least one team) | — |
| Assign / unassign in cell | ✅ any | ✅ any | ✅ only own teams | — |
| Override unavailability warning | ✅ | ✅ | ✅ for own teams | — |

The route's loader uses `requireRosterGridAccess()` which redirects unauthorised users.

The single-cell server action `assignSlotAction(slotId, profileId | null)`:
1. Loads the slot, joins to its `team_id`
2. Checks: caller is admin OR roster_maker OR `slot.team_id ∈ editableTeamIds`
3. Updates the row, resetting `status` to `unassigned` only if the assignee changed
4. Calls `revalidatePath("/roster/grid")` and `revalidatePath(`/roster/${service_id}`)`

The grid filters which cells render with edit affordances based on the same logic, so users never see edit UI on cells they can't change.

---

## 4. Data Fetching & Cell Editing

### Data fetched on the server

For the visible date range:

```typescript
type GridData = {
  services: {
    id: string; name: string; date: string;
    status: "draft" | "published" | "completed";
    type: "regular_sunday" | "special_event";
  }[];
  teams: { id: string; name: string; color: string }[];
  positions: { id: string; team_id: string; name: string; order: number }[];
  // Slot lookup keyed by `${service_id}:${position_id}`
  slots: Record<string, {
    slot_id: string;
    profile_id: string | null;
    status: "unassigned" | "pending" | "confirmed" | "declined";
  }>;
  profiles: { id: string; first_name: string; last_name: string }[];
  // Who is eligible for which position
  eligibility: Record<string, Array<{ profile_id: string; team_role: "leader" | "member" }>>;
  // Service-specific unavailability
  unavailableByService: Record<string, string[]>;  // service_id → profile_ids
};
```

Built from these queries (all in parallel):
1. `services` where `date BETWEEN start AND end` ordered by date
2. `roster_slots` for those service IDs
3. `teams`, `team_positions`, `team_member_positions`
4. `profiles` where `status IN ('active','invited')`
5. `unavailability_ranges` overlapping `[start, end]` (used to derive per-service unavailability for any service date in range)
6. `service_unavailability` for the services in range

The unavailability derivation merges date-range and per-service rows into one map keyed by `service_id`.

### Cell popover (services-as-rows + Edit mode)

Anchored to the clicked cell. Contains:
- **Header:** position name + service name + service date
- **Search box:** filter the list by first or last name
- **People list:** scrollable, all entries from `eligibility[position_id]`. Each row shows:
  - Name
  - Conflict badges:
    - 🔴 **Unavailable** — `unavailableByService[service_id]` includes this profile
    - 🟠 **Already serving** — same profile already in another `roster_slots` row for this service
    - 🟢 (no badge) — clean
  - Click → calls `assignSlotAction(slot_id, profile_id)`. If the picked person has a red badge, surface a `confirm()` first ("This person is unavailable. Assign anyway?"). Orange is informational, no confirm.
- **Footer:** "Unassign" → `assignSlotAction(slot_id, null)`

Optimistic UI: cell updates locally via `useOptimistic` keyed on `slot_id`. Server action runs in a transition. On error, revert and show a toast.

### Why people-as-rows is read-only

To edit a cell in people-as-rows you'd need to pick a service AND a position, which is a slower UX than picking a cell that already represents that pair. People-as-rows shines for "who's doing what when?" overviews and is left as a viewing surface only.

---

## 5. Files Created / Modified

**Created:**
- `supabase/migrations/0012_roster_maker_role.sql` — adds `roster_maker` to `profile_role` enum
- `src/lib/roster-grid.ts` — pure helpers (`defaultGridRange`, `cellKey`, `mergeUnavailability`)
- `tests/unit/roster-grid.test.ts`
- `src/app/(app)/roster/grid/page.tsx` — server shell (fetch + build GridData)
- `src/app/(app)/roster/grid/RosterGrid.tsx` — client root (toggles, filters, dispatches to subgrids)
- `src/app/(app)/roster/grid/ServicesAsRows.tsx` — grid in services-as-rows mode
- `src/app/(app)/roster/grid/PeopleAsRows.tsx` — grid in people-as-rows mode (read-only)
- `src/app/(app)/roster/grid/CellPopover.tsx` — inline person picker
- `src/app/(app)/roster/grid/actions.ts` — `assignSlotAction(slotId, profileId | null)`

**Modified:**
- `src/types/database.ts` — widen `profile_role` enum union
- `src/lib/auth.ts` — widen `SessionUser.role`; add `requireRosterGridAccess`
- `src/components/layout/Sidebar.tsx` — widen role prop; add "Roster grid" nav item (visible to admin / roster_maker / any team leader)
- `src/components/layout/BottomTabs.tsx` — widen role prop (no new tab)

---

## 6. Out of Scope

- Mobile layout
- Bulk fill / "auto-roster" suggestion / fairness algorithms
- Drag-and-drop between cells
- Cell history / change log
- Per-cell comments
- Print or PDF export
- CSV export
- Compact week view (services-as-columns inside a week)
- Editing in people-as-rows orientation
- Multi-cell selection (e.g., assign one person across 4 weeks at once)
- Conflict-blocking — conflicts surface as warnings, not blocks
