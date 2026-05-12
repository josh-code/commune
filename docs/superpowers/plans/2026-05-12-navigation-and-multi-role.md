# Navigation Redesign + Multi-Role Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a left side-drawer + role-adaptive bottom bar that hides items a user can't use, and migrate the schema from single-role to multi-role assignment (`profiles.role` → `profiles.roles profile_role[]`).

**Architecture:** Single source of truth for navigation in `src/lib/nav.ts` (gate per item by role-or-team), consumed by both `Sidebar` (desktop) and `MobileDrawer` (mobile). Schema migration adds an array column with a `current_user_has_role()` helper RPC and rewrites every RLS policy that read `profiles.role`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Supabase (Postgres 17 + RLS), lucide-react icons, Vitest, react-hook-form/zod for forms.

**Spec:** `docs/superpowers/specs/2026-05-08-navigation-and-multi-role-design.md`

**Important sequencing note:** Task 2 (schema migration) puts the app in a temporarily broken state until Task 5 (sweep of `.role` call sites) lands. Tasks 2–5 must complete as a contiguous block before the app boots cleanly again. Each commit still passes its own tests because those tests target the migrated piece in isolation.

---

## File structure

### New files

| Path | Purpose |
|---|---|
| `src/lib/nav.ts` | Nav config + role/team gating helpers |
| `src/lib/nav.test.ts` | Vitest unit tests for nav config |
| `src/lib/notifications.ts` | Shared `renderNotification()` view-model |
| `src/components/layout/MobileDrawer.tsx` | Left side-drawer for mobile |
| `src/components/dashboard/RecentNotificationsCard.tsx` | 5-item summary on `/dashboard` |
| `supabase/migrations/0014_multi_role.sql` | Add `profiles.roles[]`, backfill, helper RPC, rewrite RLS, drop `role` |
| `tests/rls/multi-role.test.ts` | RLS regression smoke test |

### Modified files

| Path | Purpose of change |
|---|---|
| `src/lib/auth.ts` | `SessionUser.roles[]` + `teams[]`; `has()` helper; all `requireXxx` use it |
| `src/components/layout/Sidebar.tsx` | Consume `visibleNavItems(user)`; rebuild footer (overlap fix) |
| `src/components/layout/BottomTabs.tsx` | Slim to 3-tab role-adaptive bar + "More" trigger |
| `src/components/layout/AppShell.tsx` | Own drawer state; wire Sidebar/BottomTabs/MobileDrawer |
| `src/app/(app)/notifications/NotificationsList.tsx` | Import `renderNotification` from `src/lib/notifications.ts` |
| `src/app/(app)/dashboard/page.tsx` | Render `RecentNotificationsCard` |
| `src/app/(app)/people/[id]/ProfileForms.tsx` | `RoleForm` → multi-select checkboxes |
| `src/app/(app)/people/[id]/actions.ts` | `updateRoleAction` → `updateRolesAction(roles: Role[])` |
| `src/app/(app)/admin/import/actions.ts` | Accept `roles` CSV column (comma-separated); legacy `role` allowed |
| `src/app/(app)/profile/page.tsx` + ~22 other call sites | Replace `user.role` reads with `user.roles.includes(...)` or `has(...)` |

---

## Task 1: Create `src/lib/nav.ts` with types, NAV_ITEMS, and helpers

**Files:**
- Create: `src/lib/nav.ts`
- Create: `src/lib/nav.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/nav.test.ts
import { describe, it, expect } from "vitest";
import { matchesGate, visibleNavItems, bottomBarItems, NAV_ITEMS, type NavUser, type Role, type TeamSlug } from "./nav";

const make = (overrides: Partial<NavUser> = {}): NavUser => ({
  roles: ["member"] as Role[],
  teams: [] as TeamSlug[],
  ...overrides,
});

describe("matchesGate", () => {
  it("returns true when gate is empty (universal item)", () => {
    expect(matchesGate({}, make({}))).toBe(true);
  });
  it("admin always sees team-gated items", () => {
    expect(matchesGate({ teams: ["media"] }, make({ roles: ["admin"], teams: [] }))).toBe(true);
  });
  it("member without matching role/team is denied", () => {
    expect(matchesGate({ roles: ["admin"] }, make({}))).toBe(false);
  });
  it("librarian sees librarian-gated items", () => {
    expect(matchesGate({ roles: ["admin", "librarian"] }, make({ roles: ["librarian"] }))).toBe(true);
  });
  it("media-team member sees Brief", () => {
    expect(matchesGate({ roles: ["admin"], teams: ["media", "preaching"] }, make({ teams: ["media"] }))).toBe(true);
  });
});

describe("visibleNavItems", () => {
  it("member sees Dashboard, Schedule, Inventory, Library (no admin items)", () => {
    const hrefs = visibleNavItems(make({})).map(i => i.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/schedule");
    expect(hrefs).toContain("/inventory");
    expect(hrefs).toContain("/library");
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/people");
    expect(hrefs).not.toContain("/brief");
    expect(hrefs).not.toContain("/hospitality");
    expect(hrefs).not.toContain("/worship/songs");
  });
  it("worship-team member sees Song bank", () => {
    const hrefs = visibleNavItems(make({ teams: ["worship"] })).map(i => i.href);
    expect(hrefs).toContain("/worship/songs");
  });
  it("multi-role librarian+logistics sees both Manage pages", () => {
    const hrefs = visibleNavItems(make({ roles: ["member", "librarian", "logistics"] })).map(i => i.href);
    expect(hrefs).toContain("/library/manage");
    expect(hrefs).toContain("/inventory/manage");
  });
  it("admin sees every item", () => {
    const hrefs = visibleNavItems(make({ roles: ["admin"] })).map(i => i.href);
    expect(hrefs.length).toBe(NAV_ITEMS.length);
  });
});

describe("bottomBarItems", () => {
  it("member: Home + Schedule + Library", () => {
    expect(bottomBarItems(make({})).map(i => i.href)).toEqual(["/dashboard", "/schedule", "/library"]);
  });
  it("admin: Home + Schedule + Roster", () => {
    expect(bottomBarItems(make({ roles: ["admin"] })).map(i => i.href)).toEqual(["/dashboard", "/schedule", "/roster"]);
  });
  it("multi-role librarian+logistics uses precedence: logistics > librarian", () => {
    expect(bottomBarItems(make({ roles: ["member", "librarian", "logistics"] })).map(i => i.href))
      .toEqual(["/dashboard", "/schedule", "/inventory/manage"]);
  });
  it("roster_maker: Home + Schedule + Roster grid", () => {
    expect(bottomBarItems(make({ roles: ["roster_maker"] })).map(i => i.href))
      .toEqual(["/dashboard", "/schedule", "/roster/grid"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL with "Cannot find module './nav'"

- [ ] **Step 3: Implement `src/lib/nav.ts`**

```ts
// src/lib/nav.ts
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, Calendar, Boxes, Wrench,
  Library, BookOpen, Music, UtensilsCrossed,
  ClipboardList, Grid3x3, FileText, Settings,
} from "lucide-react";

