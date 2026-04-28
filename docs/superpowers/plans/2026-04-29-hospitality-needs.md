# Hospitality Needs List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a master catalog of hospitality items (categories + items), a per-service needs list with status lifecycle, a "Request to order" RPC that batches notifications to admin + Hospitality leader, and a generic in-app notifications inbox.

**Architecture:** Four new tables (`hospitality_categories`, `hospitality_items`, `hospitality_needs`, `notifications`) plus an enum and RLS. The "Request to order" workflow is a single SECURITY DEFINER RPC that flips item statuses and inserts notification rows atomically — no direct INSERT on `notifications` from the client. UI follows the existing pattern from `inventory/manage`: server-rendered shell + client editor with `useOptimistic` for mutations.

**Tech Stack:** Next.js 16.2.4 App Router (`params` is `Promise<{}>`), Supabase JS v2 SSR, Vitest, Tailwind CSS, Lucide icons, `useOptimistic` + `useTransition` for mutations.

---

## File Map

**Created:**
- `supabase/migrations/0008_hospitality.sql` — tables, enum, RLS, RPC, Hospitality team seed
- `src/lib/hospitality.ts` — pure helper `canTransition`, `STATUS_LABELS`
- `tests/unit/hospitality.test.ts` — unit tests
- `src/components/notifications/NotificationBadge.tsx` — client unread-count badge
- `src/app/(app)/hospitality/page.tsx` — index server shell
- `src/app/(app)/hospitality/items/page.tsx` — catalog server shell
- `src/app/(app)/hospitality/items/CatalogEditor.tsx` — client editor (categories + items)
- `src/app/(app)/hospitality/items/actions.ts` — catalog server actions
- `src/app/(app)/hospitality/services/[service_id]/page.tsx` — per-service server shell
- `src/app/(app)/hospitality/services/[service_id]/NeedsListEditor.tsx` — client editor
- `src/app/(app)/hospitality/services/[service_id]/actions.ts` — needs list + request actions
- `src/app/(app)/notifications/page.tsx` — inbox server shell
- `src/app/(app)/notifications/NotificationsList.tsx` — client list w/ optimistic mark-read
- `src/app/(app)/notifications/actions.ts` — mark-read actions

**Modified:**
- `src/types/database.ts` — 4 new table types + new enum
- `src/lib/auth.ts` — `requireHospitalityOrAdmin()`
- `src/components/layout/Sidebar.tsx` — Hospitality nav + notification badge
- `src/components/layout/BottomTabs.tsx` — Hospitality tab
- `src/components/layout/AppShell.tsx` — pass user id to sidebar for badge

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0008_hospitality.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0008_hospitality.sql
-- Plan C: Hospitality Needs List

-- ── Hospitality team seed ────────────────────────────────────────────────────

INSERT INTO teams (name, color)
SELECT 'Hospitality', '#06b6d4'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = 'Hospitality');

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE hospitality_need_status AS ENUM ('needed', 'requested', 'fulfilled');

-- ── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_hospitality_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_member_positions tmp
      JOIN teams t ON t.id = tmp.team_id
      WHERE tmp.profile_id = auth.uid() AND t.name = 'Hospitality'
    );
$$;

-- ── hospitality_categories ───────────────────────────────────────────────────

CREATE TABLE hospitality_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── hospitality_items ────────────────────────────────────────────────────────

CREATE TABLE hospitality_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  category_id uuid        NOT NULL REFERENCES hospitality_categories(id) ON DELETE RESTRICT,
  created_by  uuid        NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

CREATE INDEX idx_hosp_items_category ON hospitality_items (category_id);

-- ── hospitality_needs ────────────────────────────────────────────────────────

CREATE TABLE hospitality_needs (
  id            uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    uuid                       NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_id       uuid                       NOT NULL REFERENCES hospitality_items(id) ON DELETE RESTRICT,
  quantity      text                       NOT NULL,
  notes         text,
  status        hospitality_need_status    NOT NULL DEFAULT 'needed',
  requested_at  timestamptz,
  fulfilled_by  uuid                       REFERENCES profiles(id),
  fulfilled_at  timestamptz,
  created_by    uuid                       NOT NULL REFERENCES profiles(id),
  created_at    timestamptz                NOT NULL DEFAULT now()
);

CREATE INDEX idx_hosp_needs_service ON hospitality_needs (service_id, status);

-- ── notifications (generic) ──────────────────────────────────────────────────

CREATE TABLE notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         text        NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_unread
  ON notifications (recipient_id, read_at, created_at DESC);

-- ── RLS — hospitality_categories ────────────────────────────────────────────

