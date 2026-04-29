# Spreadsheet Roster View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/roster/grid` — a wide, scrollable spreadsheet of services × positions over a configurable date range, with click-to-edit cells, unavailability signals, and a new `roster_maker` profile role.

**Architecture:** Two migrations (role enum addition, then types). Server component fetches all needed rows for the date range and builds a `GridData` shape. Client root manages orientation toggle, filters, and edit mode. A single-cell server action `assignSlotAction(slotId, profileId)` does the only mutation in this feature. Optimistic UI via `useOptimistic` keyed on slot id.

**Tech Stack:** Next.js 16.2.4 App Router, Supabase JS v2 SSR, Vitest, Tailwind CSS, Lucide icons, `useOptimistic` for cell mutations, native HTML for layout (no virtualization library — datasets are bounded by 8 weeks × ~50 positions).

---

## File Map

**Created:**
- `supabase/migrations/0012_roster_maker_role.sql` — adds `roster_maker` to `profile_role` enum
- `src/lib/roster-grid.ts` — pure helpers (`defaultGridRange`, `cellKey`, `mergeUnavailability`, `parseGridRange`)
- `tests/unit/roster-grid.test.ts`
- `src/app/(app)/roster/grid/actions.ts` — `assignSlotAction`
- `src/app/(app)/roster/grid/page.tsx` — server shell
- `src/app/(app)/roster/grid/RosterGrid.tsx` — client root
- `src/app/(app)/roster/grid/ServicesAsRows.tsx`
- `src/app/(app)/roster/grid/PeopleAsRows.tsx`
- `src/app/(app)/roster/grid/CellPopover.tsx`

**Modified:**
- `src/types/database.ts` — widen `profile_role` enum union
- `src/lib/auth.ts` — widen `SessionUser.role`; add `requireRosterGridAccess`
- `src/components/layout/Sidebar.tsx` — widen role union; add "Roster grid" nav item
- `src/components/layout/BottomTabs.tsx` — widen role union (no new tab)

---

### Task 1: Migration — add roster_maker role

**Files:**
- Create: `supabase/migrations/0012_roster_maker_role.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0012_roster_maker_role.sql
-- Plan F: Spreadsheet Roster View — add roster_maker profile role.
-- Standalone migration: PostgreSQL does not allow new enum values
-- to be referenced in the same transaction in which they are added.

ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'roster_maker';
```

- [ ] **Step 2: Apply**

```bash
supabase db push
```

Expected: applies cleanly.

- [ ] **Step 3: Verify**

```bash
supabase db execute --sql "SELECT unnest(enum_range(NULL::profile_role));"
```

Expected: includes `roster_maker`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_roster_maker_role.sql
git commit -m "feat: add roster_maker to profile_role enum"
```

---

### Task 2: Widen profile role types

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Update `src/types/database.ts`**

Find the `profile_role:` enum line (Plan E widened it to `"admin" | "member" | "logistics" | "librarian"`). Replace with:

```typescript
profile_role: "admin" | "member" | "logistics" | "librarian" | "roster_maker"
```

- [ ] **Step 2: Update `SessionUser.role` in `src/lib/auth.ts`**

Change the role line in the `SessionUser` type:

```typescript
  role: "admin" | "member" | "logistics" | "librarian" | "roster_maker";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: type errors may surface in `Sidebar.tsx` and `BottomTabs.tsx` — those are addressed in Task 11. No other errors expected.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/lib/auth.ts
git commit -m "feat: widen profile_role union with roster_maker"
```

---

### Task 3: Pure helpers + unit tests

**Files:**
- Create: `src/lib/roster-grid.ts`
- Create: `tests/unit/roster-grid.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/roster-grid.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  defaultGridRange,
  parseGridRange,
  cellKey,
  mergeUnavailability,
} from "@/lib/roster-grid";

describe("defaultGridRange", () => {
  it("returns today and today + 56 days as YYYY-MM-DD", () => {
    const today = new Date("2026-05-01T08:00:00Z");
    const r = defaultGridRange(today);
    expect(r.start).toBe("2026-05-01");
    expect(r.end).toBe("2026-06-26");
  });
});