export type Role = "admin" | "member" | "logistics" | "librarian" | "roster_maker";
export type TeamSlug =
  | "media" | "worship" | "hospitality" | "preaching"
  | "kids" | "logistics" | "sound" | "welcome";

// Minimal user shape consumed by gating helpers — kept local so nav.ts doesn't
// depend on auth.ts. SessionUser (Task 3) is a superset of this.
export type NavUser = {
  roles: Role[];
  teams: TeamSlug[];
};

export type NavGate = {
  roles?: Role[];
  teams?: TeamSlug[];
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  gate: NavGate;     // {} = universal
  parent?: string;   // for indented sub-items in sidebar/drawer
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",        label: "Dashboard",        icon: LayoutDashboard, gate: {} },
  { href: "/people",           label: "People",           icon: Users,           gate: { roles: ["admin"] } },
  { href: "/schedule",         label: "Schedule",         icon: Calendar,        gate: {} },
  { href: "/inventory",        label: "Inventory",        icon: Boxes,           gate: {} },
  { href: "/inventory/manage", label: "Manage inventory", icon: Wrench,          gate: { roles: ["admin", "logistics"] }, parent: "/inventory" },
  { href: "/library",          label: "Library",          icon: Library,         gate: {} },
  { href: "/library/manage",   label: "Manage library",   icon: BookOpen,        gate: { roles: ["admin", "librarian"] }, parent: "/library" },
  { href: "/worship/songs",    label: "Song bank",        icon: Music,           gate: { teams: ["media", "worship"] } },
  { href: "/hospitality",      label: "Hospitality",      icon: UtensilsCrossed, gate: { roles: ["admin"], teams: ["hospitality"] } },
  { href: "/roster",           label: "Roster",           icon: ClipboardList,   gate: { roles: ["admin", "roster_maker"] } },
  { href: "/roster/grid",      label: "Roster grid",      icon: Grid3x3,         gate: { roles: ["admin", "roster_maker"] }, parent: "/roster" },
  { href: "/brief",            label: "Brief",            icon: FileText,        gate: { roles: ["admin"], teams: ["media", "preaching"] } },
  { href: "/admin",            label: "Admin",            icon: Settings,        gate: { roles: ["admin"] } },
];

export function matchesGate(gate: NavGate, user: NavUser): boolean {
  if (user.roles.includes("admin")) return true;
  if (!gate.roles && !gate.teams) return true;
  if ((gate.roles ?? []).some(r => user.roles.includes(r))) return true;
  if ((gate.teams ?? []).some(t => user.teams.includes(t))) return true;
  return false;
}

export function visibleNavItems(user: NavUser): NavItem[] {
  return NAV_ITEMS.filter(item => matchesGate(item.gate, user));
}

const ROLE_TASK: Record<Role, string> = {
  admin:        "/roster",
  logistics:    "/inventory/manage",
  librarian:    "/library/manage",
  roster_maker: "/roster/grid",
  member:       "/library",
};

const PRECEDENCE: Role[] = ["admin", "logistics", "librarian", "roster_maker", "member"];

