# People Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the adaptive navigation shell and full people management module: member directory, profile pages with tabs, improved invite flow with phone/teams, and CSV bulk import.

**Architecture:** Replace the existing flat header in `src/app/(app)/layout.tsx` with an `AppShell` server component that renders a fixed desktop `Sidebar` and a mobile `BottomTabs` — both client components using `usePathname`. People pages are server-rendered with server actions for mutations; client components handle only search filtering and CSV file parsing.

**Tech Stack:** Next.js 16.2.4 App Router, Supabase JS v2 + RLS, Tailwind v4, shadcn/ui (base-nova style), Zod v4, Vitest, Playwright

> **Before starting:** Read `node_modules/next/dist/docs/` for Next.js 16 specifics. Key rules already discovered: `params` and `searchParams` are `Promise<…>` — `await` in server components, `use()` in client components. File is `src/proxy.ts` not `src/middleware.ts`.

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/0003_people_management.sql` | teams + member_teams tables, profiles columns, RLS |
| Modify | `src/types/database.ts` | regenerated from local Supabase |
| Create | `src/components/layout/AppShell.tsx` | server component wrapping Sidebar + BottomTabs |
| Create | `src/components/layout/Sidebar.tsx` | desktop fixed sidebar (client) |
| Create | `src/components/layout/BottomTabs.tsx` | mobile bottom nav (client) |
| Modify | `src/app/(app)/layout.tsx` | use AppShell instead of bare header |
| Create | `src/app/(app)/people/page.tsx` | admin: member list; member: redirect to own profile |
| Create | `src/app/(app)/people/PeopleList.tsx` | client component for search + filter |
| Create | `src/app/(app)/people/[id]/page.tsx` | profile page with Details/Teams/History tabs |
| Create | `src/app/(app)/people/[id]/actions.ts` | updateProfile, updateStatus, updateRole, addTeam, removeTeam |
| Modify | `src/app/(app)/admin/invites/page.tsx` | server wrapper; extract InviteForm client component |
| Create | `src/app/(app)/admin/invites/InviteForm.tsx` | invite form with phone + team checkboxes |
| Modify | `src/app/(app)/admin/invites/actions.ts` | add phone + teamIds to sendInviteAction |
| Create | `src/lib/csv.ts` | pure CSV parser: `parseCsv(text): CsvParseResult` |
| Create | `tests/unit/csv.test.ts` | Vitest unit tests for parseCsv |
| Create | `src/app/(app)/admin/import/actions.ts` | bulkImportAction server action |
| Create | `src/app/(app)/admin/import/page.tsx` | CSV upload → preview → confirm → results |
| Create | `tests/e2e/people.spec.ts` | Playwright E2E tests |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0003_people_management.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0003_people_management.sql
-- Plan 02: People Management
-- Adds teams, member_teams, and contact fields to profiles

-- Extend profiles with contact fields
alter table profiles
  add column if not exists phone   text,
  add column if not exists address text,
  add column if not exists bio     text;

-- Teams lookup table
create table teams (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  color      text        not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- Member–team join table
create table member_teams (
  profile_id  uuid        not null references profiles(id)  on delete cascade,
  team_id     uuid        not null references teams(id)     on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, team_id)
);

-- RLS: teams
alter table teams enable row level security;

create policy "teams_authenticated_read" on teams
  for select using (auth.role() = 'authenticated');

create policy "teams_admin_all" on teams
  for all using (is_admin());

-- RLS: member_teams
alter table member_teams enable row level security;

create policy "member_teams_authenticated_read" on member_teams
  for select using (auth.role() = 'authenticated');

create policy "member_teams_admin_all" on member_teams
  for all using (is_admin());

-- Seed default teams for local dev
insert into teams (name, color) values
  ('Worship',   '#6366f1'),
  ('Sound',     '#f59e0b'),
  ('Kids',      '#10b981'),
  ('Welcome',   '#ec4899'),
  ('Logistics', '#64748b')
on conflict (name) do nothing;
```

- [ ] **Step 2: Apply migration locally**

Supabase must be running (`supabase start`). Then:

```bash
supabase db reset
```

Expected: `Finished supabase db reset.` (re-seeds the admin user from seed.sql)

- [ ] **Step 3: Verify tables exist**

```bash
supabase db query "select table_name from information_schema.tables where table_schema = 'public' order by table_name;"
```

Expected output includes: `member_teams`, `profiles`, `teams`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_people_management.sql
git commit -m "feat(db): add teams, member_teams tables and profile contact fields"
```

---

## Task 2: Update TypeScript Database Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Regenerate types from local Supabase**

```bash
supabase gen types typescript --local > src/types/database.ts
```

Expected: file updated silently

- [ ] **Step 2: Verify new types are present**

```bash
grep -n "teams\|member_teams\|phone" src/types/database.ts | head -20
```

Expected: lines showing `teams:`, `member_teams:`, and `phone` field in profiles Row type

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenerate database types for Plan 02 schema"
```

---