describe("parseGridRange", () => {
  it("returns the search-param values when valid", () => {
    expect(parseGridRange({ start: "2026-05-10", end: "2026-06-01" }, new Date("2026-05-01T00:00:00Z")))
      .toEqual({ start: "2026-05-10", end: "2026-06-01" });
  });
  it("falls back to defaults if start > end", () => {
    const r = parseGridRange({ start: "2026-06-01", end: "2026-05-01" }, new Date("2026-05-01T08:00:00Z"));
    expect(r).toEqual({ start: "2026-05-01", end: "2026-06-26" });
  });
  it("falls back to defaults when params are absent", () => {
    expect(parseGridRange({}, new Date("2026-05-01T08:00:00Z")))
      .toEqual({ start: "2026-05-01", end: "2026-06-26" });
  });
  it("falls back when start is malformed", () => {
    expect(parseGridRange({ start: "not-a-date", end: "2026-06-01" }, new Date("2026-05-01T08:00:00Z")))
      .toEqual({ start: "2026-05-01", end: "2026-06-26" });
  });
});

describe("cellKey", () => {
  it("joins service id and position id with colon", () => {
    expect(cellKey("svc-1", "pos-9")).toBe("svc-1:pos-9");
  });
});

describe("mergeUnavailability", () => {
  it("merges per-service entries with date-range entries", () => {
    const services = [
      { id: "s1", date: "2026-05-04" },
      { id: "s2", date: "2026-05-11" },
    ];
    const ranges = [
      { profile_id: "p1", start_date: "2026-05-01", end_date: "2026-05-07" },
    ];
    const perService = [
      { profile_id: "p2", service_id: "s2" },
    ];
    const map = mergeUnavailability(services, ranges, perService);
    expect(map["s1"].sort()).toEqual(["p1"]);
    expect(map["s2"].sort()).toEqual(["p2"]);
  });
  it("dedupes a profile that appears in both", () => {
    const services = [{ id: "s1", date: "2026-05-04" }];
    const ranges = [{ profile_id: "p1", start_date: "2026-05-01", end_date: "2026-05-07" }];
    const perService = [{ profile_id: "p1", service_id: "s1" }];
    expect(mergeUnavailability(services, ranges, perService)["s1"]).toEqual(["p1"]);
  });
  it("excludes a range that doesn't cover any visible service", () => {
    const services = [{ id: "s1", date: "2026-06-01" }];
    const ranges = [{ profile_id: "p1", start_date: "2026-05-01", end_date: "2026-05-07" }];
    expect(mergeUnavailability(services, ranges, [])).toEqual({ s1: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/roster-grid.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/roster-grid'`.

- [ ] **Step 3: Implement `src/lib/roster-grid.ts`**

```typescript
const RANGE_DAYS = 56;

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isValidDate(s: string | undefined): s is string {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime());
}

export function defaultGridRange(today: Date = new Date()): { start: string; end: string } {
  const start = new Date(today);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + RANGE_DAYS);
  return { start: fmt(start), end: fmt(end) };
}

export function parseGridRange(
  params: { start?: string; end?: string },
  today: Date = new Date(),
): { start: string; end: string } {
  if (!isValidDate(params.start) || !isValidDate(params.end)) return defaultGridRange(today);
  if (params.start! > params.end!) return defaultGridRange(today);
  return { start: params.start!, end: params.end! };
}

export function cellKey(serviceId: string, positionId: string): string {
  return `${serviceId}:${positionId}`;
}

// Builds: { service_id: [profile_id, ...] }
export function mergeUnavailability(
  services: { id: string; date: string }[],
  ranges: { profile_id: string; start_date: string; end_date: string }[],
  perService: { profile_id: string; service_id: string }[],
): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const s of services) out[s.id] = new Set();

  for (const r of ranges) {
    for (const s of services) {
      if (r.start_date <= s.date && s.date <= r.end_date) {
        out[s.id].add(r.profile_id);
      }
    }
  }

  for (const u of perService) {
    if (out[u.service_id]) out[u.service_id].add(u.profile_id);
  }

  const result: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(out)) result[k] = [...v];
  return result;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/roster-grid.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster-grid.ts tests/unit/roster-grid.test.ts
git commit -m "feat: roster-grid pure helpers — defaultGridRange, parseGridRange, cellKey, mergeUnavailability"
```

---

### Task 4: Auth helper — requireRosterGridAccess

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Append the helper**

Add to `src/lib/auth.ts` after the existing exports:

```typescript
export type RosterGridAccess = {
  user: SessionUser;
  canEditAll: boolean;
  editableTeamIds: string[];
};

export async function requireRosterGridAccess(): Promise<RosterGridAccess> {
  const user = await requireUser();
  const supabase = await createClient();

  if (user.role === "admin" || user.role === "roster_maker") {
    return { user, canEditAll: true, editableTeamIds: [] };
  }

  const { data: leaderRows } = await supabase
    .from("team_member_positions")
    .select("team_id")
    .eq("profile_id", user.id)
    .eq("team_role", "leader");

  const editableTeamIds = [...new Set((leaderRows ?? []).map((r) => r.team_id))];

  if (editableTeamIds.length === 0) redirect("/dashboard");

  return { user, canEditAll: false, editableTeamIds };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors (pre-existing Sidebar/BottomTabs errors still expected).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: requireRosterGridAccess auth helper"
```

---

### Task 5: assignSlotAction server action

**Files:**
- Create: `src/app/(app)/roster/grid/actions.ts`

- [ ] **Step 1: Create the action**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireRosterGridAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function assignSlotAction(
  slotId: string,
  profileId: string | null,
): Promise<{ error?: string }> {
  const access = await requireRosterGridAccess();
  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("roster_slots")
    .select("id, service_id, team_id, profile_id, status")
    .eq("id", slotId)
    .single();
  if (!slot) return { error: "Slot not found." };

  // Permission: admin/roster_maker can edit any slot;
  // team leaders can edit only slots in their teams
  if (!access.canEditAll && !access.editableTeamIds.includes(slot.team_id)) {
    return { error: "You don't have access to edit this slot." };
  }

  // Reset status to unassigned only if the assignee changed
  const status = slot.profile_id === profileId ? slot.status : "unassigned";

  const { error } = await supabase
    .from("roster_slots")
    .update({ profile_id: profileId, status })
    .eq("id", slotId);
  if (error) return { error: error.message };

  revalidatePath("/roster/grid");
  revalidatePath(`/roster/${slot.service_id}`);
  return {};
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/roster/grid/actions.ts"
git commit -m "feat: assignSlotAction — single-cell roster mutation"
```

---

### Task 6: Server shell page

**Files:**
- Create: `src/app/(app)/roster/grid/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { requireRosterGridAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { defaultGridRange, parseGridRange, cellKey, mergeUnavailability } from "@/lib/roster-grid";
import { RosterGrid, type GridData } from "./RosterGrid";

type SearchParams = Promise<{ start?: string; end?: string }>;

export default async function RosterGridPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const access = await requireRosterGridAccess();
  const params = await searchParams;
  const { start, end } = parseGridRange({ start: params.start, end: params.end });
  const supabase = await createClient();

  const [
    { data: services },
    { data: teams },
    { data: positions },
    { data: tmp },
    { data: profiles },
    { data: ranges },
    { data: perService },
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, date, status, type")
      .gte("date", start)
      .lte("date", end)
      .order("date"),
    supabase.from("teams").select("id, name, color").order("name"),
    supabase.from("team_positions").select("id, team_id, name, order").order("order"),
    supabase.from("team_member_positions").select("profile_id, position_id, team_role"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, status")
      .in("status", ["active", "invited"]),
    supabase
      .from("unavailability_ranges")
      .select("profile_id, start_date, end_date")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("service_unavailability")
      .select("profile_id, service_id"),
  ]);

  const serviceList = services ?? [];

  // Slots only for visible services
  let slotsRows: { id: string; service_id: string; position_id: string; profile_id: string | null; status: string }[] = [];
  if (serviceList.length > 0) {
    const { data } = await supabase
      .from("roster_slots")
      .select("id, service_id, position_id, profile_id, status")
      .in("service_id", serviceList.map((s) => s.id));
    slotsRows = (data ?? []) as typeof slotsRows;
  }

  const slots: GridData["slots"] = {};
  for (const r of slotsRows) {
    slots[cellKey(r.service_id, r.position_id)] = {
      slot_id: r.id,
      profile_id: r.profile_id,
      status: r.status as "unassigned" | "pending" | "confirmed" | "declined",
    };
  }

  const eligibility: GridData["eligibility"] = {};
  for (const row of tmp ?? []) {
    const arr = eligibility[row.position_id] ?? [];
    arr.push({ profile_id: row.profile_id, team_role: row.team_role as "leader" | "member" });
    eligibility[row.position_id] = arr;
  }

  const visibleServices = serviceList.map((s) => ({ id: s.id, date: s.date }));
  const visiblePerService = (perService ?? []).filter((u) =>
    visibleServices.some((s) => s.id === u.service_id),
  );
  const unavailableByService = mergeUnavailability(visibleServices, ranges ?? [], visiblePerService);

  const data: GridData = {
    services: serviceList as GridData["services"],
    teams: (teams ?? []) as GridData["teams"],
    positions: (positions ?? []) as GridData["positions"],
    slots,
    profiles: (profiles ?? []).map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })),
    eligibility,
    unavailableByService,
  };

  return (
    <RosterGrid
      data={data}
      range={{ start, end }}
      canEditAll={access.canEditAll}
      editableTeamIds={access.editableTeamIds}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/roster/grid/page.tsx"
git commit -m "feat: roster-grid server shell with full data fetch"
```

(Page won't render yet — `RosterGrid` is created in Task 7.)

---

### Task 7: RosterGrid client root

**Files:**
- Create: `src/app/(app)/roster/grid/RosterGrid.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Eye } from "lucide-react";
import { ServicesAsRows } from "./ServicesAsRows";
import { PeopleAsRows } from "./PeopleAsRows";

export type GridData = {
  services: { id: string; name: string; date: string; status: "draft" | "published" | "completed"; type: "regular_sunday" | "special_event" }[];
  teams: { id: string; name: string; color: string }[];
  positions: { id: string; team_id: string; name: string; order: number }[];
  slots: Record<string, { slot_id: string; profile_id: string | null; status: "unassigned" | "pending" | "confirmed" | "declined" }>;
  profiles: { id: string; first_name: string; last_name: string }[];
  eligibility: Record<string, Array<{ profile_id: string; team_role: "leader" | "member" }>>;
  unavailableByService: Record<string, string[]>;
};

type Orientation = "services" | "people";

type Props = {
  data: GridData;
  range: { start: string; end: string };
  canEditAll: boolean;
  editableTeamIds: string[];
};

const ORIENTATION_KEY = "roster-grid-orientation";

export function RosterGrid({ data, range, canEditAll, editableTeamIds }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orientation, setOrientation] = useState<Orientation>("services");
  const [editMode, setEditMode] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set(data.teams.map((t) => t.id)),
  );
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);

  // Read orientation from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(ORIENTATION_KEY);
    if (stored === "services" || stored === "people") setOrientation(stored);
  }, []);

  function pickOrientation(o: Orientation) {
    setOrientation(o);
    localStorage.setItem(ORIENTATION_KEY, o);
  }

  function applyRange() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("start", start);
    sp.set("end", end);
    router.push(`/roster/grid?${sp.toString()}`);
  }

  function toggleTeam(id: string) {
    const next = new Set(selectedTeamIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTeamIds(next);
  }

  const visibleTeams = data.teams.filter((t) => selectedTeamIds.has(t.id));
  const visiblePositions = data.positions.filter((p) => selectedTeamIds.has(p.team_id));

  // Hide edit toggle if user has no editable cells
  const canShowEditToggle = canEditAll || editableTeamIds.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Mobile guard ─────────────────────────────────── */}
      <div className="md:hidden text-center py-12 text-slate-400">
        <p className="text-sm">Open on a larger screen to use the roster grid.</p>
      </div>

      <div className="hidden md:block space-y-4">
        {/* ── Header bar ─────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">From</label>
            <input
              type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <label className="text-xs font-medium text-slate-600">To</label>
            <input
              type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <button
              type="button" onClick={applyRange}
              className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="text-xs flex bg-slate-100 rounded-lg p-0.5">
              <button
                type="button" onClick={() => pickOrientation("services")}
                className={`px-3 py-1 rounded ${orientation === "services" ? "bg-white shadow-sm font-medium" : ""}`}
              >
                Services as rows
              </button>
              <button
                type="button" onClick={() => pickOrientation("people")}
                className={`px-3 py-1 rounded ${orientation === "people" ? "bg-white shadow-sm font-medium" : ""}`}
              >
                People as rows
              </button>
            </div>

            {canShowEditToggle && (
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                  editMode
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {editMode ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {editMode ? "Editing" : "View only"}
              </button>
            )}
          </div>
        </div>

        {/* ── Team filter chips ──────────────────────────── */}
        <div className="flex flex-wrap gap-1.5">
          {data.teams.map((t) => {
            const on = selectedTeamIds.has(t.id);
            return (
              <button
                key={t.id} type="button" onClick={() => toggleTeam(t.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  on ? "border-transparent text-white" : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
                style={on ? { backgroundColor: t.color } : undefined}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        {/* ── Grid ──────────────────────────────────────── */}
        {data.services.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">No services in this date range.</p>
        ) : orientation === "services" ? (
          <ServicesAsRows
            data={data}
            visibleTeams={visibleTeams}
            visiblePositions={visiblePositions}
            editMode={editMode}
            canEditAll={canEditAll}
            editableTeamIds={editableTeamIds}
          />
        ) : (
          <PeopleAsRows
            data={data}
            visibleTeams={visibleTeams}
            visiblePositions={visiblePositions}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors only in Sidebar/BottomTabs (still pending).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/roster/grid/RosterGrid.tsx"
git commit -m "feat: RosterGrid client root — toggles, filters, orientation switch"
```

---

### Task 8: ServicesAsRows + CellPopover

**Files:**
- Create: `src/app/(app)/roster/grid/CellPopover.tsx`
- Create: `src/app/(app)/roster/grid/ServicesAsRows.tsx`

- [ ] **Step 1: Create CellPopover**

```typescript
"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { assignSlotAction } from "./actions";

type Profile = { id: string; first_name: string; last_name: string };

type Props = {
  slotId: string;
  positionName: string;
  serviceName: string;
  serviceDate: string;
  eligible: Profile[];
  unavailableIds: Set<string>;
  alreadyServingIds: Set<string>;
  currentProfileId: string | null;
  onClose: () => void;
  onLocalChange: (profileId: string | null) => void;
};

export function CellPopover({
  slotId, positionName, serviceName, serviceDate, eligible,
  unavailableIds, alreadyServingIds, currentProfileId,
  onClose, onLocalChange,
}: Props) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ql = q.trim().toLowerCase();
  const filtered = eligible
    .filter((p) => !ql || p.first_name.toLowerCase().includes(ql) || p.last_name.toLowerCase().includes(ql))
    .sort((a, b) =>
      (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name, undefined, { sensitivity: "base" }),
    );

  function pick(profileId: string | null) {
    setError(null);
    if (profileId !== null && unavailableIds.has(profileId)) {
      const ok = confirm("This person is unavailable for this service. Assign anyway?");
      if (!ok) return;
    }
    onLocalChange(profileId);
    startTransition(async () => {
      const res = await assignSlotAction(slotId, profileId);
      if (res?.error) {
        setError(res.error);
        // Revert by re-passing the previous value via parent — for simplicity we
        // just close and rely on next page revalidation.
      } else {
        onClose();
      }
    });
  }

  return (
    <div
      role="dialog"
      className="absolute z-30 bg-white border border-slate-200 rounded-xl shadow-lg w-72 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-700">{positionName}</div>
          <div className="text-[10px] text-slate-500">{serviceName} · {new Date(serviceDate + "T00:00:00").toLocaleDateString()}</div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2 border-b border-slate-100 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input
          autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…"
          className="flex-1 text-sm outline-none bg-transparent"
        />
      </div>

      <ul className="max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-400">No matches.</li>
        ) : filtered.map((p) => {
          const isUnavail = unavailableIds.has(p.id);
          const isServing = alreadyServingIds.has(p.id) && p.id !== currentProfileId;
          const isCurrent = p.id === currentProfileId;
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => pick(p.id)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                  isCurrent ? "bg-indigo-50" : "hover:bg-slate-50"
                } disabled:opacity-50`}
              >
                <span className="flex-1 text-slate-900 truncate">{p.first_name} {p.last_name}</span>
                {isUnavail && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Unavailable</span>}
                {isServing && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Already serving</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {currentProfileId && (
        <div className="px-3 py-2 border-t border-slate-100">
          <button
            type="button" disabled={isPending}
            onClick={() => pick(null)}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            Unassign
          </button>
        </div>
      )}

      {error && <p className="px-3 py-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create ServicesAsRows**

```typescript
"use client";

import { useOptimistic, useState } from "react";
import { CellPopover } from "./CellPopover";
import { cellKey } from "@/lib/roster-grid";
import type { GridData } from "./RosterGrid";

type Props = {
  data: GridData;
  visibleTeams: GridData["teams"];
  visiblePositions: GridData["positions"];
  editMode: boolean;
  canEditAll: boolean;
  editableTeamIds: string[];
};

type SlotChange = { key: string; profile_id: string | null };

export function ServicesAsRows({
  data, visibleTeams, visiblePositions, editMode, canEditAll, editableTeamIds,
}: Props) {
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);

  const [optSlots, applySlotChange] = useOptimistic(
    data.slots,
    (current: GridData["slots"], op: SlotChange) => {
      const existing = current[op.key];
      if (!existing) return current;
      return {
        ...current,
        [op.key]: { ...existing, profile_id: op.profile_id },
      };
    },
  );

  const profilesById = new Map(data.profiles.map((p) => [p.id, p]));

  // Group positions by team for the headers
  const positionsByTeam = new Map<string, GridData["positions"]>();
  for (const p of visiblePositions) {
    const arr = positionsByTeam.get(p.team_id) ?? [];
    arr.push(p);
    positionsByTeam.set(p.team_id, arr);
  }

  function canEditTeam(teamId: string) {
    return canEditAll || editableTeamIds.includes(teamId);
  }

  function alreadyServingIds(serviceId: string, currentSlotKey: string): Set<string> {
    const ids = new Set<string>();
    for (const p of data.positions) {
      const k = cellKey(serviceId, p.id);
      if (k === currentSlotKey) continue;
      const pid = optSlots[k]?.profile_id;
      if (pid) ids.add(pid);
    }
    return ids;
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-slate-600 font-medium" rowSpan={2}>
              Service
            </th>
            {visibleTeams.map((t) => {
              const list = positionsByTeam.get(t.id) ?? [];
              if (list.length === 0) return null;
              return (
                <th
                  key={t.id}
                  className="border-b border-l border-slate-200 px-3 py-1 text-white font-medium"
                  colSpan={list.length}
                  style={{ backgroundColor: t.color }}
                >
                  {t.name}
                </th>
              );
            })}
          </tr>
          <tr>
            {visibleTeams.flatMap((t) =>
              (positionsByTeam.get(t.id) ?? []).map((p) => (
                <th
                  key={p.id}
                  className="border-b border-l border-slate-200 px-2 py-1 bg-slate-50 text-slate-600 font-medium whitespace-nowrap"
                >
                  {p.name}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {data.services.map((s) => (
            <tr key={s.id}>
              <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 whitespace-nowrap">
                <div className="text-xs font-medium text-slate-900">
                  {new Date(s.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <div className="text-[10px] text-slate-500 max-w-[140px] truncate">{s.name}</div>
              </td>
              {visibleTeams.flatMap((t) =>
                (positionsByTeam.get(t.id) ?? []).map((p) => {
                  const k = cellKey(s.id, p.id);
                  const slot = optSlots[k];
                  const profile = slot?.profile_id ? profilesById.get(slot.profile_id) : null;
                  const editable = editMode && canEditTeam(t.id) && !!slot;
                  const isOpen = openCellKey === k;
                  return (
                    <td
                      key={p.id}
                      className={`relative border-b border-l border-slate-200 px-2 py-2 text-center ${
                        editable ? "cursor-pointer hover:bg-indigo-50" : ""
                      }`}
                      onClick={() => editable && setOpenCellKey(isOpen ? null : k)}
                    >
                      <span className="text-xs text-slate-700">
                        {profile ? `${profile.first_name} ${profile.last_name.charAt(0)}.` : "—"}
                      </span>
                      {isOpen && slot && (
                        <CellPopover
                          slotId={slot.slot_id}
                          positionName={p.name}
                          serviceName={s.name}
                          serviceDate={s.date}
                          eligible={
                            (data.eligibility[p.id] ?? [])
                              .map((e) => profilesById.get(e.profile_id))
                              .filter((p): p is NonNullable<typeof p> => Boolean(p))
                          }
                          unavailableIds={new Set(data.unavailableByService[s.id] ?? [])}
                          alreadyServingIds={alreadyServingIds(s.id, k)}
                          currentProfileId={slot.profile_id}
                          onClose={() => setOpenCellKey(null)}
                          onLocalChange={(pid) => applySlotChange({ key: k, profile_id: pid })}
                        />
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors only in Sidebar/BottomTabs.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/roster/grid/CellPopover.tsx" "src/app/(app)/roster/grid/ServicesAsRows.tsx"
git commit -m "feat: ServicesAsRows grid with click-to-edit cells and CellPopover"
```

---

### Task 9: PeopleAsRows grid

**Files:**
- Create: `src/app/(app)/roster/grid/PeopleAsRows.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useMemo } from "react";
import type { GridData } from "./RosterGrid";

type Props = {
  data: GridData;
  visibleTeams: GridData["teams"];
  visiblePositions: GridData["positions"];
};

export function PeopleAsRows({ data, visibleTeams, visiblePositions }: Props) {
  const visiblePositionIds = useMemo(() => new Set(visiblePositions.map((p) => p.id)), [visiblePositions]);
  const positionById = useMemo(() => new Map(data.positions.map((p) => [p.id, p])), [data.positions]);
  const teamById = useMemo(() => new Map(data.teams.map((t) => [t.id, t])), [data.teams]);
  const profileById = useMemo(() => new Map(data.profiles.map((p) => [p.id, p])), [data.profiles]);

  // Build: profile_id → service_id → position names
  const matrix = useMemo(() => {
    const out = new Map<string, Map<string, string[]>>();
    for (const [key, slot] of Object.entries(data.slots)) {
      if (!slot.profile_id) continue;
      const [serviceId, positionId] = key.split(":");
      if (!visiblePositionIds.has(positionId)) continue;
      const pos = positionById.get(positionId);
      if (!pos) continue;
      const byProfile = out.get(slot.profile_id) ?? new Map<string, string[]>();
      const list = byProfile.get(serviceId) ?? [];
      list.push(pos.name);
      byProfile.set(serviceId, list);
      out.set(slot.profile_id, byProfile);
    }
    return out;
  }, [data.slots, visiblePositionIds, positionById]);

  // Only show profiles who have at least one assignment in the visible window
  const visibleProfiles = data.profiles
    .filter((p) => matrix.has(p.id))
    .sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name, undefined, { sensitivity: "base" }));

  if (visibleProfiles.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">No assignments in this date range.</p>;
  }

  // Profile → set of team IDs they're assigned to (for badges)
  const teamsByProfile = new Map<string, Set<string>>();
  for (const [profileId, perService] of matrix) {
    const teams = new Set<string>();
    for (const [, names] of perService) {
      for (const name of names) {
        const pos = data.positions.find((p) => p.name === name);
        if (pos) teams.add(pos.team_id);
      }
    }
    teamsByProfile.set(profileId, teams);
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-slate-600 font-medium">
              Person
            </th>
            {data.services.map((s) => (
              <th key={s.id} className="border-b border-l border-slate-200 px-3 py-2 bg-slate-50 text-slate-600 font-medium whitespace-nowrap">
                <div>{new Date(s.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                <div className="text-[10px] text-slate-400 font-normal max-w-[110px] truncate">{s.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleProfiles.map((p) => {
            const personMatrix = matrix.get(p.id);
            const teams = [...(teamsByProfile.get(p.id) ?? [])]
              .map((tid) => teamById.get(tid))
              .filter((t): t is GridData["teams"][number] => Boolean(t));
            return (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 whitespace-nowrap">
                  <div className="text-xs font-medium text-slate-900">{p.first_name} {p.last_name}</div>
                  <div className="flex gap-1 mt-0.5">
                    {teams.map((t) => (
                      <span key={t.id}
                        className="text-[9px] px-1 py-0.5 rounded text-white"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </td>
                {data.services.map((s) => {
                  const names = personMatrix?.get(s.id) ?? [];
                  return (
                    <td key={s.id} className="border-b border-l border-slate-200 px-2 py-2 text-center text-slate-700">
                      {names.length === 0 ? <span className="text-slate-300">—</span> : names.join(", ")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors only in Sidebar/BottomTabs.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/roster/grid/PeopleAsRows.tsx"
git commit -m "feat: PeopleAsRows grid (read-only)"
```

---

### Task 10: Nav update — Sidebar, BottomTabs

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomTabs.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Widen the role union:

```typescript
type SidebarProps = {
  firstName: string;
  lastName: string;
  role: "admin" | "member" | "logistics" | "librarian" | "roster_maker";
};
```

Add `Grid3x3` to the lucide-react import alongside the existing icons:

```typescript
import {
  // existing icons…
  Grid3x3,
} from "lucide-react";
```

Update the `NavItem` type to support the new role gate:

```typescript
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  staffOnly?: boolean;
  librarianOrAdmin?: boolean;
  rosterGrid?: boolean;        // NEW: admin OR roster_maker (team-leader visibility evaluated server-side)
  indent?: boolean;
};
```

Add the nav item under the existing "Roster" entry:

```typescript
  { href: "/roster",      label: "Roster",       icon: ClipboardList, adminOnly: true },
  { href: "/roster/grid", label: "Roster grid",  icon: Grid3x3, rosterGrid: true, indent: true },
```

In the render filter, add the rule:

```typescript
        {NAV_ITEMS.map(({ href, label, icon: Icon, adminOnly, staffOnly, librarianOrAdmin, rosterGrid, indent }) => {
          if (adminOnly && role !== "admin") return null;
          if (staffOnly && role !== "admin" && role !== "logistics") return null;
          if (librarianOrAdmin && role !== "admin" && role !== "librarian") return null;
          if (rosterGrid && role !== "admin" && role !== "roster_maker") return null;
          // …rest unchanged
```

(Note: team leaders also have access to `/roster/grid`, but detecting that requires a DB query. The link is hidden from them in the sidebar; they can still reach the grid via direct URL or — if we wanted — a future enhancement adds an async server fragment. v1 ships with the role-only filter.)

- [ ] **Step 2: Update BottomTabs.tsx**

Widen the role prop:

```typescript
type BottomTabsProps = {
  role: "admin" | "member" | "logistics" | "librarian" | "roster_maker";
};
```

No new tab is added (desktop-only feature). The existing tab list stays unchanged otherwise — the union widening prevents the existing `role === "admin" : role === "logistics" : role === "librarian"` chain from a TypeScript exhaustiveness mismatch.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/BottomTabs.tsx
git commit -m "feat: Roster grid nav item + roster_maker role widening"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run unit tests**

```bash
npx vitest run
```

Expected: all pass — 8 new from `roster-grid.test.ts`.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Smoke-test full flow**

```bash
npm run dev
```

As admin, with at least a few services in the next 8 weeks:
1. Visit `/roster/grid` — grid loads. Sticky left date column works on horizontal scroll.
2. Toggle "People as rows" — re-renders with people on left, services on top
3. Toggle back to "Services as rows"
4. Click "View only" → "Editing"
5. Click an empty cell → popover opens
6. Pick a person → cell updates immediately, popover closes
7. Click the same cell again → "Unassign" link present, removes the person
8. Click a person who has unavailability range covering the service date → "Unavailable" red badge shown; clicking surfaces a confirm dialog
9. Apply a different date range via the From/To pickers → URL updates, grid re-fetches
10. Filter to a single team via the chip row → only that team's columns/rows show

As a non-admin (set a profile to `roster_maker` in Supabase):
1. Sidebar shows "Roster grid" entry
2. Same flow as above

As a regular member (no leader role):
1. Visit `/roster/grid` directly → redirects to `/dashboard`

- [ ] **Step 4: Commit any post-integration tweaks**

```bash
git add -p
git commit -m "fix: post-integration tweaks for roster grid"
```