export function bottomBarItems(user: NavUser): NavItem[] {
  const home = NAV_ITEMS.find(i => i.href === "/dashboard")!;
  const schedule = NAV_ITEMS.find(i => i.href === "/schedule")!;
  const taskRole = PRECEDENCE.find(r => user.roles.includes(r)) ?? "member";
  const task = NAV_ITEMS.find(i => i.href === ROLE_TASK[taskRole])!;
  return [home, schedule, task];
}
```

`NavUser` is intentionally local: a 2-field shape (`roles`, `teams`) that the sidebar/drawer components pass in. `SessionUser` (defined in Task 3) is a superset of `NavUser` and assigns to it implicitly via structural typing. No circular import, no temporary casts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS all 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat(nav): single-source-of-truth nav config with role+team gates"
```

---

## Task 2: Schema migration — add `roles[]`, backfill, helper RPC, rewrite RLS, drop `role`

**Files:**
- Create: `supabase/migrations/0014_multi_role.sql`

- [ ] **Step 1: Author the migration**

```sql
-- supabase/migrations/0014_multi_role.sql

-- 1. Add the new array column with a safe default
ALTER TABLE public.profiles
  ADD COLUMN roles profile_role[] NOT NULL DEFAULT '{member}';

-- 2. Backfill: copy each row's existing single role into the array
UPDATE public.profiles SET roles = ARRAY[role];

-- 3. Helper RPC used by RLS policies (SECURITY DEFINER so it bypasses RLS recursion)
CREATE OR REPLACE FUNCTION public.current_user_has_role(target profile_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND target = ANY(roles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_role(profile_role) TO authenticated;

-- 4. Rewrite every RLS policy that read `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`
--    Use DROP + CREATE to replace cleanly. Migrations 0001–0013 contain the originals; this
--    block replaces only the role-equality checks.

-- ── profiles ──
DROP POLICY IF EXISTS "Profiles: admin update" ON public.profiles;
CREATE POLICY "Profiles: admin update" ON public.profiles
  FOR UPDATE USING (current_user_has_role('admin'));

-- ── inventory_categories ──
DROP POLICY IF EXISTS "Categories: staff write" ON public.inventory_categories;
CREATE POLICY "Categories: staff write" ON public.inventory_categories
  FOR ALL USING (
    current_user_has_role('admin') OR current_user_has_role('logistics')
  );

-- ── inventory_items ──
DROP POLICY IF EXISTS "Items: staff write" ON public.inventory_items;
CREATE POLICY "Items: staff write" ON public.inventory_items
  FOR ALL USING (
    current_user_has_role('admin') OR current_user_has_role('logistics')
  );

-- ── songs / song_versions / setlists / setlist_songs (0008_worship) ──
DROP POLICY IF EXISTS "Songs admin write" ON public.songs;
CREATE POLICY "Songs admin write" ON public.songs
  FOR ALL USING (current_user_has_role('admin') OR public.is_worship_write_allowed());

DROP POLICY IF EXISTS "Song versions admin write" ON public.song_versions;
CREATE POLICY "Song versions admin write" ON public.song_versions
  FOR ALL USING (current_user_has_role('admin') OR public.is_worship_write_allowed());

DROP POLICY IF EXISTS "Setlists admin write" ON public.setlists;
CREATE POLICY "Setlists admin write" ON public.setlists
  FOR ALL USING (current_user_has_role('admin') OR public.is_worship_write_allowed());

DROP POLICY IF EXISTS "Setlist songs admin write" ON public.setlist_songs;
CREATE POLICY "Setlist songs admin write" ON public.setlist_songs
  FOR ALL USING (current_user_has_role('admin') OR public.is_worship_write_allowed());

-- ── service_briefs / brief_verses / brief_attachments (0010_projection_brief) ──
DROP POLICY IF EXISTS "Service briefs admin" ON public.service_briefs;
CREATE POLICY "Service briefs admin" ON public.service_briefs
  FOR ALL USING (current_user_has_role('admin'));

DROP POLICY IF EXISTS "Brief verses admin write" ON public.brief_verses;
CREATE POLICY "Brief verses admin write" ON public.brief_verses
  FOR ALL USING (current_user_has_role('admin'));

DROP POLICY IF EXISTS "Brief attachments admin write" ON public.brief_attachments;
CREATE POLICY "Brief attachments admin write" ON public.brief_attachments
  FOR ALL USING (current_user_has_role('admin'));

-- 5. Rewrite internal RPCs that read profiles.role
CREATE OR REPLACE FUNCTION public.is_hospitality_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_user_has_role('admin') OR EXISTS (
    SELECT 1 FROM team_member_positions tmp
    JOIN teams t ON t.id = tmp.team_id
    WHERE tmp.profile_id = auth.uid() AND lower(t.name) = 'hospitality'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_media_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_user_has_role('admin') OR EXISTS (
    SELECT 1 FROM team_member_positions tmp
    JOIN teams t ON t.id = tmp.team_id
    WHERE tmp.profile_id = auth.uid() AND lower(t.name) = 'media'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_worship_write_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_user_has_role('admin') OR EXISTS (
    SELECT 1 FROM team_member_positions tmp
    JOIN teams t ON t.id = tmp.team_id
    WHERE tmp.profile_id = auth.uid() AND lower(t.name) = 'worship'
  );
$$;

-- 6. Drop the legacy single-role column. NB: every reference above has been rewritten.
ALTER TABLE public.profiles DROP COLUMN role;
```