## Task 3: Navigation Shell

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/BottomTabs.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `src/components/layout/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

type SidebarProps = {
  firstName: string;
  lastName: string;
  role: "admin" | "member" | "logistics";
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/people",    label: "People",    icon: Users },
  { href: "/roster",    label: "Roster",    icon: Calendar,  disabled: true },
  { href: "/admin",     label: "Admin",     icon: Settings,  adminOnly: true },
] as const;

export function Sidebar({ firstName, lastName, role }: SidebarProps) {
  const pathname = usePathname();
  const initials = `${firstName[0]}${lastName[0]}`.toUpperCase();

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-60 bg-white border-r border-slate-200 z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 h-14 px-4 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          C
        </div>
        <span className="font-semibold text-slate-900 text-sm">Commune</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, disabled, adminOnly }) => {
          if (adminOnly && role !== "admin") return null;
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={disabled ? "#" : href}
              aria-disabled={disabled}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                disabled && "opacity-40 pointer-events-none",
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-slate-200 p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-900 truncate">
            {firstName} {lastName}
          </div>
          <div className="text-xs text-slate-500 capitalize">{role}</div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create `src/components/layout/BottomTabs.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Calendar, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type BottomTabsProps = {
  role: "admin" | "member" | "logistics";
};

export function BottomTabs({ role }: BottomTabsProps) {
  const pathname = usePathname();

  const tabs = [
    { href: "/dashboard", label: "Home",   icon: LayoutDashboard },
    { href: "/people",    label: "People", icon: Users },
    { href: "/roster",    label: "Roster", icon: Calendar, disabled: true },
    ...(role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: Settings, disabled: false as const }]
      : []),
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex">
        {tabs.map(({ href, label, icon: Icon, disabled }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={disabled ? "#" : href}
              aria-disabled={disabled}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
                active ? "text-indigo-600" : "text-slate-500",
                disabled && "opacity-40 pointer-events-none",
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create `src/components/layout/AppShell.tsx`**

```tsx
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";
import type { SessionUser } from "@/lib/auth";

type AppShellProps = {
  user: SessionUser;
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        firstName={user.firstName}
        lastName={user.lastName}
        role={user.role}
      />
      {/* md:pl-60 clears the 240px sidebar; pb-16 clears the mobile bottom nav */}
      <main className="md:pl-60 pb-16 md:pb-0 min-h-screen">
        <div className="p-6 max-w-5xl mx-auto">{children}</div>
      </main>
      <BottomTabs role={user.role} />
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/app/(app)/layout.tsx`**

```tsx
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
```

- [ ] **Step 5: Start dev server and verify nav renders**

```bash
pnpm dev
```

Open http://localhost:3000. Sign in as `admin@commune.local` / `commune-admin-dev`. Confirm: sidebar visible on desktop (≥768px), bottom tabs visible on mobile. Active route "Dashboard" highlighted in indigo. Sign out button present.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ src/app/(app)/layout.tsx
git commit -m "feat(nav): add adaptive AppShell with Sidebar and BottomTabs"
```

---

## Task 4: People List Page

**Files:**
- Create: `src/app/(app)/people/page.tsx`
- Create: `src/app/(app)/people/PeopleList.tsx`

- [ ] **Step 1: Create `src/app/(app)/people/PeopleList.tsx`** (client component — handles search/filter)

```tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string; color: string };

export type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "admin" | "member" | "logistics";
  status: "invited" | "active" | "on_leave" | "left";
  teams: Team[];
};

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-orange-500",
];

function avatarColor(id: string): string {
  const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  invited:  "bg-blue-100 text-blue-700",
  on_leave: "bg-yellow-100 text-yellow-700",
  left:     "bg-slate-100 text-slate-500",
};

const STATUS_LABELS: Record<string, string> = {
  active:   "Active",
  invited:  "Invited",
  on_leave: "On leave",
  left:     "Left",
};

type Filter = "all" | "active" | "on_leave" | "invited";

type PeopleListProps = {
  members: MemberRow[];
  teams: Team[];
};

