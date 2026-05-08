# Navigation Redesign + Multi-Role Assignment — Design Spec

**Date:** 2026-05-08
**Status:** Draft (awaiting user review)

## Goal

Two coupled changes shipped together:

1. **Mobile nav UX:** replace bottom-sheet "More" drawer with a left side-drawer; rethink which items pin to the bottom bar (role-adaptive 3 + More).
2. **Access correctness:** hide nav items from users who can't use them, gated by both **role** and **team membership**.
3. **Multi-role assignment:** a user can hold multiple roles (e.g., librarian + logistics), edited via checkboxes on the People management page.

## Why now

- Manual end-to-end testing on 2026-05-08 surfaced a bottom-sheet "More" drawer that feels like a content-blocking modal on mobile and a sidebar footer with overlap glitches.
- Nav currently shows everything to everyone — members hit dead-end redirects on `/brief`, `/roster`, `/admin`.
- Single-role-per-user is too restrictive: the church's reality is that one volunteer often serves on Library + Logistics, or Media + Worship.

## Architecture

### Single source of truth: `src/lib/nav.ts`

```ts
import type { LucideIcon } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

export type Role = "admin" | "member" | "logistics" | "librarian" | "roster_maker";
export type TeamSlug = "media" | "worship" | "hospitality" | "preaching" | "kids" | "logistics" | "sound" | "welcome";

export type NavGate = {
  roles?: Role[];
  teams?: TeamSlug[];
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  gate: NavGate;          // {} = visible to everyone
  parent?: string;        // for indented sub-items in sidebar
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",        label: "Dashboard",        icon: LayoutDashboard, gate: {} },
  { href: "/people",           label: "People",           icon: Users,           gate: { roles: ["admin"] } },
  { href: "/schedule",         label: "Schedule",         icon: Calendar,        gate: {} },
  { href: "/inventory",        label: "Inventory",        icon: Boxes,           gate: {} },
  { href: "/inventory/manage", label: "Manage inventory", icon: Wrench,          gate: { roles: ["admin","logistics"] }, parent: "/inventory" },
  { href: "/library",          label: "Library",          icon: Library,         gate: {} },
  { href: "/library/manage",   label: "Manage library",   icon: BookOpen,        gate: { roles: ["admin","librarian"] }, parent: "/library" },
  { href: "/worship/songs",    label: "Song bank",        icon: Music,           gate: { teams: ["media","worship"] } },
  { href: "/hospitality",      label: "Hospitality",      icon: UtensilsCrossed, gate: { roles: ["admin"], teams: ["hospitality"] } },
  { href: "/roster",           label: "Roster",           icon: ClipboardList,   gate: { roles: ["admin","roster_maker"] } },
  { href: "/roster/grid",      label: "Roster grid",      icon: Grid3x3,         gate: { roles: ["admin","roster_maker"] }, parent: "/roster" },
  { href: "/brief",            label: "Brief",            icon: FileText,        gate: { roles: ["admin"], teams: ["media","preaching"] } },
  { href: "/admin",            label: "Admin",            icon: Settings,        gate: { roles: ["admin"] } },
];

export function matchesGate(gate: NavGate, user: SessionUser): boolean {
  if (user.roles.includes("admin")) return true;            // admin always sees everything
  if ((gate.roles ?? []).some(r => user.roles.includes(r))) return true;
  if ((gate.teams ?? []).some(t => user.teams.includes(t))) return true;
  return Object.keys(gate).length === 0;                    // empty gate = visible to all
}

export function visibleNavItems(user: SessionUser): NavItem[] {
  return NAV_ITEMS.filter(item => matchesGate(item.gate, user));
}

const ROLE_TASK: Record<Role, string> = {
  admin:        "/roster",
  logistics:    "/inventory/manage",
  librarian:    "/library/manage",
  roster_maker: "/roster/grid",
  member:       "/library",
};

export function bottomBarItems(user: SessionUser): NavItem[] {
  const home = NAV_ITEMS.find(i => i.href === "/dashboard")!;
  const schedule = NAV_ITEMS.find(i => i.href === "/schedule")!;
  // Role-task: precedence-ordered, not user.roles array order, so a librarian+logistics
  // user gets a deterministic bottom bar regardless of how the role array is sorted.
  const PRECEDENCE: Role[] = ["admin", "logistics", "librarian", "roster_maker", "member"];
  const taskRole = PRECEDENCE.find(r => user.roles.includes(r)) ?? "member";
  const task = NAV_ITEMS.find(i => i.href === ROLE_TASK[taskRole])!;
  return [home, schedule, task];
}
```