ALTER TABLE hospitality_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_cat_read" ON hospitality_categories
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_cat_all"  ON hospitality_categories
  FOR ALL USING (is_hospitality_or_admin());

-- ── RLS — hospitality_items ──────────────────────────────────────────────────

ALTER TABLE hospitality_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_item_read" ON hospitality_items
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_item_all"  ON hospitality_items
  FOR ALL USING (is_hospitality_or_admin());

-- ── RLS — hospitality_needs ──────────────────────────────────────────────────

ALTER TABLE hospitality_needs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_needs_read" ON hospitality_needs
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_needs_all"  ON hospitality_needs
  FOR ALL USING (is_hospitality_or_admin());

-- ── RLS — notifications ──────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_self_read" ON notifications
  FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notif_self_update" ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());
-- No INSERT/DELETE policy: writes go through SECURITY DEFINER RPCs.

-- ── RPC: request hospitality order ───────────────────────────────────────────
-- Atomically flips needed → requested for one service AND inserts notifications
-- for admins + Hospitality leaders. Returns the number of items requested (0 if
-- nothing was needed).

CREATE OR REPLACE FUNCTION request_hospitality_order(p_service_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_count        int;
  v_service_name text;
  v_service_date date;
BEGIN
  IF NOT is_hospitality_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE hospitality_needs
     SET status = 'requested', requested_at = now()
   WHERE service_id = p_service_id
     AND status = 'needed';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  SELECT name, date INTO v_service_name, v_service_date
    FROM services WHERE id = p_service_id;

  INSERT INTO notifications (recipient_id, type, payload)
  SELECT DISTINCT p.id,
                  'hospitality_order_requested',
                  jsonb_build_object(
                    'service_id',   p_service_id,
                    'service_name', v_service_name,
                    'service_date', v_service_date,
                    'item_count',   v_count,
                    'requested_by', v_caller_id
                  )
    FROM profiles p
   WHERE p.role = 'admin'
      OR p.id IN (
        SELECT tmp.profile_id
          FROM team_member_positions tmp
          JOIN teams t ON t.id = tmp.team_id
         WHERE t.name = 'Hospitality' AND tmp.team_role = 'leader'
      );

  RETURN v_count;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: applies cleanly. If any error mentions storage policies, no fix needed (this migration has none).

- [ ] **Step 3: Verify tables exist**

```bash
supabase db execute --sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('hospitality_categories','hospitality_items','hospitality_needs','notifications') ORDER BY table_name;"
```

Expected: 4 rows.

- [ ] **Step 4: Verify the Hospitality team is seeded**

```bash
supabase db execute --sql "SELECT name FROM teams WHERE name = 'Hospitality';"
```

Expected: 1 row "Hospitality".

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_hospitality.sql
git commit -m "feat: hospitality schema — categories, items, needs, notifications, request RPC"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add 4 table types and the new enum**

Open `src/types/database.ts`. Inside `public > Tables`, after the existing tables (alphabetically, so before `inventory_*`), add:

```typescript
      hospitality_categories: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          { foreignKeyName: "hospitality_categories_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      hospitality_items: {
        Row: {
          category_id: string
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          { foreignKeyName: "hospitality_items_category_id_fkey"; columns: ["category_id"]; referencedRelation: "hospitality_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_items_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      hospitality_needs: {
        Row: {
          created_at: string
          created_by: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          item_id: string
          notes: string | null
          quantity: string
          requested_at: string | null
          service_id: string
          status: Database["public"]["Enums"]["hospitality_need_status"]
        }
        Insert: {
          created_at?: string
          created_by: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          quantity: string
          requested_at?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["hospitality_need_status"]
        }
        Update: {
          created_at?: string
          created_by?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: string
          requested_at?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["hospitality_need_status"]
        }
        Relationships: [
          { foreignKeyName: "hospitality_needs_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_needs_fulfilled_by_fkey"; columns: ["fulfilled_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_needs_item_id_fkey"; columns: ["item_id"]; referencedRelation: "hospitality_items"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_needs_service_id_fkey"; columns: ["service_id"]; referencedRelation: "services"; referencedColumns: ["id"] }
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          { foreignKeyName: "notifications_recipient_id_fkey"; columns: ["recipient_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
```

- [ ] **Step 2: Add the enum to `public > Enums`**

Find the `Enums:` block in the `public:` schema. Add `hospitality_need_status` to it:

```typescript
      hospitality_need_status: "needed" | "requested" | "fulfilled"
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add hospitality and notifications types"
```

---

### Task 3: Pure helpers + unit tests

**Files:**
- Create: `src/lib/hospitality.ts`
- Create: `tests/unit/hospitality.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/hospitality.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { canTransition, STATUS_LABELS, type HospitalityNeedStatus } from "@/lib/hospitality";

describe("canTransition", () => {
  it("needed → requested is allowed", () => {
    expect(canTransition("needed", "requested")).toBe(true);
  });
  it("needed → fulfilled is allowed (direct)", () => {
    expect(canTransition("needed", "fulfilled")).toBe(true);
  });
  it("requested → fulfilled is allowed", () => {
    expect(canTransition("requested", "fulfilled")).toBe(true);
  });
  it("fulfilled is terminal — no transitions", () => {
    expect(canTransition("fulfilled", "needed")).toBe(false);
    expect(canTransition("fulfilled", "requested")).toBe(false);
    expect(canTransition("fulfilled", "fulfilled")).toBe(false);
  });
  it("requested → needed is not allowed (would unsend a request)", () => {
    expect(canTransition("requested", "needed")).toBe(false);
  });
  it("self-loops are not allowed", () => {
    expect(canTransition("needed", "needed")).toBe(false);
    expect(canTransition("requested", "requested")).toBe(false);
  });
});

describe("STATUS_LABELS", () => {
  it("has a label for each status", () => {
    const statuses: HospitalityNeedStatus[] = ["needed", "requested", "fulfilled"];
    for (const s of statuses) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/unit/hospitality.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/hospitality'`.

- [ ] **Step 3: Implement `src/lib/hospitality.ts`**

```typescript
export type HospitalityNeedStatus = "needed" | "requested" | "fulfilled";

const ALLOWED: Record<HospitalityNeedStatus, HospitalityNeedStatus[]> = {
  needed:    ["requested", "fulfilled"],
  requested: ["fulfilled"],
  fulfilled: [],
};

export function canTransition(from: HospitalityNeedStatus, to: HospitalityNeedStatus): boolean {
  return ALLOWED[from].includes(to);
}

export const STATUS_LABELS: Record<HospitalityNeedStatus, string> = {
  needed:    "Needed",
  requested: "Requested",
  fulfilled: "Fulfilled",
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/hospitality.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hospitality.ts tests/unit/hospitality.test.ts
git commit -m "feat: hospitality helpers — canTransition, STATUS_LABELS"
```

---

### Task 4: Auth helper

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Append `requireHospitalityOrAdmin` to `src/lib/auth.ts`**

```typescript
export async function requireHospitalityOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_hospitality_or_admin");
  if (!data) redirect("/dashboard");
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
git commit -m "feat: requireHospitalityOrAdmin auth helper"
```

---

### Task 5: NotificationBadge component

**Files:**
- Create: `src/components/notifications/NotificationBadge.tsx`

- [ ] **Step 1: Create the badge**

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function NotificationBadge() {
  const [count, setCount] = useState<number>(0);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { count: c } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (!cancelled) setCount(c ?? 0);
    }
    load();
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 transition-colors"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
    >
      <Bell className="w-4 h-4 text-slate-600" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
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
git add src/components/notifications/NotificationBadge.tsx
git commit -m "feat: NotificationBadge component — unread count + bell icon"
```

---

### Task 6: Nav — Hospitality + bell

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomTabs.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Open `src/components/layout/Sidebar.tsx`.

Add `UtensilsCrossed` to the lucide-react import:

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
} from "lucide-react";
```

Add the import for the badge near the top (after `SignOutButton`):

```typescript
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
```

In `NAV_ITEMS`, add the Hospitality item after the worship item:

```typescript
  { href: "/hospitality",      label: "Hospitality",     icon: UtensilsCrossed },
```

In the user/sign-out footer (the bottom div with avatar + name), insert the badge between the user info and the sign-out button. Find this block:

```typescript
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-900 truncate">
            {firstName} {lastName}
          </div>
          <div className="text-xs text-slate-500 capitalize">{role}</div>
        </div>
        <SignOutButton />
```

Replace with:

```typescript
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-900 truncate">
            {firstName} {lastName}
          </div>
          <div className="text-xs text-slate-500 capitalize">{role}</div>
        </div>
        <NotificationBadge />
        <SignOutButton />
```

- [ ] **Step 2: Update BottomTabs.tsx**

Open `src/components/layout/BottomTabs.tsx`.

Add `UtensilsCrossed` to the lucide-react import:

```typescript
import { LayoutDashboard, Boxes, Calendar, Settings, Wrench, Music, UtensilsCrossed } from "lucide-react";
```

In the `tabs` array, add Hospitality before the role-conditional tabs (after `worship/songs`):

```typescript
  const tabs = [
    { href: "/dashboard",     label: "Home",        icon: LayoutDashboard },
    { href: "/inventory",     label: "Inventory",   icon: Boxes },
    { href: "/schedule",      label: "Schedule",    icon: Calendar },
    { href: "/worship/songs", label: "Songs",       icon: Music },
    { href: "/hospitality",   label: "Hospitality", icon: UtensilsCrossed },
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
git commit -m "feat: add Hospitality nav and notification badge"
```

---

### Task 7: Hospitality index page

**Files:**
- Create: `src/app/(app)/hospitality/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from "next/link";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Settings, UtensilsCrossed } from "lucide-react";

export default async function HospitalityIndexPage() {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: services }, { data: needs }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, date")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(20),
    supabase
      .from("hospitality_needs")
      .select("service_id, status")
      .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const counts = new Map<string, { needed: number; requested: number; fulfilled: number }>();
  for (const n of needs ?? []) {
    const c = counts.get(n.service_id) ?? { needed: 0, requested: 0, fulfilled: 0 };
    c[n.status as "needed" | "requested" | "fulfilled"]++;
    counts.set(n.service_id, c);
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Hospitality</h1>
        <Link
          href="/hospitality/items"
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Catalog
        </Link>
      </div>

      {!services || services.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No upcoming services.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => {
            const c = counts.get(s.id) ?? { needed: 0, requested: 0, fulfilled: 0 };
            const total = c.needed + c.requested + c.fulfilled;
            const date = new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric"
            });
            return (
              <li key={s.id}>
                <Link
                  href={`/hospitality/services/${s.id}`}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{date}</div>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-3">
                    {total === 0 ? (
                      <span className="text-slate-400">No items</span>
                    ) : (
                      <>
                        {c.needed > 0 && <span><strong className="text-amber-600">{c.needed}</strong> needed</span>}
                        {c.requested > 0 && <span><strong className="text-blue-600">{c.requested}</strong> requested</span>}
                        {c.fulfilled > 0 && <span><strong className="text-emerald-600">{c.fulfilled}</strong> done</span>}
                      </>
                    )}
                  </div>
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

- [ ] **Step 2: Test in browser**

```bash
npm run dev
```

Visit `http://localhost:3000/hospitality`. Expected: list of upcoming services, "No items" for each (no needs entries yet), Catalog link in header.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/hospitality/page.tsx"
git commit -m "feat: hospitality index page — services with item counts"
```

---

### Task 8: Catalog — server actions

**Files:**
- Create: `src/app/(app)/hospitality/items/actions.ts`

- [ ] **Step 1: Create the actions file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const CATALOG_PATH = "/hospitality/items";

export async function createCategoryAction(formData: FormData): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("hospitality_categories").insert({ name, created_by: user.id });
  revalidatePath(CATALOG_PATH);
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("hospitality_categories").update({ name }).eq("id", id);
  revalidatePath(CATALOG_PATH);
}

export async function deleteCategoryAction(id: string): Promise<{ error?: string }> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("hospitality_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (count && count > 0) {
    return { error: "Category is in use — remove its items first." };
  }

  const { error } = await supabase.from("hospitality_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}

export async function createItemAction(formData: FormData): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const categoryId = (formData.get("category_id") as string)?.trim();
  if (!name || !categoryId) return;

  const supabase = await createClient();
  await supabase.from("hospitality_items").insert({
    name, category_id: categoryId, created_by: user.id,
  });
  revalidatePath(CATALOG_PATH);
}

export async function updateItemAction(id: string, formData: FormData): Promise<void> {
  await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const categoryId = (formData.get("category_id") as string)?.trim();
  if (!name || !categoryId) return;

  const supabase = await createClient();
  await supabase
    .from("hospitality_items")
    .update({ name, category_id: categoryId })
    .eq("id", id);
  revalidatePath(CATALOG_PATH);
}

export async function deleteItemAction(id: string): Promise<{ error?: string }> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("hospitality_needs")
    .select("id", { count: "exact", head: true })
    .eq("item_id", id);

  if (count && count > 0) {
    return { error: "Item is in use on a service's needs list — remove those entries first." };
  }

  const { error } = await supabase.from("hospitality_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/hospitality/items/actions.ts"
git commit -m "feat: hospitality catalog server actions"
```

---

### Task 9: Catalog — client editor

**Files:**
- Create: `src/app/(app)/hospitality/items/CatalogEditor.tsx`

- [ ] **Step 1: Create the editor**

```typescript
"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  createCategoryAction, updateCategoryAction, deleteCategoryAction,
  createItemAction, updateItemAction, deleteItemAction,
} from "./actions";

type Category = { id: string; name: string };
type Item = { id: string; name: string; category_id: string };

export function CatalogEditor({
  categories,
  items,
}: {
  categories: Category[];
  items: Item[];
}) {
  const [optimisticCats, removeCat] = useOptimistic(
    categories,
    (current: Category[], removedId: string) => current.filter((c) => c.id !== removedId),
  );
  const [optimisticItems, removeItem] = useOptimistic(
    items,
    (current: Item[], removedId: string) => current.filter((i) => i.id !== removedId),
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const itemsByCategory = new Map<string, Item[]>();
  for (const it of optimisticItems) {
    const arr = itemsByCategory.get(it.category_id) ?? [];
    arr.push(it);
    itemsByCategory.set(it.category_id, arr);
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* ── Categories ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Categories</h2>

        <div className="space-y-2">
          {optimisticCats.map((c) => (
            <form
              key={c.id}
              action={updateCategoryAction.bind(null, c.id)}
              className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
            >
              <input
                type="text" name="name" defaultValue={c.name} required
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Delete "${c.name}"?`)) return;
                  setError(null);
                  startTransition(async () => {
                    removeCat(c.id);
                    const res = await deleteCategoryAction(c.id);
                    if (res?.error) setError(res.error);
                  });
                }}
                className="text-xs text-red-400 hover:text-red-700 px-2 py-1"
              >
                Delete
              </button>
            </form>
          ))}
        </div>

        <form action={createCategoryAction} className="mt-3 flex items-center gap-2">
          <input
            type="text" name="name" placeholder="New category name" required
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Add category
          </button>
        </form>
      </section>

      {/* ── Items grouped by category ────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Items</h2>

        {optimisticCats.length === 0 ? (
          <p className="text-sm text-slate-400">Add a category first.</p>
        ) : (
          <div className="space-y-6">
            {optimisticCats.map((c) => {
              const itemsInCat = itemsByCategory.get(c.id) ?? [];
              return (
                <div key={c.id}>
                  <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{c.name}</h3>
                  <div className="space-y-2">
                    {itemsInCat.map((it) => (
                      <form
                        key={it.id}
                        action={updateItemAction.bind(null, it.id)}
                        className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
                      >
                        <input
                          type="text" name="name" defaultValue={it.name} required
                          className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <select
                          name="category_id" defaultValue={it.category_id}
                          className="text-sm border border-slate-200 rounded px-2 py-1 outline-none"
                        >
                          {optimisticCats.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                          ))}
                        </select>
                        <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`Delete "${it.name}"?`)) return;
                            setError(null);
                            startTransition(async () => {
                              removeItem(it.id);
                              const res = await deleteItemAction(it.id);
                              if (res?.error) setError(res.error);
                            });
                          }}
                          className="text-xs text-red-400 hover:text-red-700 px-2 py-1"
                        >
                          Delete
                        </button>
                      </form>
                    ))}

                    <form action={createItemAction} className="flex items-center gap-2">
                      <input
                        type="text" name="name" placeholder={`Add item to ${c.name}`} required
                        className="flex-1 text-sm border border-dashed border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-solid focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <input type="hidden" name="category_id" value={c.id} />
                      <button
                        type="submit"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 px-2"
                      >
                        +
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
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
git add "src/app/(app)/hospitality/items/CatalogEditor.tsx"
git commit -m "feat: hospitality CatalogEditor with optimistic mutations"
```

---

### Task 10: Catalog — server shell page

**Files:**
- Create: `src/app/(app)/hospitality/items/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from "next/link";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CatalogEditor } from "./CatalogEditor";

export default async function CatalogPage() {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("hospitality_categories").select("id, name").order("name"),
    supabase.from("hospitality_items").select("id, name, category_id").order("name"),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/hospitality" className="text-sm text-slate-500 hover:text-slate-900">← Hospitality</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Catalog</h1>
      <CatalogEditor categories={categories ?? []} items={items ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Test the catalog flow in browser**

Visit `http://localhost:3000/hospitality/items`. Expected:
1. Add a category "Drinks" — appears in the list
2. Rename it inline, click Save
3. Add an item "Milk" under Drinks
4. Try to delete "Drinks" while it has "Milk" — error appears: "Category is in use…"
5. Delete "Milk" then "Drinks" — both removed optimistically

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/hospitality/items/page.tsx"
git commit -m "feat: hospitality catalog page"
```

---

### Task 11: Per-service needs list — server actions

**Files:**
- Create: `src/app/(app)/hospitality/services/[service_id]/actions.ts`

- [ ] **Step 1: Create the actions file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function pathFor(serviceId: string) {
  return `/hospitality/services/${serviceId}`;
}

export async function addNeedAction(serviceId: string, formData: FormData): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const itemId = (formData.get("item_id") as string)?.trim();
  const quantity = (formData.get("quantity") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!itemId || !quantity) return;

  const supabase = await createClient();
  await supabase.from("hospitality_needs").insert({
    service_id: serviceId,
    item_id: itemId,
    quantity,
    notes,
    created_by: user.id,
  });
  revalidatePath(pathFor(serviceId));
}

export async function updateNeedAction(
  needId: string,
  serviceId: string,
  formData: FormData,
): Promise<void> {
  await requireHospitalityOrAdmin();
  const quantity = (formData.get("quantity") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!quantity) return;

  const supabase = await createClient();
  await supabase
    .from("hospitality_needs")
    .update({ quantity, notes })
    .eq("id", needId);
  revalidatePath(pathFor(serviceId));
}

export async function deleteNeedAction(needId: string, serviceId: string): Promise<void> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();
  await supabase.from("hospitality_needs").delete().eq("id", needId);
  revalidatePath(pathFor(serviceId));
}

export async function markFulfilledAction(needId: string, serviceId: string): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("hospitality_needs")
    .update({
      status: "fulfilled",
      fulfilled_by: user.id,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", needId);
  revalidatePath(pathFor(serviceId));
}

export async function requestOrderAction(serviceId: string): Promise<{ count: number }> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_hospitality_order", { p_service_id: serviceId });
  if (error) return { count: 0 };
  revalidatePath(pathFor(serviceId));
  return { count: typeof data === "number" ? data : 0 };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. The `rpc("request_hospitality_order", { p_service_id })` call may flag a missing type — if so, see Step 3.

- [ ] **Step 3: Add the RPC type to `src/types/database.ts` if TS errors**

Inside `public > Functions`, add:

```typescript
      is_hospitality_or_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      request_hospitality_order: {
        Args: { p_service_id: string }
        Returns: number
      }
```

Re-run `npx tsc --noEmit` — should pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/hospitality/services/[service_id]/actions.ts" src/types/database.ts
git commit -m "feat: hospitality needs server actions + request RPC types"
```

---

### Task 12: Per-service needs list — client editor

**Files:**
- Create: `src/app/(app)/hospitality/services/[service_id]/NeedsListEditor.tsx`

- [ ] **Step 1: Create the editor**

```typescript
"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Send, Trash2, Check } from "lucide-react";
import { STATUS_LABELS, type HospitalityNeedStatus } from "@/lib/hospitality";
import {
  addNeedAction, deleteNeedAction, markFulfilledAction, requestOrderAction,
} from "./actions";

type CatalogItem = {
  id: string;
  name: string;
  category: { id: string; name: string };
};

type Need = {
  id: string;
  item_id: string;
  item_name: string;
  category_name: string;
  quantity: string;
  notes: string | null;
  status: HospitalityNeedStatus;
  fulfilled_by_name: string | null;
};

type Props = {
  serviceId: string;
  initialNeeds: Need[];
  catalogItems: CatalogItem[];
};

export function NeedsListEditor({ serviceId, initialNeeds, catalogItems }: Props) {
  const [optimistic, applyOp] = useOptimistic(
    initialNeeds,
    (current: Need[], op: { type: "remove"; id: string } | { type: "fulfill"; id: string }) => {
      if (op.type === "remove") return current.filter((n) => n.id !== op.id);
      return current.map((n) => (n.id === op.id ? { ...n, status: "fulfilled" as const } : n));
    },
  );
  const [, startTransition] = useTransition();
  const [requestMsg, setRequestMsg] = useState<string | null>(null);

  const grouped: Record<HospitalityNeedStatus, Need[]> = {
    needed: [],
    requested: [],
    fulfilled: [],
  };
  for (const n of optimistic) grouped[n.status].push(n);

  const needsCount = grouped.needed.length;

  const itemsByCategory = new Map<string, CatalogItem[]>();
  for (const it of catalogItems) {
    const arr = itemsByCategory.get(it.category.name) ?? [];
    arr.push(it);
    itemsByCategory.set(it.category.name, arr);
  }
  const categoryNames = [...itemsByCategory.keys()].sort();

  function handleRequest() {
    if (needsCount === 0) return;
    if (!confirm(`Request ${needsCount} item${needsCount === 1 ? "" : "s"} for ordering?`)) return;
    setRequestMsg(null);
    startTransition(async () => {
      const res = await requestOrderAction(serviceId);
      setRequestMsg(`Sent — ${res.count} item${res.count === 1 ? "" : "s"} requested.`);
    });
  }

  return (
    <div className="space-y-8">
      {requestMsg && (
        <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{requestMsg}</p>
      )}

      {/* ── Add item ─────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add item</h2>
        {catalogItems.length === 0 ? (
          <p className="text-sm text-slate-400">
            No items in the catalog yet. Add some on the <a href="/hospitality/items" className="text-indigo-600 underline">Catalog</a> page.
          </p>
        ) : (
          <form action={addNeedAction.bind(null, serviceId)} className="space-y-3">
            <select
              name="item_id" required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Choose item…</option>
              {categoryNames.map((catName) => (
                <optgroup key={catName} label={catName}>
                  {itemsByCategory.get(catName)!.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              type="text" name="quantity" placeholder='Quantity (e.g. "2 litres", "100")' required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <input
              type="text" name="notes" placeholder="Notes (optional)"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="submit"
              className="w-full text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Add to needs list
            </button>
          </form>
        )}
      </section>

      {/* ── Request to order ─────────────────────────────────── */}
      <button
        type="button"
        onClick={handleRequest}
        disabled={needsCount === 0}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-amber-500 text-white px-4 py-3 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4" />
        Request to order ({needsCount} item{needsCount === 1 ? "" : "s"})
      </button>

      {/* ── Status groups ────────────────────────────────────── */}
      {(["needed", "requested", "fulfilled"] as const).map((status) => {
        const list = grouped[status];
        if (list.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              {STATUS_LABELS[status]} <span className="text-slate-400 font-normal">({list.length})</span>
            </h2>
            <ul className="space-y-2">
              {list.map((n) => (
                <li
                  key={n.id}
                  className={`bg-white border rounded-lg p-3 flex items-center gap-3 ${
                    n.status === "fulfilled" ? "border-slate-100 opacity-60" : "border-slate-200"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {n.item_name} <span className="text-slate-500 font-normal">· {n.quantity}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {n.category_name}
                      {n.notes && <> · {n.notes}</>}
                      {n.status === "fulfilled" && n.fulfilled_by_name && (
                        <> · by {n.fulfilled_by_name}</>
                      )}
                    </div>
                  </div>
                  {n.status !== "fulfilled" && (
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(async () => {
                          applyOp({ type: "fulfill", id: n.id });
                          await markFulfilledAction(n.id, serviceId);
                        });
                      }}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Fulfilled
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Remove "${n.item_name}"?`)) return;
                      startTransition(async () => {
                        applyOp({ type: "remove", id: n.id });
                        await deleteNeedAction(n.id, serviceId);
                      });
                    }}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {optimistic.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">No items yet — add your first one above.</p>
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
git add "src/app/(app)/hospitality/services/[service_id]/NeedsListEditor.tsx"
git commit -m "feat: NeedsListEditor with optimistic mark-fulfilled and remove"
```

---

### Task 13: Per-service needs list — server shell

**Files:**
- Create: `src/app/(app)/hospitality/services/[service_id]/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NeedsListEditor } from "./NeedsListEditor";

export default async function HospitalityServicePage({
  params,
}: {
  params: Promise<{ service_id: string }>;
}) {
  const { service_id } = await params;
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const [{ data: service }, { data: needsRaw }, { data: catalogRaw }] = await Promise.all([
    supabase.from("services").select("id, name, date").eq("id", service_id).single(),
    supabase
      .from("hospitality_needs")
      .select(`
        id, item_id, quantity, notes, status,
        hospitality_items ( name, hospitality_categories ( name ) ),
        fulfilled:fulfilled_by ( first_name, last_name )
      `)
      .eq("service_id", service_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("hospitality_items")
      .select("id, name, hospitality_categories ( id, name )")
      .order("name"),
  ]);

  if (!service) notFound();

  const initialNeeds = (needsRaw ?? []).map((n: any) => ({
    id: n.id,
    item_id: n.item_id,
    item_name: n.hospitality_items?.name ?? "Unknown",
    category_name: n.hospitality_items?.hospitality_categories?.name ?? "—",
    quantity: n.quantity,
    notes: n.notes,
    status: n.status,
    fulfilled_by_name: n.fulfilled
      ? `${n.fulfilled.first_name} ${n.fulfilled.last_name}`.trim()
      : null,
  }));

  const catalogItems = (catalogRaw ?? []).map((it: any) => ({
    id: it.id,
    name: it.name,
    category: {
      id: it.hospitality_categories?.id ?? "",
      name: it.hospitality_categories?.name ?? "—",
    },
  }));

  const date = new Date(service.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  return (
    <div className="max-w-2xl">
      <Link href="/hospitality" className="text-sm text-slate-500 hover:text-slate-900">← Hospitality</Link>
      <div className="mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{service.name}</h1>
        <div className="text-sm text-slate-500 mt-0.5">{date}</div>
      </div>

      <NeedsListEditor
        serviceId={service_id}
        initialNeeds={initialNeeds}
        catalogItems={catalogItems}
      />
    </div>
  );
}
```

- [ ] **Step 2: Test in browser**

Visit `/hospitality`, click a service. Expected:
1. Page loads with the service name + date header
2. "Add item" form shows catalog items grouped by category
3. Add "Milk", quantity "2 litres", submit → appears in "Needed" group
4. "Request to order" button enabled, shows count "Request to order (1 item)"
5. Click → confirm → notification "Sent — 1 item requested." appears, item moves to "Requested"
6. Click "Fulfilled" on the item → moves to "Fulfilled" optimistically
7. Trash icon → removes optimistically

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/hospitality/services/[service_id]/page.tsx"
git commit -m "feat: per-service hospitality needs list page"
```

---

### Task 14: Notifications inbox

**Files:**
- Create: `src/app/(app)/notifications/actions.ts`
- Create: `src/app/(app)/notifications/NotificationsList.tsx`
- Create: `src/app/(app)/notifications/page.tsx`

- [ ] **Step 1: Create the actions**

Create `src/app/(app)/notifications/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markReadAction(notificationId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id)
    .is("read_at", null);
  revalidatePath("/notifications");
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  revalidatePath("/notifications");
}
```

- [ ] **Step 2: Create the client list**

Create `src/app/(app)/notifications/NotificationsList.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { markReadAction, markAllReadAction } from "./actions";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

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
  return { title: n.type, subtitle: "", href: "/notifications" };
}

export function NotificationsList({ initial }: { initial: Notification[] }) {
  const [optimistic, applyOp] = useOptimistic(
    initial,
    (current: Notification[], op: { type: "read"; id: string } | { type: "readAll" }) => {
      if (op.type === "readAll")
        return current.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
      return current.map((n) =>
        n.id === op.id ? { ...n, read_at: new Date().toISOString() } : n,
      );
    },
  );
  const [, startTransition] = useTransition();

  const unreadCount = optimistic.filter((n) => !n.read_at).length;

  if (optimistic.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No notifications yet.</p>;
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              startTransition(async () => {
                applyOp({ type: "readAll" });
                await markAllReadAction();
              });
            }}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Mark all read
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {optimistic.map((n) => {
          const { title, subtitle, href } = renderNotification(n);
          const unread = !n.read_at;
          return (
            <li key={n.id}>
              <Link
                href={href}
                onClick={() => {
                  if (!unread) return;
                  startTransition(async () => {
                    applyOp({ type: "read", id: n.id });
                    await markReadAction(n.id);
                  });
                }}
                className={`block bg-white border rounded-xl px-4 py-3 transition-colors hover:border-indigo-300 ${
                  unread ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                      {title}
                    </div>
                    {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
                  </div>
                  <div className="text-xs text-slate-400 flex-shrink-0">{formatRelative(n.created_at)}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

Create `src/app/(app)/notifications/page.tsx`:

```typescript
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NotificationsList } from "./NotificationsList";

export default async function NotificationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const initial = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    read_at: n.read_at,
    created_at: n.created_at,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Notifications</h1>
      <NotificationsList initial={initial} />
    </div>
  );
}
```

- [ ] **Step 4: Test the full flow**

1. As an admin (or hospitality leader), visit `/hospitality/services/{id}` and click "Request to order" with at least one item
2. Click the bell icon in the sidebar — badge should show 1+
3. Click bell → land on `/notifications` — see the new notification
4. Click the notification — navigates to the service page; on return, badge count is 0

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/notifications/"
git commit -m "feat: notifications inbox with optimistic mark-read"
```

---

### Task 15: Final verification

- [ ] **Step 1: Run unit tests**

```bash
npx vitest run
```

Expected: all tests pass — 7 new from `hospitality.test.ts` plus existing.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Smoke-test full flow with dev server**

```bash
npm run dev
```

Verify in order:
1. `/hospitality` — index loads, services listed
2. `/hospitality/items` — add Drinks category, then Milk and Coffee items
3. `/hospitality/services/{id}` — add 2 items, click "Request to order"
4. Sidebar bell — count of 1 (or however many recipients you are)
5. `/notifications` — notification appears, click it, navigates correctly
6. Back on the service page — items are now in "Requested"
7. Mark one fulfilled — moves to "Fulfilled" optimistically
8. Add a 3rd item, click "Request to order" again — bell increments by 1

- [ ] **Step 4: Commit any post-integration fixes**

```bash
git add -p
git commit -m "fix: post-integration tweaks for hospitality"
```