export function PeopleList({ members, teams }: PeopleListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
      if (search && !fullName.includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (teamFilter !== "all" && !m.teams.some((t) => t.id === teamFilter))
        return false;
      return true;
    });
  }, [members, search, statusFilter, teamFilter]);

  return (
    <div>
      {/* Search + filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Filter)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="invited">Invited</option>
        </select>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500 mb-3">
        {filtered.length} member{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 p-6 text-center">
            No members match your filters.
          </p>
        )}
        {filtered.map((m) => (
          <Link
            key={m.id}
            href={`/people/${m.id}`}
            className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0",
                avatarColor(m.id),
              )}
            >
              {m.first_name[0]}{m.last_name[0]}
            </div>

            {/* Name + subtitle */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">
                {m.first_name} {m.last_name}
              </div>
              <div className="text-xs text-slate-500 capitalize truncate">
                {m.role}
                {m.teams.length > 0 && ` · ${m.teams.map((t) => t.name).join(", ")}`}
              </div>
            </div>

            {/* Status badge */}
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                STATUS_STYLES[m.status],
              )}
            >
              {STATUS_LABELS[m.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(app)/people/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PeopleList, type MemberRow } from "./PeopleList";

export default async function PeoplePage() {
  const user = await requireUser();

  // Members see only their own profile
  if (user.role !== "admin") {
    redirect(`/people/${user.id}`);
  }

  const supabase = await createClient();

  const { data: members, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, status, member_teams(teams(id, name, color))")
    .neq("status", "left")
    .order("first_name");

  if (error) throw new Error(error.message);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, color")
    .order("name");

  const rows: MemberRow[] = (members ?? []).map((m) => ({
    id: m.id,
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email,
    role: m.role as MemberRow["role"],
    status: m.status as MemberRow["status"],
    teams: (m.member_teams ?? [])
      .map((mt: { teams: { id: string; name: string; color: string } | null }) => mt.teams)
      .filter((t): t is { id: string; name: string; color: string } => t !== null),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">People</h1>
        <Link
          href="/admin/invites"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Invite member
        </Link>
      </div>
      <PeopleList members={rows} teams={teams ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: Verify the people list renders**

Navigate to http://localhost:3000/people as admin. Confirm: member list shows (at least the seeded Dev Admin), search filters work, "Invite member" button is visible.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/people/
git commit -m "feat(people): add member directory with search and status filter"
```

---

## Task 5: Profile Page (View)

**Files:**
- Create: `src/app/(app)/people/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/(app)/people/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-indigo-500", "bg-amber-500", "bg-pink-500",
  "bg-emerald-500", "bg-violet-500", "bg-orange-500",
];
function avatarColor(id: string): string {
  const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  invited:  "bg-blue-100 text-blue-700",
  on_leave: "bg-yellow-100 text-yellow-700",
  left:     "bg-slate-100 text-slate-500",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Active", invited: "Invited", on_leave: "On leave", left: "Left",
};

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab = "details" }, viewer] = await Promise.all([
    params,
    searchParams,
    requireUser(),
  ]);

  // Members can only see their own profile
  if (viewer.role !== "admin" && id !== viewer.id) {
    redirect(`/people/${viewer.id}`);
  }

  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, status, phone, address, bio, created_at")
    .eq("id", id)
    .single();

  if (error || !profile) redirect("/people");

  const { data: memberTeams } = await supabase
    .from("member_teams")
    .select("teams(id, name, color)")
    .eq("profile_id", id);

  const { data: allTeams } = await supabase
    .from("teams")
    .select("id, name, color")
    .order("name");

  const assignedTeamIds = new Set(
    (memberTeams ?? []).map((mt: { teams: { id: string } | null }) => mt.teams?.id).filter(Boolean),
  );
  const assignedTeams = (memberTeams ?? [])
    .map((mt: { teams: { id: string; name: string; color: string } | null }) => mt.teams)
    .filter((t): t is { id: string; name: string; color: string } => t !== null);

  const isAdmin = viewer.role === "admin";
  const isOwnProfile = viewer.id === id;
  const canEdit = isAdmin || isOwnProfile;

  const tabs = ["details", "teams", "history"] as const;

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <Link
        href="/people"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4"
      >
        ← People
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="p-6 flex items-center gap-5">
          <div
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0",
              avatarColor(profile.id),
            )}
          >
            {profile.first_name[0]}{profile.last_name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">
              {profile.first_name} {profile.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-slate-500 capitalize">{profile.role}</span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  STATUS_STYLES[profile.status],
                )}
              >
                {STATUS_LABELS[profile.status]}
              </span>
            </div>
          </div>
          {canEdit && (
            <Link
              href={`/people/${id}?mode=edit`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Edit
            </Link>
          )}
        </div>

        {/* Tab bar */}
        <div className="border-t border-slate-200">
          <nav className="flex px-6">
            {tabs.map((t) => (
              <Link
                key={t}
                href={`/people/${id}${t !== "details" ? `?tab=${t}` : ""}`}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 -mb-px capitalize transition-colors",
                  tab === t
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-900",
                )}
              >
                {t}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      {tab === "details" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone ?? "—"} />
          <Field label="Address" value={profile.address ?? "—"} />
          <Field label="Bio" value={profile.bio ?? "—"} />
          <Field
            label="Joined"
            value={new Date(profile.created_at).toLocaleDateString("en-AU", {
              month: "long",
              year: "numeric",
            })}
          />

          {/* Admin-only: status + role */}
          {isAdmin && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Admin actions
              </p>
              <StatusForm profileId={id} currentStatus={profile.status} />
              <RoleForm profileId={id} currentRole={profile.role} />
            </div>
          )}
        </div>
      )}

      {tab === "teams" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Teams</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {assignedTeams.length === 0 && (
              <p className="text-sm text-slate-400">No teams assigned.</p>
            )}
            {assignedTeams.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-indigo-50 text-indigo-700"
              >
                {t.name}
                {isAdmin && <RemoveTeamForm profileId={id} teamId={t.id} />}
              </span>
            ))}
          </div>
          {isAdmin && (
            <AddTeamForm
              profileId={id}
              allTeams={allTeams ?? []}
              assignedTeamIds={assignedTeamIds}
            />
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-400">
            Roster history will appear here once rostering is set up (Plan 3).
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

// ProfileForms is created in Task 6. Move this import to the TOP of the file
// (with the other imports) before running. It must not stay at the bottom.
import { StatusForm, RoleForm, RemoveTeamForm, AddTeamForm } from "./ProfileForms";
```

> **Note:** `ProfileForms` is created in Task 6. The page will not compile until Task 6 is complete. That is expected — implement both tasks before testing.

- [ ] **Step 2: Commit (partial — page depends on Task 6)**

Do not commit yet. Continue to Task 6.

---

## Task 6: Profile Actions + Edit Form

**Files:**
- Create: `src/app/(app)/people/[id]/actions.ts`
- Create: `src/app/(app)/people/[id]/ProfileForms.tsx`
- Modify: `src/app/(app)/people/[id]/page.tsx` (add edit mode)

- [ ] **Step 1: Create `src/app/(app)/people/[id]/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Update own contact fields (or full update for admin) ───────────────────

const contactSchema = z.object({
  phone:   z.string().max(30).optional(),
  address: z.string().max(200).optional(),
  bio:     z.string().max(500).optional(),
});

const adminProfileSchema = contactSchema.extend({
  firstName: z.string().min(1, "First name required"),
  lastName:  z.string().min(1, "Last name required"),
});

export type UpdateProfileState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function updateProfileAction(
  profileId: string,
  _prev: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const viewer = await requireUser();
  const isAdmin = viewer.role === "admin";
  const isOwn = viewer.id === profileId;

  if (!isAdmin && !isOwn) {
    return { status: "error", message: "Not authorised." };
  }

  const supabase = await createClient();

  if (isAdmin) {
    const parsed = adminProfileSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName:  formData.get("lastName"),
      phone:     formData.get("phone") ?? undefined,
      address:   formData.get("address") ?? undefined,
      bio:       formData.get("bio") ?? undefined,
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0].message };
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: parsed.data.firstName,
        last_name:  parsed.data.lastName,
        phone:      parsed.data.phone ?? null,
        address:    parsed.data.address ?? null,
        bio:        parsed.data.bio ?? null,
      })
      .eq("id", profileId);
    if (error) return { status: "error", message: error.message };
  } else {
    // Member: only contact fields
    const parsed = contactSchema.safeParse({
      phone:   formData.get("phone") ?? undefined,
      address: formData.get("address") ?? undefined,
      bio:     formData.get("bio") ?? undefined,
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0].message };
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        phone:   parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        bio:     parsed.data.bio ?? null,
      })
      .eq("id", profileId);
    if (error) return { status: "error", message: error.message };
  }

  revalidatePath(`/people/${profileId}`);
  redirect(`/people/${profileId}`);
}