### Components

| File | Status | Purpose |
|---|---|---|
| `src/lib/nav.ts` | NEW | Nav config + gating helpers (above) |
| `src/components/layout/Sidebar.tsx` | REFACTOR | Desktop fixed sidebar (md+); consumes `visibleNavItems(user)`; footer rebuilt to fix overlap glitch |
| `src/components/layout/MobileDrawer.tsx` | NEW | Left side-drawer for mobile; receives `open`/`onClose`; renders the same nav list |
| `src/components/layout/BottomTabs.tsx` | REFACTOR | Slimmed to 3-tab role-adaptive bar + "More" trigger |
| `src/components/layout/AppShell.tsx` | UPDATE | Owns drawer open state; wires Sidebar + BottomTabs + MobileDrawer |
| `src/lib/auth.ts` | UPDATE | `SessionUser.roles: Role[]` (was `role: Role`); add `teams: TeamSlug[]`; `has()` helper |
| `src/lib/notifications.ts` | NEW | Extract `renderNotification()` from `NotificationsList.tsx` for reuse |
| `src/app/(app)/dashboard/page.tsx` | UPDATE | Add "Recent notifications" card |
| `src/app/(app)/people/[id]/ProfileForms.tsx` | UPDATE | Replace single role dropdown with 5 checkboxes (admin-only edit) |
| `src/app/(app)/people/[id]/actions.ts` | UPDATE | `updateRole` action becomes `updateRoles(roles: Role[])` |
| `src/app/(app)/admin/import/page.tsx` | UPDATE | CSV `roles` column (comma-separated); legacy `role` column accepted as fallback |

## Mobile drawer behavior

- Slides in from left, ~280px wide, full viewport height.
- Animation: `translate-x` 300ms ease-out.
- Backdrop: black/40 over the right-side peek; click closes.
- **Escape key** closes; body scroll locked while open.
- Auto-closes when a nav link is clicked (before navigation).
- **Layout:** app-name header + close button → role-filtered nav list (with indented sub-items) → footer with avatar/name/role + bell + sign-out.

## Bottom tab bar behavior

- 4 equal-width slots: Home, Schedule, role-task, More.
- Role-task picked by `bottomBarItems(user)`; if user holds multiple roles, picks the first matching role in `ROLE_TASK` order — admin > logistics > librarian > roster_maker > member.
- "More" toggles `MobileDrawer`. Active when current path is none of the 3 primary tabs.
- `safe-area-inset-bottom` padding preserved.
- Hidden at `md:` breakpoint.

## Multi-role refactor

### Schema migration (`supabase/migrations/0014_multi_role.sql`)

```sql
-- 1. Add roles array column with default
ALTER TABLE profiles
  ADD COLUMN roles profile_role[] NOT NULL DEFAULT '{member}';

-- 2. Backfill from existing single role
UPDATE profiles SET roles = ARRAY[role];

-- 3. Add helper for RLS rewrites
CREATE OR REPLACE FUNCTION public.current_user_has_role(target profile_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT target = ANY((SELECT roles FROM profiles WHERE id = auth.uid()))
$$;

-- 4. Rewrite every RLS policy that reads profiles.role
--    (13 references across migrations 0001-0013)
--    Each `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`
--    becomes `current_user_has_role('admin')`
--    Repeat for each role check in is_hospitality_or_admin,
--    is_media_or_admin, is_worship_write_allowed RPCs.

-- 5. Drop old column
ALTER TABLE profiles DROP COLUMN role;
```