**Note for the agent:** the `DROP POLICY ... CREATE POLICY` block above lists every policy I expect to exist based on migration grep. Before running, grep `supabase/migrations/0001..0013` for any other `role = 'admin'` checks (string match `role = '`) and add a corresponding rewrite. The same applies to any SQL function bodies (search for `FROM profiles WHERE id = auth.uid()`). If a policy name doesn't match exactly, the `DROP POLICY IF EXISTS` is a no-op and the `CREATE POLICY` will fail — fix by reading the source migration and copying the exact name.

- [ ] **Step 2: Apply the migration**

Run: `supabase db reset`
Expected: all migrations 0001 through 0014 apply cleanly; final line `Finished supabase db reset on branch main.`

- [ ] **Step 3: Verify schema**

Run:
```bash
supabase db query "SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('role','roles');"
```
Expected: only `roles` appears; `role` does not.

Run:
```bash
supabase db query "SELECT proname FROM pg_proc WHERE proname='current_user_has_role';"
```
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_multi_role.sql
git commit -m "feat(db): multi-role schema — profiles.roles[], rewrite RLS via current_user_has_role helper"
```

**State of the app after this commit:** broken. `getSessionUser` still selects `role`, which no longer exists. Tasks 3–5 fix this in order. Do not run the dev server until Task 5 is committed.

---

## Task 3: Refactor `SessionUser`, `getSessionUser`, and add `has()` helper

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Update the type and the fetch query**

Replace the `SessionUser` definition and `getSessionUser` body in `src/lib/auth.ts:4-36` with:

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role, TeamSlug } from "@/lib/nav";

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  teams: TeamSlug[];
  status: "invited" | "active" | "on_leave" | "left";
};

export const has = (u: SessionUser, ...roles: Role[]): boolean =>
  roles.some(r => u.roles.includes(r));

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, roles, status")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { data: teamRows } = await supabase
    .from("team_member_positions")
    .select("teams!inner(name)")
    .eq("profile_id", user.id);

  const teams = [...new Set(
    (teamRows ?? [])
      .map(r => (r.teams as unknown as { name: string }).name.toLowerCase())
  )] as TeamSlug[];

  return {
    id: user.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    roles: profile.roles as Role[],
    teams,
    status: profile.status,
  };
}
```

- [ ] **Step 2: Commit (intermediate — does not yet compile end-to-end)**

```bash
git add src/lib/auth.ts
git commit -m "refactor(auth): SessionUser.roles[] + teams[]; has() helper"
```

---

## Task 4: Refactor `requireXxx` functions to use `has()`

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Rewrite the require helpers**

Append below the new `getSessionUser` in `src/lib/auth.ts`:

```ts
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!has(user, "admin")) redirect("/dashboard");
  return user;
}

export async function requireLogisticsOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!has(user, "admin", "logistics")) redirect("/dashboard");
  return user;
}

export async function requireHospitalityOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (has(user, "admin")) return user;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_hospitality_or_admin");
  if (!data) redirect("/dashboard");
  return user;
}

export async function requireWorshipWriteAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (has(user, "admin")) return user;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_worship_write_allowed");
  if (!data) redirect("/dashboard");
  return user;
}

export type RosterGridAccess = {
  user: SessionUser;
  canEditAll: boolean;
  editableTeamIds: string[];
};

export async function requireRosterGridAccess(): Promise<RosterGridAccess> {
  const user = await requireUser();
  const supabase = await createClient();

  if (has(user, "admin", "roster_maker")) {
    return { user, canEditAll: true, editableTeamIds: [] };
  }

  const { data: leaderRows } = await supabase
    .from("team_member_positions")
    .select("team_id")
    .eq("profile_id", user.id)
    .eq("team_role", "leader");

  const editableTeamIds = [...new Set((leaderRows ?? []).map(r => r.team_id))];
  if (editableTeamIds.length === 0) redirect("/dashboard");
  return { user, canEditAll: false, editableTeamIds };
}

export async function requireBriefViewAccess(serviceId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (has(user, "admin")) return user;
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
  if (has(user, "admin")) return user;
  const supabase = await createClient();
  const { data: speaker } = await supabase.rpc("is_service_speaker", { sid: serviceId });
  if (!speaker) redirect("/dashboard");
  return user;
}

export async function requireLibrarianOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!has(user, "admin", "librarian")) redirect("/dashboard");
  return user;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "refactor(auth): require helpers use has() against roles[]"
```

---

## Task 5: Sweep all `.role` call sites in src/

**Files:**
- Modify: `src/app/(app)/library/[book_id]/page.tsx:101`
- Modify: `src/app/(app)/profile/page.tsx:20`
- Modify: `src/app/(app)/dashboard/page.tsx:54,71`
- Modify: `src/app/(app)/inventory/[id]/actions.ts:42`
- Modify: `src/app/(app)/people/[id]/page.tsx:42,80`
- Modify: `src/app/(app)/people/page.tsx:11`
- Modify: `src/app/(app)/people/[id]/actions.ts:33,98,118,137,162,176`
- Modify: `src/app/(app)/brief/[service_id]/actions.ts:168`
- Modify: `src/app/(app)/brief/[service_id]/page.tsx:59`
- Modify: `src/components/layout/AppShell.tsx:16,22`
- Modify: `src/components/layout/Sidebar.tsx` (full role-prop refactor in Task 6)
- Modify: `src/components/layout/BottomTabs.tsx` (full refactor in Task 8)