// ─── Admin: update status ────────────────────────────────────────────────────

const statusValues = ["active", "on_leave", "left"] as const;

export async function updateStatusAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  await requireUser().then((u) => {
    if (u.role !== "admin") throw new Error("Not authorised.");
  });
  const status = formData.get("status") as string;
  if (!statusValues.includes(status as (typeof statusValues)[number])) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ status }).eq("id", profileId);
  revalidatePath(`/people/${profileId}`);
  revalidatePath("/people");
}

// ─── Admin: update role ──────────────────────────────────────────────────────

const roleValues = ["member", "logistics", "admin"] as const;

export async function updateRoleAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  await requireUser().then((u) => {
    if (u.role !== "admin") throw new Error("Not authorised.");
  });
  const role = formData.get("role") as string;
  if (!roleValues.includes(role as (typeof roleValues)[number])) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ role }).eq("id", profileId);
  revalidatePath(`/people/${profileId}`);
  revalidatePath("/people");
}

// ─── Admin: add team membership ──────────────────────────────────────────────

export async function addTeamAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  await requireUser().then((u) => {
    if (u.role !== "admin") throw new Error("Not authorised.");
  });
  const teamId = formData.get("teamId") as string;
  if (!teamId) return;

  const supabase = await createClient();
  await supabase
    .from("member_teams")
    .upsert({ profile_id: profileId, team_id: teamId });
  revalidatePath(`/people/${profileId}`);
}

// ─── Admin: remove team membership ──────────────────────────────────────────

export async function removeTeamAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  await requireUser().then((u) => {
    if (u.role !== "admin") throw new Error("Not authorised.");
  });
  const teamId = formData.get("teamId") as string;
  if (!teamId) return;

  const supabase = await createClient();
  await supabase
    .from("member_teams")
    .delete()
    .eq("profile_id", profileId)
    .eq("team_id", teamId);
  revalidatePath(`/people/${profileId}`);
}
```

- [ ] **Step 2: Create `src/app/(app)/people/[id]/ProfileForms.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import {
  updateProfileAction,
  updateStatusAction,
  updateRoleAction,
  addTeamAction,
  removeTeamAction,
  type UpdateProfileState,
} from "./actions";

// ── Status form ──────────────────────────────────────────────────────────────

export function StatusForm({
  profileId,
  currentStatus,
}: {
  profileId: string;
  currentStatus: string;
}) {
  return (
    <form action={updateStatusAction.bind(null, profileId)}>
      <label className="text-xs text-slate-600">
        Status
        <select
          name="status"
          defaultValue={currentStatus}
          className="ml-2 text-xs border border-slate-200 rounded px-2 py-1 bg-white"
          onChange={(e) => (e.target.form as HTMLFormElement).requestSubmit()}
        >
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="left">Left</option>
        </select>
      </label>
    </form>
  );
}

// ── Role form ────────────────────────────────────────────────────────────────

export function RoleForm({
  profileId,
  currentRole,
}: {
  profileId: string;
  currentRole: string;
}) {
  return (
    <form action={updateRoleAction.bind(null, profileId)}>
      <label className="text-xs text-slate-600">
        Role
        <select
          name="role"
          defaultValue={currentRole}
          className="ml-2 text-xs border border-slate-200 rounded px-2 py-1 bg-white"
          onChange={(e) => (e.target.form as HTMLFormElement).requestSubmit()}
        >
          <option value="member">Member</option>
          <option value="logistics">Logistics</option>
          <option value="admin">Admin</option>
        </select>
      </label>
    </form>
  );
}

// ── Remove team button ───────────────────────────────────────────────────────

export function RemoveTeamForm({
  profileId,
  teamId,
}: {
  profileId: string;
  teamId: string;
}) {
  return (
    <form action={removeTeamAction.bind(null, profileId)} className="inline">
      <input type="hidden" name="teamId" value={teamId} />
      <button
        type="submit"
        className="text-indigo-400 hover:text-indigo-700 leading-none ml-1"
        aria-label="Remove team"
      >
        ×
      </button>
    </form>
  );
}