The full RLS-rewrite SQL (every `DROP POLICY` + `CREATE POLICY`) is enumerated in the implementation plan — too long to copy here, but the rewrite is mechanical: same conditions, swap role-equality for `current_user_has_role()`.

### Auth helpers (`src/lib/auth.ts`)

```ts
export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];                  // was: role: Role
  teams: TeamSlug[];              // NEW
  status: "invited" | "active" | "on_leave" | "left";
};

const has = (u: SessionUser, ...roles: Role[]) => roles.some(r => u.roles.includes(r));

export async function getSessionUser(): Promise<SessionUser | null> {
  // ...existing user/profile fetch...
  // Add: SELECT name FROM teams JOIN team_member_positions ON ... WHERE profile_id = user.id
  //      → lowercase team names → teams: TeamSlug[]
}

export async function requireAdmin()           { if (!has(u, "admin")) redirect(...); }
export async function requireLogisticsOrAdmin(){ if (!has(u, "admin", "logistics")) redirect(...); }
export async function requireLibrarianOrAdmin(){ if (!has(u, "admin", "librarian")) redirect(...); }
// requireRosterGridAccess, requireBriefViewAccess, requireBriefEditAccess,
// requireWorshipWriteAccess, requireHospitalityOrAdmin: same pattern, plus
// existing per-team / per-service RPC checks unchanged.
```

### People management UI

**`/people/[id]` (admin-only edit form in `ProfileForms.tsx`):** replace single role dropdown with 5 checkboxes (admin / member / logistics / librarian / roster_maker).

- `member` is auto-checked and disabled — every user keeps the baseline role.
- Save action calls `update profiles set roles = $1 where id = $2`.
- Form-level validation: `roles.length >= 1` (always true given `member` baseline, but enforced server-side too).

**`/admin/import` (CSV):**

- Accept `roles` column with comma-separated values: `admin,librarian`.
- Backwards compatible: legacy `role` column accepted as a 1-element array.
- Validation: every value must be a valid `profile_role`; reject row otherwise.

### Nav gate behaves correctly under multi-role

The `matchesGate()` helper already iterates `user.roles` with `.some()`, so a user with `roles: ["librarian","logistics"]` sees both Manage library and Manage inventory automatically.

## Notifications surface (dashboard card)

`src/lib/notifications.ts` — extract from `NotificationsList.tsx`:

```ts
export type NotificationView = { title: string; subtitle: string; href: string };
export function renderNotification(n: Notification): NotificationView { ... }
```

`src/app/(app)/dashboard/page.tsx` — add a card:

```tsx
<section className="bg-white border rounded-xl p-4">
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-sm font-semibold">Recent notifications</h2>
    <Link href="/notifications" className="text-xs text-indigo-600">View all →</Link>
  </div>
  {recent.length === 0 ? <p className="text-sm text-slate-400">All caught up.</p>
    : recent.map(n => { /* render with renderNotification(n), unread style if !n.read_at */ })}
</section>
```

Server-renders the 5 most-recent rows for the current user. No client interactivity beyond the link click.

## Sidebar footer overlap fix

Current footer (in `Sidebar.tsx` lines 100–113) has the avatar visually clipped behind notifications/sign-out. Rebuild with explicit flex spacing:

```tsx
<div className="border-t border-slate-200 p-3 flex items-center gap-2">
  <div className="w-8 h-8 rounded-full bg-indigo-100 ... flex-shrink-0">{initials}</div>
  <div className="flex-1 min-w-0">
    <div className="text-xs font-medium truncate">{firstName} {lastName}</div>
    <div className="text-xs text-slate-500 capitalize">{primaryRole}</div>
  </div>
  <NotificationBadge />
  <SignOutButton />
</div>
```