- [ ] **Step 1: Mechanical replacement**

In each file above, replace patterns as follows. Import `has` from `@/lib/auth` if used.

| Before | After |
|---|---|
| `user.role === "admin"` | `user.roles.includes("admin")` |
| `user.role !== "admin"` | `!user.roles.includes("admin")` |
| `user.role === "admin" \|\| user.role === "logistics"` | `has(user, "admin", "logistics")` |
| `user.role === "admin" \|\| user.role === "librarian"` | `has(user, "admin", "librarian")` |
| `{user.role}` (rendering) | `{user.roles.join(", ")}` |
| `role={user.role}` (prop pass) | (will be removed in Tasks 6/8/9; for now: `roles={user.roles}`) |

Apply each substitution at the line ranges above. For `src/components/layout/AppShell.tsx:16,22`, the prop forwarding is replaced in Task 9 — for this commit, do:

```tsx
<Sidebar firstName={user.firstName} lastName={user.lastName} roles={user.roles} />
{/* ... */}
<BottomTabs roles={user.roles} />
```

Then update `Sidebar`/`BottomTabs` prop types to accept `roles: Role[]` (transitionally; full refactor in their own tasks). Add at top of each:

```tsx
type Props = { ..., roles: Role[] };
// inside component, replace `role === "admin"` etc. with `roles.includes("admin")`
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run dev server smoke test**

Run: `npm run dev` (background), then `curl -s http://localhost:3000/login -o /dev/null -w "%{http_code}\n"`
Expected: `200`.

Kill the dev server before proceeding.

- [ ] **Step 4: Run vitest**

Run: `npx vitest run`
Expected: all nav tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor: replace user.role with user.roles[] across src/"
```

---

## Task 6: Refactor `Sidebar.tsx` to consume `visibleNavItems(user)` and fix footer overlap

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file contents with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { visibleNavItems } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const items = visibleNavItems(user);
  const primaryRole = user.roles[0] ?? "member";

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-60 bg-white border-r border-slate-200 z-20">
      <div className="flex items-center gap-3 h-14 px-4 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          C
        </div>
        <span className="font-semibold text-slate-900 text-sm">Commune</span>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {items.map(({ href, label, icon: Icon, parent }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const indent = !!parent;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors",
                indent ? "px-5" : "px-3",
                active
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-900 truncate">
            {user.firstName} {user.lastName}
          </div>
          <div className="text-xs text-slate-500 capitalize truncate">{primaryRole}</div>
        </div>
        <NotificationBadge />
        <SignOutButton />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Update `AppShell.tsx` prop call site**

In `src/components/layout/AppShell.tsx`, change the Sidebar invocation:

```tsx
<Sidebar user={user} />
```

(Tasks 7–9 finish wiring AppShell. The above prop-shape change alone is enough for Sidebar to compile after this task.)

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, log in as admin@commune.local / commune-admin-dev, visit /dashboard, confirm sidebar renders without footer overlap (the avatar should not be clipped by the bell/sign-out).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/AppShell.tsx
git commit -m "refactor(Sidebar): consume nav.ts; fix footer overlap"
```

---

## Task 7: Create `MobileDrawer.tsx`

**Files:**
- Create: `src/components/layout/MobileDrawer.tsx`

- [ ] **Step 1: Implement the drawer**

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { visibleNavItems } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";

type Props = {
  user: SessionUser;
  open: boolean;
  onClose: () => void;
};

export function MobileDrawer({ user, open, onClose }: Props) {
  const pathname = usePathname();
  const items = visibleNavItems(user);
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const primaryRole = user.roles[0] ?? "member";

  // Lock body scroll while open; close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={cn(
          "md:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "md:hidden fixed top-0 left-0 h-full w-[280px] bg-white shadow-xl z-50 flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">C</div>
            <span className="font-semibold text-slate-900 text-sm">Commune</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-500 hover:text-slate-700"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {items.map(({ href, label, icon: Icon, parent }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            const indent = !!parent;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  indent ? "px-5" : "px-3",
                  active ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-900 truncate">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-slate-500 capitalize truncate">{primaryRole}</div>
          </div>
          <NotificationBadge />
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/MobileDrawer.tsx
git commit -m "feat(nav): MobileDrawer left side-drawer component"
```

---

## Task 8: Refactor `BottomTabs.tsx` — 3-tab role-adaptive bar + "More" trigger

**Files:**
- Modify: `src/components/layout/BottomTabs.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { bottomBarItems } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";

type Props = {
  user: SessionUser;
  onOpenMenu: () => void;
};

export function BottomTabs({ user, onOpenMenu }: Props) {
  const pathname = usePathname();
  const items = bottomBarItems(user);
  const primaryHrefs = items.map(i => i.href);
  const moreActive = !primaryHrefs.some(h => pathname === h || pathname.startsWith(h + "/"));

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
                active ? "text-indigo-600" : "text-slate-500",
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          onClick={onOpenMenu}
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
            moreActive ? "text-indigo-600" : "text-slate-500",
          )}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/BottomTabs.tsx