// ── Add team dropdown ────────────────────────────────────────────────────────

export function AddTeamForm({
  profileId,
  allTeams,
  assignedTeamIds,
}: {
  profileId: string;
  allTeams: { id: string; name: string; color: string }[];
  assignedTeamIds: Set<string | undefined>;
}) {
  const available = allTeams.filter((t) => !assignedTeamIds.has(t.id));
  if (available.length === 0) return null;

  return (
    <form action={addTeamAction.bind(null, profileId)} className="flex items-center gap-2">
      <select
        name="teamId"
        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        {available.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        + Add team
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Add edit mode to `src/app/(app)/people/[id]/page.tsx`**

Add `mode` to the searchParams destructure and conditionally render an edit form. Insert this block between the header card and the tab content (after the closing `</div>` of the header card):

```tsx
// Add mode to the searchParams destructure at the top of the function:
// const [{ id }, { tab = "details", mode }, viewer] = await Promise.all([

// Then add this edit form block, rendered when mode === "edit":
{mode === "edit" && canEdit && (
  <EditProfileForm
    profile={profile}
    isAdmin={isAdmin}
    profileId={id}
  />
)}
```

And add this import at the bottom of the file:

```tsx
import { EditProfileForm } from "./ProfileForms";
```

Add `EditProfileForm` to `ProfileForms.tsx`:

```tsx
// Add to ProfileForms.tsx

export function EditProfileForm({
  profile,
  isAdmin,
  profileId,
}: {
  profile: {
    first_name: string;
    last_name: string;
    phone: string | null;
    address: string | null;
    bio: string | null;
  };
  isAdmin: boolean;
  profileId: string;
}) {
  const initial: UpdateProfileState = { status: "idle" };
  const boundAction = updateProfileAction.bind(null, profileId);
  const [state, formAction, isPending] = useActionState(boundAction, initial);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Edit profile</h2>
      <form action={formAction} className="space-y-4">
        {isAdmin && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">First name</label>
              <input
                name="firstName"
                defaultValue={profile.first_name}
                required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Last name</label>
              <input
                name="lastName"
                defaultValue={profile.last_name}
                required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Phone</label>
          <input
            name="phone"
            defaultValue={profile.phone ?? ""}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Address</label>
          <input
            name="address"
            defaultValue={profile.address ?? ""}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Bio</label>
          <textarea
            name="bio"
            defaultValue={profile.bio ?? ""}
            rows={3}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
          />
        </div>

        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <a
            href={`/people/${profileId}`}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 px-4 py-2"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify the profile page compiles and renders**

Navigate to http://localhost:3000/people, click a member row. Confirm: header with avatar + name + status badge, Details/Teams/History tabs, admin actions section visible for admin users. Click Edit, confirm the edit form appears.

- [ ] **Step 5: Run type check**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/people/[id]/
git commit -m "feat(people): add profile page with tabs, edit form, and admin actions"
```

---

## Task 7: Extend Invite Form with Phone + Teams

**Files:**
- Create: `src/app/(app)/admin/invites/InviteForm.tsx`
- Modify: `src/app/(app)/admin/invites/page.tsx`
- Modify: `src/app/(app)/admin/invites/actions.ts`

- [ ] **Step 1: Update `src/app/(app)/admin/invites/actions.ts`**

Replace the full file:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateInviteToken } from "@/lib/invites";

const schema = z.object({
  firstName: z.string().min(1, "First name required"),
  lastName:  z.string().min(1, "Last name required"),
  email:     z.string().email("Invalid email"),
  phone:     z.string().max(30).optional(),
});

export type InviteFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  inviteUrl?: string;
};

export async function sendInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    firstName: formData.get("firstName"),
    lastName:  formData.get("lastName"),
    email:     formData.get("email"),
    phone:     formData.get("phone") ?? undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const teamIds = formData.getAll("teamId") as string[];
  const { token, expiresAt } = generateInviteToken();
  const admin = createAdminClient();

  // Check for existing profile
  const { data: existing } = await admin
    .from("profiles")
    .select("id, status")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (existing && existing.status === "active") {
    return { status: "error", message: "This email already has an active account." };
  }

  let profileId: string;

  if (existing) {
    // Re-invite: refresh token + name + phone
    const { error } = await admin.from("profiles").update({
      invite_token:      token,
      invite_expires_at: expiresAt.toISOString(),
      first_name:        parsed.data.firstName,
      last_name:         parsed.data.lastName,
      phone:             parsed.data.phone ?? null,
      status:            "invited",
    }).eq("id", existing.id);
    if (error) return { status: "error", message: error.message };
    profileId = existing.id;
  } else {
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email:          parsed.data.email,
        email_confirm:  true,
        user_metadata:  { pending_activation: true },
      });
    if (authError || !authData.user) {
      return {
        status: "error",
        message: authError?.message ?? "Failed to reserve auth user",
      };
    }
    const { error } = await admin.from("profiles").insert({
      id:                authData.user.id,
      first_name:        parsed.data.firstName,
      last_name:         parsed.data.lastName,
      email:             parsed.data.email,
      phone:             parsed.data.phone ?? null,
      role:              "member",
      status:            "invited",
      invite_token:      token,
      invite_expires_at: expiresAt.toISOString(),
    });
    if (error) return { status: "error", message: error.message };
    profileId = authData.user.id;
  }

  // Assign teams (upsert to handle re-invite)
  if (teamIds.length > 0) {
    const supabase = await createClient();
    await supabase.from("member_teams").upsert(
      teamIds.map((teamId) => ({ profile_id: profileId, team_id: teamId })),
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/activate/${token}`;

  revalidatePath("/admin/invites");
  return { status: "success", inviteUrl };
}
```

- [ ] **Step 2: Create `src/app/(app)/admin/invites/InviteForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { sendInviteAction, type InviteFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Team = { id: string; name: string };

type Props = { teams: Team[] };

const initialState: InviteFormState = { status: "idle" };

export function InviteForm({ teams }: Props) {
  const [state, formAction, isPending] = useActionState(
    sendInviteAction,
    initialState,
  );

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Send invite</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>

          {teams.length > 0 && (
            <div className="space-y-2">
              <Label>Teams</Label>
              <div className="grid grid-cols-2 gap-2">
                {teams.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="teamId"
                      value={t.id}
                      className="rounded"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {state.status === "error" && (
            <p className="text-sm text-red-600">{state.message}</p>
          )}
          {state.status === "success" && state.inviteUrl && (
            <div className="rounded-md bg-green-50 p-3 text-sm">
              <p className="font-medium text-green-900">Invite created.</p>
              <p className="mt-1 text-green-800">Share this link:</p>
              <code className="mt-1 block break-all text-xs">{state.inviteUrl}</code>
            </div>
          )}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending…" : "Send invite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Replace `src/app/(app)/admin/invites/page.tsx`** (becomes a server component)

```tsx
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";

export default async function InvitesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .order("name");
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Invite member</h1>
      <InviteForm teams={teams ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Test the invite flow**

Navigate to http://localhost:3000/admin/invites. Fill out the form including phone and at least one team checkbox. Submit. Confirm: invite URL appears, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/admin/invites/
git commit -m "feat(invites): add phone and team selection to invite form"
```

---

## Task 8: CSV Parser (TDD)

**Files:**
- Create: `tests/unit/csv.test.ts`
- Create: `src/lib/csv.ts`

- [ ] **Step 1: Write the failing tests first**

Create `tests/unit/csv.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses a valid CSV with all columns", () => {
    const csv = `name,email,phone,teams
Joshua Fernandes,josh@church.com,+61412345678,Worship|Sound
Sarah Mitchell,sarah@church.com,,Kids`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "Joshua Fernandes",
      email: "josh@church.com",
      phone: "+61412345678",
      teams: ["Worship", "Sound"],
    });
    expect(rows[1]).toEqual({
      name: "Sarah Mitchell",
      email: "sarah@church.com",
      phone: "",
      teams: ["Kids"],
    });
  });

  it("returns error for missing name", () => {
    const csv = `name,email\n,bad@church.com`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toBe("Missing name");
  });

  it("returns error for invalid email", () => {
    const csv = `name,email\nJohn,notanemail`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toBe("Invalid or missing email");
  });

  it("returns error for missing required headers", () => {
    const csv = `name\nJohn`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toContain("Missing required columns");
  });

  it("handles missing optional columns gracefully", () => {
    const csv = `name,email\nJohn,john@church.com`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].phone).toBe("");
    expect(rows[0].teams).toHaveLength(0);
  });

  it("is case-insensitive for column headers", () => {
    const csv = `Name,Email,Phone\nJohn,john@church.com,+1234`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].name).toBe("John");
    expect(rows[0].phone).toBe("+1234");
  });

  it("skips blank lines", () => {
    const csv = `name,email\nJohn,john@church.com\n\nJane,jane@church.com`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test
```

Expected: all 7 tests FAIL with "Cannot find module '@/lib/csv'"

- [ ] **Step 3: Implement `src/lib/csv.ts`**

```typescript
export type CsvRow = {
  name: string;
  email: string;
  phone: string;
  teams: string[];
};

export type CsvParseResult = {
  rows: CsvRow[];
  errors: Array<{ line: number; message: string }>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsv(text: string): CsvParseResult {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ line: 0, message: "File is empty or missing data rows" }],
    };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx  = headers.indexOf("name");
  const emailIdx = headers.indexOf("email");
  const phoneIdx = headers.indexOf("phone");
  const teamsIdx = headers.indexOf("teams");

  if (nameIdx === -1 || emailIdx === -1) {
    return {
      rows: [],
      errors: [
        { line: 1, message: "Missing required columns: name, email" },
      ],
    };
  }

  const rows: CsvRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(",").map((c) => c.trim());
    const name  = cols[nameIdx]  ?? "";
    const email = cols[emailIdx] ?? "";
    const phone = phoneIdx >= 0 ? (cols[phoneIdx] ?? "") : "";
    const teamsStr = teamsIdx >= 0 ? (cols[teamsIdx] ?? "") : "";
    const teams = teamsStr
      ? teamsStr.split("|").map((t) => t.trim()).filter(Boolean)
      : [];

    if (!name) {
      errors.push({ line: i + 1, message: "Missing name" });
      continue;
    }
    if (!email || !EMAIL_RE.test(email)) {
      errors.push({ line: i + 1, message: "Invalid or missing email" });
      continue;
    }

    rows.push({ name, email, phone, teams });
  }

  return { rows, errors };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test