Apply the same layout in `MobileDrawer.tsx`'s footer.

## Testing

### Unit (Vitest)

**`src/lib/nav.test.ts`** — covers:

- `visibleNavItems(user)` for each single-role user (admin, member, logistics, librarian, roster_maker) returns the expected hrefs per the allowlist table.
- Team-only-membership cases:
  - `roles: ["member"], teams: ["media"]` → Brief and Song bank visible (and nothing role-gated beyond baseline).
  - `roles: ["member"], teams: ["worship"]` → Song bank visible, Brief hidden.
  - `roles: ["member"], teams: ["preaching"]` → Brief visible, Song bank hidden.
  - `roles: ["member"], teams: ["hospitality"]` → Hospitality visible.
- Multi-role: `roles: ["librarian","logistics"]` → both Manage inventory and Manage library visible.
- Admin override: `roles: ["admin"], teams: []` → all team-gated items visible.
- `bottomBarItems(user)` returns `[Home, Schedule, role-task]` for each role; multi-role uses precedence (admin > logistics > librarian > roster_maker > member).

**`src/lib/auth.test.ts`** — covers `has()` helper across single + multi-role users.

### RLS regression smoke (Vitest, `tests/rls/multi-role.test.ts`)

Single test file (~80 lines) that:
1. Signs in as a member, librarian, admin via `supabase.auth.signInWithPassword`.
2. For each, runs a curated list of selects/inserts/updates that should succeed or be denied per the role policy matrix.
3. Asserts the success/denial outcome.

Catches RLS-policy-rewrite mistakes that unit tests can't. Runs against the local Supabase instance.

### Manual e2e (Playwright sweep)

Same approach as 2026-05-08 testing — manually verify after implementation:
- admin sees Roster as bottom-bar slot 3, member sees Library.
- Hamburger triggers left side-drawer.
- Members don't see /admin, /roster, /people, /brief, /hospitality in nav.
- Multi-role user (librarian + logistics) sees both Manage pages.
- People edit page persists multi-role checkbox state.

## Out of scope (explicit)

- Per-service speaker nav gating (a non-admin speaker for one service does not see Brief in nav unless they're also in Media or Preaching team — server-side `requireBriefViewAccess` still grants page access).
- Per-team-leader Roster Grid nav visibility (handled at the page level via existing `requireRosterGridAccess`; nav stays role-only).
- Real-time notification push (existing `NotificationBadge` polls on pathname change; no change here).
- Mobile gesture support (swipe-to-open the drawer); only the More button trigger.
- Custom team taxonomy beyond the 8 existing teams (Hospitality, Kids, Logistics, Media, Preaching, Sound, Welcome, Worship).
- Junction table schema for roles (chose Postgres array column; revisit only if role count grows beyond ~10).

## Migration safety

- **Local:** `supabase db reset` reapplies all migrations cleanly.
- **Remote:** the `0014_multi_role.sql` migration runs as one transaction. Failed RLS-policy rewrites roll back automatically. Worth a dry-run on a Supabase branch DB before pushing to prod, especially since this touches every existing policy.
- **App-side rollout:** keep the `getSessionUser()` change in lockstep with the schema migration. The `SessionUser.role → roles[]` rename is a breaking change to ~36 call sites; do them in one PR atomically.

## Estimated impact

- **New files:** 3 (`src/lib/nav.ts`, `src/lib/notifications.ts`, `src/components/layout/MobileDrawer.tsx`)
- **Refactored files:** ~6 (auth, sidebar, bottomtabs, appshell, people-edit, dashboard)
- **Migrations:** 1 (`0014_multi_role.sql`)
- **Touch points for `user.role` → `user.roles`:** ~36 call sites grep'd in `src/`
- **RLS policy references to `profiles.role`:** 19 string matches across migrations 0001–0013