git commit -m "refactor(BottomTabs): 3-tab role-adaptive bar + More trigger"
```

---

## Task 9: Update `AppShell.tsx` to wire drawer state

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Convert AppShell to a client component (drawer state)**

Wrap in a client wrapper. Replace the file:

```tsx
"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";
import { MobileDrawer } from "./MobileDrawer";
import type { SessionUser } from "@/lib/auth";

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} />
      <main className="md:pl-60 pb-16 md:pb-0">
        <div className="p-6 max-w-5xl mx-auto [&:has(.full-bleed-page)]:max-w-none [&:has(.full-bleed-page)]:p-0">
          {children}
        </div>
      </main>
      <BottomTabs user={user} onOpenMenu={() => setDrawerOpen(true)} />
      <MobileDrawer user={user} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test (desktop + mobile widths)**

Run: `npm run dev`. In Chrome devtools toggle device toolbar, test at 375×667 (iPhone SE):
- 3 tabs + More visible at bottom.
- Tap "More" → drawer slides in from left.
- Tap backdrop → drawer slides out.
- Press Escape → drawer closes.
- Tap a nav link → drawer closes + navigates.

At desktop ≥768px:
- Sidebar visible; no bottom bar; no drawer.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat(AppShell): wire MobileDrawer with bottom-bar More trigger"
```

---

## Task 10: Multi-role checkboxes in `ProfileForms.tsx` + `updateRolesAction`

**Files:**
- Modify: `src/app/(app)/people/[id]/ProfileForms.tsx`
- Modify: `src/app/(app)/people/[id]/actions.ts`

- [ ] **Step 1: Add `updateRolesAction` in `actions.ts`**

Append below the existing `updateStatusAction` in `src/app/(app)/people/[id]/actions.ts`:

```ts
import type { Role } from "@/lib/nav";

const ALL_ROLES: Role[] = ["admin", "member", "logistics", "librarian", "roster_maker"];

export async function updateRolesAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  const u = await requireUser();
  if (!u.roles.includes("admin")) throw new Error("Not authorised.");

  const submitted = formData.getAll("roles") as string[];
  const roles = submitted.filter((r): r is Role => ALL_ROLES.includes(r as Role));
  // Always include 'member' as the baseline.
  if (!roles.includes("member")) roles.push("member");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ roles })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/people/${profileId}`);
}
```

Remove the now-orphaned `updateRoleAction` (lines around `src/app/(app)/people/[id]/actions.ts:118` — search for `export async function updateRoleAction` and delete the function).

- [ ] **Step 2: Replace `RoleForm` in `ProfileForms.tsx`**

Locate the `RoleForm` export (around line 42 of `src/app/(app)/people/[id]/ProfileForms.tsx`) and replace it:

```tsx
import { updateRolesAction } from "./actions";
import type { Role } from "@/lib/nav";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin",        label: "Admin" },
  { value: "logistics",    label: "Logistics" },
  { value: "librarian",    label: "Librarian" },
  { value: "roster_maker", label: "Roster maker" },
];

export function RoleForm({
  profileId,
  currentRoles,
}: {
  profileId: string;
  currentRoles: Role[];
}) {
  return (
    <form action={updateRolesAction.bind(null, profileId)} className="text-xs text-slate-600">
      <div className="mb-1 font-medium">Roles</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {/* Member is the baseline — always present, not editable here */}
        <label className="flex items-center gap-1 text-slate-400">
          <input type="checkbox" checked disabled className="accent-indigo-600" />
          Member
        </label>
        {ROLE_OPTIONS.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-1">
            <input
              type="checkbox"
              name="roles"
              value={value}
              defaultChecked={currentRoles.includes(value)}
              className="accent-indigo-600"
              onChange={(e) => (e.target.form as HTMLFormElement).requestSubmit()}
            />
            {label}
          </label>
        ))}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Update the `RoleForm` consumer in `src/app/(app)/people/[id]/page.tsx`**

Find the `<RoleForm profileId={...} currentRole={profile.role} />` invocation and change to:

```tsx
<RoleForm profileId={profile.id} currentRoles={profile.roles as Role[]} />
```

Update the page's `select(...)` SQL query to include `roles` instead of `role`.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. As admin, visit `/people/<some-id>`, check a couple of role boxes, watch the form submit and the profile reload with the new roles set.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/people/\[id\]/ProfileForms.tsx \
        src/app/\(app\)/people/\[id\]/actions.ts \
        src/app/\(app\)/people/\[id\]/page.tsx
git commit -m "feat(people): multi-role checkboxes; updateRolesAction"
```

---

## Task 11: CSV import — accept `roles` column

**Files:**
- Modify: `src/app/(app)/admin/import/actions.ts`

- [ ] **Step 1: Update the import action**

Find the import action around `src/app/(app)/admin/import/actions.ts:99` (the line currently hardcodes `role: "member"`). Replace the row-processing block to parse a `roles` column:

```ts
import type { Role } from "@/lib/nav";

const ALL_ROLES: Role[] = ["admin", "member", "logistics", "librarian", "roster_maker"];

function parseRolesCell(raw: string | undefined): Role[] {
  if (!raw) return ["member"];
  const parts = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const roles = parts.filter((r): r is Role => ALL_ROLES.includes(r as Role));
  if (!roles.includes("member")) roles.push("member");
  return roles;
}

// In the per-row import block (where the existing `role: "member"` hardcode lives):
const roles = parseRolesCell(row.roles ?? row.role);  // legacy single `role` column still works

await supabase.from("profiles").insert({
  /* … other fields … */
  roles,
});
```

The exact surrounding lines depend on the file's current shape — the agent should read the file, find the literal `role:              "member",` insert, and replace with `roles,` (using the local variable defined above). Remove the now-unused `role` field entirely.

- [ ] **Step 2: Manual smoke test**

Create a CSV with `first_name,last_name,email,roles` columns and one row containing `Jane,Doe,jane@x,librarian,logistics`. Note: the row's `roles` field is `"librarian,logistics"` (comma-quoted in CSV). Upload via `/admin/import`. Verify the new profile has `roles = {member, librarian, logistics}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/admin/import/actions.ts
git commit -m "feat(import): accept multi-value roles column (legacy role still accepted)"
```

---

## Task 12: Extract `renderNotification()` to `src/lib/notifications.ts`

**Files:**
- Create: `src/lib/notifications.ts`
- Modify: `src/app/(app)/notifications/NotificationsList.tsx`

- [ ] **Step 1: Create the shared module**

```ts
// src/lib/notifications.ts
export type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationView = {
  title: string;
  subtitle: string;
  href: string;
};

export function renderNotification(n: Notification): NotificationView {
  if (n.type === "hospitality_order_requested") {
    const p = n.payload as {
      service_id: string; service_name: string; service_date: string; item_count: number;
    };
    return {
      title: `Hospitality requested ${p.item_count} item${p.item_count === 1 ? "" : "s"}`,
      subtitle: `For ${p.service_name} (${p.service_date})`,
      href: `/hospitality/services/${p.service_id}`,
    };
  }
  if (n.type === "brief_submitted") {
    const p = n.payload as {
      brief_id: string; service_id: string; service_name: string; service_date: string; speaker_name: string;
    };
    return {
      title: `${p.speaker_name} submitted the brief`,
      subtitle: `For ${p.service_name} (${p.service_date})`,
      href: `/brief/${p.service_id}`,
    };
  }
  if (n.type === "library_loan_overdue") {
    const p = n.payload as { loan_id: string; book_title: string; days_overdue: number };
    return {
      title: `"${p.book_title}" is ${p.days_overdue} day${p.days_overdue === 1 ? "" : "s"} overdue`,
      subtitle: "Please return it as soon as possible.",
      href: "/library/me",
    };
  }
  if (n.type === "library_book_available") {
    const p = n.payload as { book_id: string; book_title: string };
    return {
      title: `"${p.book_title}" is available for you`,
      subtitle: "Visit the library to pick it up.",
      href: `/library/${p.book_id}`,
    };
  }
  if (n.type === "library_extension_requested") {
    const p = n.payload as { extension_id: string; loan_id: string; book_title: string; borrower_name: string };
    return {
      title: `${p.borrower_name} requested an extension`,
      subtitle: `For "${p.book_title}"`,
      href: "/library/manage",
    };
  }
  if (n.type === "library_extension_decision") {
    const p = n.payload as { decision: "approved" | "rejected"; book_title: string; reason: string | null };
    return {
      title: `Extension ${p.decision} for "${p.book_title}"`,
      subtitle: p.reason || "",
      href: "/library/me",
    };
  }
  return { title: n.type, subtitle: "", href: "/notifications" };
}

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
```

- [ ] **Step 2: Update `NotificationsList.tsx` to import from the new module**

In `src/app/(app)/notifications/NotificationsList.tsx`:

- Remove the local `Notification` type, `formatRelative`, and `renderNotification` (lines 7-87 of the existing file).
- Add at the top:

```ts
import { renderNotification, formatRelative, type Notification } from "@/lib/notifications";
```

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, visit `/notifications`, verify the list still renders correctly.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications.ts src/app/\(app\)/notifications/NotificationsList.tsx
git commit -m "refactor(notifications): extract renderNotification + formatRelative"
```

---

## Task 13: Dashboard "Recent notifications" card

**Files:**
- Create: `src/components/dashboard/RecentNotificationsCard.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create the card component (server component)**

```tsx
// src/components/dashboard/RecentNotificationsCard.tsx
import Link from "next/link";
import { renderNotification, formatRelative, type Notification } from "@/lib/notifications";