```

Expected: 7 tests PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts tests/unit/csv.test.ts
git commit -m "feat(csv): add CSV parser with unit tests"
```

---

## Task 9: CSV Import Page + Bulk Action

**Files:**
- Create: `src/app/(app)/admin/import/actions.ts`
- Create: `src/app/(app)/admin/import/page.tsx`

- [ ] **Step 1: Create `src/app/(app)/admin/import/actions.ts`**

```typescript
"use server";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateInviteToken } from "@/lib/invites";
import type { CsvRow } from "@/lib/csv";

export type ImportResult = {
  created: number;
  skipped: string[];
  results: Array<{ name: string; email: string; inviteUrl: string }>;
  errors: Array<{ email: string; message: string }>;
};

export async function bulkImportAction(formData: FormData): Promise<ImportResult> {
  await requireAdmin();

  const rowsJson = formData.get("rows") as string;
  const rows: CsvRow[] = JSON.parse(rowsJson);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const admin = createAdminClient();
  const supabase = await createClient();

  const result: ImportResult = {
    created: 0,
    skipped: [],
    results: [],
    errors: [],
  };

  // Resolve team names → IDs (create missing teams)
  const teamNameCache = new Map<string, string>();
  const allTeamNames = [...new Set(rows.flatMap((r) => r.teams))];
  for (const name of allTeamNames) {
    const { data: existing } = await supabase
      .from("teams")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (existing) {
      teamNameCache.set(name, existing.id);
    } else {
      const { data: created } = await admin
        .from("teams")
        .insert({ name })
        .select("id")
        .single();
      if (created) teamNameCache.set(name, created.id);
    }
  }

  for (const row of rows) {
    const firstName = row.name.split(" ")[0];
    const lastName  = row.name.split(" ").slice(1).join(" ") || "—";

    // Skip duplicates
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", row.email)
      .maybeSingle();
    if (existing) {
      result.skipped.push(row.email);
      continue;
    }

    // Create auth user
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email:         row.email,
        email_confirm: true,
        user_metadata: { pending_activation: true },
      });
    if (authError || !authData.user) {
      result.errors.push({ email: row.email, message: authError?.message ?? "Auth error" });
      continue;
    }

    const { token, expiresAt } = generateInviteToken();
    const { error: profileError } = await admin.from("profiles").insert({
      id:                authData.user.id,
      first_name:        firstName,
      last_name:         lastName,
      email:             row.email,
      phone:             row.phone || null,
      role:              "member",
      status:            "invited",
      invite_token:      token,
      invite_expires_at: expiresAt.toISOString(),
    });
    if (profileError) {
      result.errors.push({ email: row.email, message: profileError.message });
      continue;
    }

    // Assign teams
    const teamIds = row.teams
      .map((name) => teamNameCache.get(name))
      .filter((id): id is string => id !== undefined);
    if (teamIds.length > 0) {
      await admin.from("member_teams").insert(
        teamIds.map((teamId) => ({
          profile_id: authData.user.id,
          team_id:    teamId,
        })),
      );
    }

    result.created++;
    result.results.push({
      name: row.name,
      email: row.email,
      inviteUrl: `${appUrl}/activate/${token}`,
    });
  }

  return result;
}
```

- [ ] **Step 2: Create `src/app/(app)/admin/import/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { parseCsv, type CsvRow } from "@/lib/csv";
import { bulkImportAction, type ImportResult } from "./actions";

type Step = "upload" | "preview" | "results";

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed, errors } = parseCsv(text);
      setRows(parsed);
      setParseErrors(errors);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    setIsLoading(true);
    const formData = new FormData();
    formData.set("rows", JSON.stringify(rows));
    const res = await bulkImportAction(formData);
    setResult(res);
    setStep("results");
    setIsLoading(false);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Import members</h1>
      <p className="text-sm text-slate-500 mb-6">
        Upload a CSV with columns: <code className="bg-slate-100 px-1 rounded">name, email, phone, teams</code>.
        Teams are pipe-separated (e.g. <code className="bg-slate-100 px-1 rounded">Worship|Sound</code>).
      </p>

      {step === "upload" && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <label className="cursor-pointer">
            <div className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-2">
              Click to choose a CSV file
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFile}
            />
          </label>
          <p className="text-xs text-slate-400">or drag and drop</p>
        </div>
      )}

      {step === "preview" && (
        <div>
          {parseErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                {parseErrors.length} row{parseErrors.length > 1 ? "s" : ""} skipped due to errors:
              </p>
              <ul className="text-xs text-red-700 space-y-0.5">
                {parseErrors.map((e) => (
                  <li key={e.line}>Line {e.line}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
              {rows.length} member{rows.length !== 1 ? "s" : ""} ready to import
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Phone</th>
                    <th className="px-4 py-2 text-left">Teams</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-slate-600">{r.email}</td>
                      <td className="px-4 py-2 text-slate-600">{r.phone || "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{r.teams.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={isLoading || rows.length === 0}
              className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Importing…" : `Import ${rows.length} member${rows.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => { setStep("upload"); setRows([]); setParseErrors([]); }}
              className="text-sm text-slate-500 hover:text-slate-900 px-4 py-2"
            >
              Choose different file
            </button>
          </div>
        </div>
      )}

      {step === "results" && result && (
        <div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium text-green-800">
              Import complete: {result.created} created
              {result.skipped.length > 0 && `, ${result.skipped.length} skipped (already exist)`}
              {result.errors.length > 0 && `, ${result.errors.length} failed`}
            </p>
          </div>

          {result.results.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Invite URLs</span>
                <a
                  href={`data:text/csv;charset=utf-8,name,email,invite_url\n${result.results
                    .map((r) => `${r.name},${r.email},${r.inviteUrl}`)
                    .join("\n")}`}
                  download="invite-urls.csv"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Download CSV
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Invite URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.results.map((r) => (
                      <tr key={r.email}>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 text-slate-600">{r.email}</td>
                        <td className="px-4 py-2">
                          <code className="text-xs text-indigo-600 break-all">{r.inviteUrl}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={() => { setStep("upload"); setRows([]); setResult(null); }}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
```

> **Note:** The `import/page.tsx` is a client component. `requireAdmin()` is enforced by the layout (all `(app)` routes require login); additional admin-gating is in `bulkImportAction`. The page itself doesn't need to call `requireAdmin()`.

- [ ] **Step 3: Add import link to the admin nav**

In `src/components/layout/Sidebar.tsx` and `src/components/layout/BottomTabs.tsx`, the Admin nav item already links to `/admin`. The import page is accessible at `/admin/import` — link to it from the invites page for discoverability. Add to `src/app/(app)/admin/invites/page.tsx`, below the `<InviteForm>`:

```tsx
<p className="mt-4 text-sm text-slate-500">
  Have many members?{" "}
  <a href="/admin/import" className="text-indigo-600 hover:text-indigo-800 font-medium">
    Import via CSV
  </a>
</p>
```

- [ ] **Step 4: Run type check**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/admin/import/ src/app/(app)/admin/invites/page.tsx
git commit -m "feat(import): add CSV bulk import with preview and invite URL export"
```

---

## Task 10: E2E Tests

**Files:**
- Create: `tests/e2e/people.spec.ts`

- [ ] **Step 1: Ensure Supabase is running and dev server is available**

```bash
supabase status
```

Expected: `API URL: http://127.0.0.1:54321` (Supabase running)

- [ ] **Step 2: Write `tests/e2e/people.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL    = "admin@commune.local";
const ADMIN_PASSWORD = "commune-admin-dev";

function uniqueEmail() {
  return `test+${Date.now()}@commune.local`;
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test.describe("Navigation shell", () => {
  test("sidebar shows People and Admin links for admin", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: "People" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  });
});

test.describe("People list", () => {
  test("admin can view member directory", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");
    // Dev Admin is seeded
    await expect(page.getByText("Dev Admin")).toBeVisible();
  });

  test("search filters members by name", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");
    await page.getByPlaceholder("Search members…").fill("Dev");
    await expect(page.getByText("Dev Admin")).toBeVisible();
  });
});

test.describe("Invite with teams", () => {
  test("admin invites a member with phone and team, member appears in list", async ({
    page,
  }) => {
    const email = uniqueEmail();

    await loginAsAdmin(page);
    await page.goto("/admin/invites");

    await page.getByLabel("First name").fill("Team");
    await page.getByLabel("Last name").fill("Member");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone (optional)").fill("+61400000000");

    // Check the first team checkbox
    const firstTeamCheckbox = page.locator('input[name="teamId"]').first();
    await firstTeamCheckbox.check();

    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.locator("code")).toContainText("/activate/");

    // Member should appear in people list
    await page.goto("/people");
    await expect(page.getByText("Team Member")).toBeVisible();
  });
});

test.describe("Profile page", () => {
  test("admin can view profile page with tabs", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");

    // Click the first member
    await page.locator("a[href^='/people/']").first().click();
    await expect(page.getByRole("link", { name: "Details" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Teams" })).toBeVisible();
    await expect(page.getByRole("link", { name: "History" })).toBeVisible();
  });

  test("admin can change a member status", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");

    // Find the invited Team Member from previous test (or any non-admin member)
    await page.getByText("Team Member").click();

    // Change status to On leave via the select
    await page.getByLabel("Status").selectOption("on_leave");

    // Verify status badge updates
    await expect(page.getByText("On leave")).toBeVisible();
  });

  test("admin can edit profile name", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/people");
    await page.getByText("Dev Admin").click();

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByLabel("First name")).toBeVisible();
  });
});

test.describe("CSV import", () => {
  test("admin can upload CSV and see preview", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/import");

    const csvContent = `name,email,phone,teams
Import User,import${Date.now()}@church.com,+61400000001,Worship`;

    // Upload CSV
    await page.locator('input[type="file"]').setInputFiles({
      name: "members.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Preview should show 1 member
    await expect(page.getByText("1 member ready to import")).toBeVisible();
    await expect(page.getByText("Import User")).toBeVisible();
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
pnpm test:e2e
```

Expected: all 7 tests PASS. If any fail due to timing, add `await page.waitForLoadState('networkidle')` before the relevant assertion.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/people.spec.ts
git commit -m "test(e2e): add people management E2E tests"
```

---

## Task 11: Final Type Check + Deploy

**Files:**
- No new files

- [ ] **Step 1: Run all checks**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

Expected: no errors, all tests pass

- [ ] **Step 2: Push migrations to cloud**

```bash
supabase link --project-ref nmrcxvvxjwopoweucvje
supabase db push
```

Expected: migration 0003 applied to cloud Supabase

- [ ] **Step 3: Deploy to Vercel**

```bash
vercel --prod
```

Expected: deployment URL printed, https://commune-alpha.vercel.app updated

- [ ] **Step 4: Final commit tag**

```bash
git tag plan/02-people-management
git push origin main --tags
```