export function RecentNotificationsCard({ notifications }: { notifications: Notification[] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent notifications</h2>
        <Link href="/notifications" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          View all →
        </Link>
      </div>
      {notifications.length === 0 ? (
        <p className="text-sm text-slate-400">All caught up.</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map(n => {
            const { title, subtitle, href } = renderNotification(n);
            const unread = !n.read_at;
            return (
              <li key={n.id}>
                <Link
                  href={href}
                  className={`block rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 ${
                    unread ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                        {title}
                      </div>
                      {subtitle && <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>}
                    </div>
                    <div className="text-xs text-slate-400 flex-shrink-0">{formatRelative(n.created_at)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Fetch and render on the dashboard**

Modify `src/app/(app)/dashboard/page.tsx`. Add the import and the data fetch:

```tsx
import { createClient } from "@/lib/supabase/server";
import { RecentNotificationsCard } from "@/components/dashboard/RecentNotificationsCard";
import type { Notification } from "@/lib/notifications";

// inside the component (already async since it uses requireUser()):
const supabase = await createClient();
const { data: notifData } = await supabase
  .from("notifications")
  .select("id, type, payload, read_at, created_at")
  .order("created_at", { ascending: false })
  .limit(5);
const recent = (notifData ?? []) as Notification[];

// then in JSX, alongside existing content:
<RecentNotificationsCard notifications={recent} />
```

The exact JSX placement depends on the existing dashboard layout — drop it below the welcome header.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, trigger a notification (e.g., submit a brief), return to `/dashboard`, verify the card shows the latest entry with an unread indigo tint.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/RecentNotificationsCard.tsx src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(dashboard): recent notifications card"
```

---

## Task 14: RLS regression smoke test

**Files:**
- Create: `tests/rls/multi-role.test.ts`
- Modify: `vitest.config.ts` (if needed to include `tests/rls/`)

- [ ] **Step 1: Author the test**

```ts
// tests/rls/multi-role.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function signIn(email: string, password: string) {
  const supabase = createClient(URL, ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return supabase;
}

describe("Multi-role RLS smoke", () => {
  // The local seed creates admin@commune.local / commune-admin-dev (see supabase/seed.sql).
  // Add a second seeded user before running this test, or create one in setup.
  let admin: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    admin = await signIn("admin@commune.local", "commune-admin-dev");
  });

  it("admin can update its own profile roles", async () => {
    const { data: me } = await admin.from("profiles").select("id, roles").single();
    expect(me).toBeTruthy();
    expect(Array.isArray(me!.roles)).toBe(true);
    const { error } = await admin
      .from("profiles")
      .update({ roles: ["admin", "member"] })
      .eq("id", me!.id);
    expect(error).toBeNull();
  });

  it("current_user_has_role('admin') returns true for admin", async () => {
    const { data, error } = await admin.rpc("current_user_has_role", { target: "admin" });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});
```

This is a smoke test, not exhaustive. Add more cases (member-can't-update-other-profile, librarian-can-update-books, etc.) as time allows. The test runs against the local Supabase. CI integration is out of scope.

- [ ] **Step 2: Run the test**

Ensure local Supabase is running: `supabase status` should show all services up. Then:

Run: `npx vitest run tests/rls/multi-role.test.ts`
Expected: PASS both tests.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/multi-role.test.ts
git commit -m "test(rls): smoke test for multi-role helper RPC"
```

---

## Final manual e2e sweep (not a task — verification before merge)

Run the dev server and verify, as a human:

1. **admin** sees Roster as bottom-bar slot 3; sidebar has every nav item.
2. **member** (created via /admin/invites or by editing your own roles to `["member"]`): bottom bar shows Library as slot 3; sidebar omits People, Brief, Hospitality, Admin, Roster, Manage*.
3. **librarian + logistics** (multi-role): bottom bar shows Manage inventory (logistics wins precedence); sidebar shows both Manage library and Manage inventory.
4. **worship-team member** (no extra role): sees Song bank in sidebar; non-worship/non-media member does not.
5. Mobile bottom-bar More button → drawer slides in from the **left**.
6. Drawer closes on backdrop click, Escape, and after clicking any nav link.
7. Sidebar footer: avatar, name, role, bell, sign-out all visible — no overlap.
8. Dashboard shows "Recent notifications" card with 0–5 rows.
9. People → admin edits a profile's roles via checkboxes; refresh shows new roles persisted.
10. `/admin/import` accepts a CSV with `roles` column; created profile has matching `roles` array.

Take screenshots into `test-screenshots/` as evidence. Same pattern as the 2026-05-08 sweep.

---

## Spec coverage check (self-review)

| Spec section | Covered by |
|---|---|
| Single source of truth `nav.ts` | Task 1 |
| Per-item gate model (roles ∨ teams) | Task 1 (matchesGate) |
| Allowlist table | Task 1 (NAV_ITEMS) |
| Bottom bar role-task map + precedence | Task 1 (bottomBarItems) |
| MobileDrawer left slide-in | Task 7 |
| BottomTabs 3-tab + More | Task 8 |
| AppShell drawer state | Task 9 |
| Sidebar consume nav.ts + footer overlap fix | Task 6 |
| Schema migration `0014` | Task 2 |
| `current_user_has_role` RPC | Task 2 |
| RLS policy rewrites | Task 2 |
| `SessionUser.roles[]` + `teams[]` | Task 3 |
| `has()` helper | Task 3 |
| `requireXxx` updates | Task 4 |
| `.role` call-site sweep | Task 5 |
| ProfileForms checkboxes + `updateRolesAction` | Task 10 |
| CSV `roles` column | Task 11 |
| `notifications.ts` extraction | Task 12 |
| Dashboard recent-notifications card | Task 13 |
| RLS regression smoke test | Task 14 |
| Out-of-scope items (per-service speaker, gestures, real-time push) | Acknowledged in spec; no task |
