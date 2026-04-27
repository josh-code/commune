# Inventory & Logistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the inventory & logistics module — categories, items (bulk + individual), and reservations with optional approval gates.

**Architecture:** Three new tables (`inventory_categories`, `inventory_items`, `inventory_reservations`) with RLS gated by an `is_logistics_or_admin()` helper. Pure availability + state-machine helpers live in `src/lib/inventory.ts` and are unit-tested. Pages are server components by default; client components only appear where interactivity demands it (reserve form, optimistic delete, admin filters). Members see only items where both the item and its category are public; staff see everything.

**Tech Stack:** Next.js 16.2.4 App Router (`params`/`searchParams` are `Promise<{}>` — must `await`), Supabase JS v2 + SSR (`createClient()` async), Tailwind v4, Vitest (unit), Playwright (E2E).

---

## File Map

**Created:**
- `supabase/migrations/0006_inventory.sql`
- `src/lib/inventory.ts` — pure availability + state-machine helpers
- `tests/unit/inventory.test.ts`
- `src/app/(app)/inventory/page.tsx` — member catalogue
- `src/app/(app)/inventory/loading.tsx`
- `src/app/(app)/inventory/[id]/page.tsx`
- `src/app/(app)/inventory/[id]/loading.tsx`
- `src/app/(app)/inventory/[id]/ReserveForm.tsx`
- `src/app/(app)/inventory/[id]/actions.ts`
- `src/app/(app)/inventory/reservations/page.tsx`
- `src/app/(app)/inventory/reservations/loading.tsx`
- `src/app/(app)/inventory/reservations/MyReservationsList.tsx`
- `src/app/(app)/inventory/reservations/actions.ts`
- `src/app/(app)/admin/inventory/page.tsx`
- `src/app/(app)/admin/inventory/loading.tsx`
- `src/app/(app)/admin/inventory/categories/page.tsx`
- `src/app/(app)/admin/inventory/categories/loading.tsx`
- `src/app/(app)/admin/inventory/categories/CategoriesEditor.tsx`
- `src/app/(app)/admin/inventory/categories/actions.ts`
- `src/app/(app)/admin/inventory/items/page.tsx`
- `src/app/(app)/admin/inventory/items/loading.tsx`
- `src/app/(app)/admin/inventory/items/ItemsList.tsx`
- `src/app/(app)/admin/inventory/items/new/page.tsx`
- `src/app/(app)/admin/inventory/items/new/loading.tsx`
- `src/app/(app)/admin/inventory/items/new/actions.ts`
- `src/app/(app)/admin/inventory/items/[id]/page.tsx`
- `src/app/(app)/admin/inventory/items/[id]/loading.tsx`
- `src/app/(app)/admin/inventory/items/[id]/EditItemForm.tsx`
- `src/app/(app)/admin/inventory/items/[id]/actions.ts`
- `src/app/(app)/admin/inventory/reservations/page.tsx`
- `src/app/(app)/admin/inventory/reservations/loading.tsx`
- `src/app/(app)/admin/inventory/reservations/AdminReservationsList.tsx`
- `src/app/(app)/admin/inventory/reservations/actions.ts`
- `tests/e2e/inventory.spec.ts`

**Modified:**
- `src/types/database.ts` — regenerated
- `src/lib/auth.ts` — add `requireLogisticsOrAdmin()`
- `src/components/layout/Sidebar.tsx` — add Inventory link
- `src/components/layout/BottomTabs.tsx` — add Inventory tab
- `src/app/(app)/admin/page.tsx` — add inventory hub card
- `src/app/(app)/dashboard/page.tsx` — add member reservations strip + staff alerts strip

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0006_inventory.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0006_inventory.sql
-- Plan 05: Inventory & Logistics

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE inventory_condition AS ENUM ('good', 'needs_repair', 'out_of_service');
CREATE TYPE reservation_status  AS ENUM ('pending', 'approved', 'rejected', 'checked_out', 'returned', 'cancelled');

-- ── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_logistics_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin','logistics')
  );
$$;

-- ── inventory_categories ────────────────────────────────────────────────────

CREATE TABLE inventory_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  color       text        NOT NULL DEFAULT '#6366f1',
  icon        text,
  "order"     int         NOT NULL DEFAULT 0,
  is_public   bool        NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── inventory_items ─────────────────────────────────────────────────────────

CREATE TABLE inventory_items (
  id                    uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id           uuid                NOT NULL REFERENCES inventory_categories(id) ON DELETE RESTRICT,
  name                  text                NOT NULL,
  description           text,
  photo_url             text,
  tracked_individually  bool                NOT NULL DEFAULT false,
  total_quantity        int                 NOT NULL DEFAULT 1,
  serial_number         text,
  condition             inventory_condition NOT NULL DEFAULT 'good',
  condition_notes       text,
  approval_required     bool                NOT NULL DEFAULT false,
  location              text,
  is_public             bool                NOT NULL DEFAULT true,
  created_by            uuid                NOT NULL REFERENCES profiles(id),
  created_at            timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT qty_valid CHECK (total_quantity >= 1 AND (tracked_individually = false OR total_quantity = 1))
);

-- ── inventory_reservations ──────────────────────────────────────────────────

CREATE TABLE inventory_reservations (
  id                uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           uuid                NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  profile_id        uuid                NOT NULL REFERENCES profiles(id),
  created_by        uuid                NOT NULL REFERENCES profiles(id),
  quantity          int                 NOT NULL DEFAULT 1,
  start_date        date                NOT NULL,
  end_date          date                NOT NULL,
  status            reservation_status  NOT NULL DEFAULT 'pending',
  notes             text,
  approved_by       uuid                REFERENCES profiles(id),
  approved_at       timestamptz,
  rejection_reason  text,
  checked_out_at    timestamptz,
  returned_at       timestamptz,
  return_condition  inventory_condition,
  return_notes      text,
  created_at        timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT res_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT res_qty_positive CHECK (quantity >= 1)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_items_category ON inventory_items (category_id);
CREATE INDEX idx_items_visible  ON inventory_items (is_public, condition) WHERE condition <> 'out_of_service';
CREATE INDEX idx_res_item       ON inventory_reservations (item_id, status);
CREATE INDEX idx_res_profile    ON inventory_reservations (profile_id, status);
CREATE INDEX idx_res_dates      ON inventory_reservations (start_date, end_date);

-- ── RLS — categories ────────────────────────────────────────────────────────

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_member_read" ON inventory_categories
  FOR SELECT USING (is_public OR is_logistics_or_admin());
CREATE POLICY "cat_staff_all"   ON inventory_categories
  FOR ALL USING (is_logistics_or_admin());

-- ── RLS — items ─────────────────────────────────────────────────────────────

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item_member_read" ON inventory_items
  FOR SELECT USING (
    is_logistics_or_admin()
    OR (
      is_public AND
      EXISTS (
        SELECT 1 FROM inventory_categories c
        WHERE c.id = category_id AND c.is_public
      )
    )
  );
CREATE POLICY "item_staff_all" ON inventory_items
  FOR ALL USING (is_logistics_or_admin());

-- ── RLS — reservations ──────────────────────────────────────────────────────

ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "res_self_read"    ON inventory_reservations
  FOR SELECT USING (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_self_insert"  ON inventory_reservations
  FOR INSERT WITH CHECK (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_self_update"  ON inventory_reservations
  FOR UPDATE USING (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_staff_delete" ON inventory_reservations
  FOR DELETE USING (is_logistics_or_admin());
```

- [ ] **Step 2: Apply the migration**

```bash
cd "/Users/joshuaferndes/Code/Work Projects/Commune" && npx supabase db reset
```

Expected: `Finished supabase db reset.` with no errors.

- [ ] **Step 3: Verify the new tables exist**

```bash
npx supabase db execute --local "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'inventory_%' ORDER BY tablename;"
```

Expected output includes: `inventory_categories`, `inventory_items`, `inventory_reservations`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_inventory.sql
git commit -m "feat: inventory & logistics schema (categories, items, reservations) with RLS"
```

---

### Task 2: Regenerate TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Regenerate types from the local DB**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

- [ ] **Step 2: Verify**

```bash
grep -c "inventory_categories\|inventory_items\|inventory_reservations" src/types/database.ts
npx tsc --noEmit
```

Expected: count ≥ 3, zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: regenerate types for inventory schema"
```

---

### Task 3: Auth Helper for Logistics + Admin

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Append `requireLogisticsOrAdmin` to `src/lib/auth.ts`**

Add this export at the end of the file:

```ts
export async function requireLogisticsOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "logistics") redirect("/dashboard");
  return user;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: requireLogisticsOrAdmin auth helper"
```

---

### Task 4: Inventory Library — Pure Helpers

**Files:**
- Create: `src/lib/inventory.ts`

- [ ] **Step 1: Write the helper module**

```ts
// src/lib/inventory.ts

export type InventoryCondition = "good" | "needs_repair" | "out_of_service";

export type ReservationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "checked_out"
  | "returned"
  | "cancelled";

export type ItemForAvailability = {
  tracked_individually: boolean;
  total_quantity: number;
  condition: InventoryCondition;
};

export type ActiveReservation = {
  status: "approved" | "checked_out";
  start_date: string;
  end_date: string;
  quantity: number;
};

/** Inclusive-endpoints overlap: two ranges overlap if a.start <= b.end AND b.start <= a.end. */
export function detectOverlap(
  a: { start_date: string; end_date: string },
  b: { start_date: string; end_date: string },
): boolean {
  return a.start_date <= b.end_date && b.start_date <= a.end_date;
}

/**
 * Compute units available for `range` given the item's properties and a list of active reservations.
 * Caller MUST pre-filter to status ∈ {approved, checked_out}.
 */
export function calculateAvailability(
  item: ItemForAvailability,
  reservations: ActiveReservation[],
  range: { start_date: string; end_date: string },
): number {
  if (item.condition === "out_of_service") return 0;

  const overlapping = reservations.filter(r => detectOverlap(r, range));

  if (item.tracked_individually) {
    return overlapping.length === 0 ? 1 : 0;
  }
  const reserved = overlapping.reduce((sum, r) => sum + r.quantity, 0);
  return Math.max(0, item.total_quantity - reserved);
}

/** Caller role for state transition checks. */
export type ActorRole = "self" | "staff";

/**
 * Returns true if a transition is allowed for the given actor role.
 * `self` = the reservation's profile_id holder. `staff` = logistics or admin.
 */
export function canTransition(
  from: ReservationStatus,
  to: ReservationStatus,
  actor: ActorRole,
): boolean {
  if (from === to) return false;
  switch (from) {
    case "pending":
      if (to === "approved" || to === "rejected") return actor === "staff";
      if (to === "cancelled") return true;
      return false;
    case "approved":
      if (to === "checked_out") return true; // member self-checkout enforced by date check at call site
      if (to === "cancelled")    return true;
      return false;
    case "checked_out":
      return to === "returned";
    case "rejected":
    case "returned":
    case "cancelled":
      return false;
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inventory.ts
git commit -m "feat: inventory library — calculateAvailability, detectOverlap, canTransition"
```

---

### Task 5: Unit Tests for Inventory Library

**Files:**
- Create: `tests/unit/inventory.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/unit/inventory.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateAvailability,
  detectOverlap,
  canTransition,
  type ItemForAvailability,
  type ActiveReservation,
} from "@/lib/inventory";

const bulk: ItemForAvailability = { tracked_individually: false, total_quantity: 50, condition: "good" };
const indiv: ItemForAvailability = { tracked_individually: true,  total_quantity: 1,  condition: "good" };
const broken: ItemForAvailability = { tracked_individually: false, total_quantity: 50, condition: "out_of_service" };

const range = { start_date: "2026-05-01", end_date: "2026-05-07" };

function res(start: string, end: string, qty = 1, status: "approved" | "checked_out" = "approved"): ActiveReservation {
  return { status, start_date: start, end_date: end, quantity: qty };
}

describe("detectOverlap", () => {
  it("non-overlapping ranges", () => {
    expect(detectOverlap({ start_date: "2026-05-01", end_date: "2026-05-03" }, { start_date: "2026-05-05", end_date: "2026-05-07" })).toBe(false);
  });
  it("touching ranges (same day) — counts as overlap", () => {
    expect(detectOverlap({ start_date: "2026-05-01", end_date: "2026-05-03" }, { start_date: "2026-05-03", end_date: "2026-05-05" })).toBe(true);
  });
  it("fully nested", () => {
    expect(detectOverlap({ start_date: "2026-05-01", end_date: "2026-05-10" }, { start_date: "2026-05-03", end_date: "2026-05-05" })).toBe(true);
  });
  it("identical ranges", () => {
    expect(detectOverlap(range, range)).toBe(true);
  });
});

describe("calculateAvailability — bulk", () => {
  it("no reservations → full quantity", () => {
    expect(calculateAvailability(bulk, [], range)).toBe(50);
  });
  it("one overlapping reservation of 5 → 45", () => {
    expect(calculateAvailability(bulk, [res("2026-05-03", "2026-05-04", 5)], range)).toBe(45);
  });
  it("multiple overlapping reservations sum", () => {
    expect(calculateAvailability(bulk, [
      res("2026-05-03", "2026-05-04", 5),
      res("2026-05-06", "2026-05-08", 3),
    ], range)).toBe(42);
  });
  it("reservations outside the range are ignored", () => {
    expect(calculateAvailability(bulk, [res("2026-04-01", "2026-04-15", 10)], range)).toBe(50);
  });
  it("never returns negative", () => {
    expect(calculateAvailability(bulk, [res("2026-05-03", "2026-05-04", 999)], range)).toBe(0);
  });
});

describe("calculateAvailability — individual", () => {
  it("no reservations → 1", () => {
    expect(calculateAvailability(indiv, [], range)).toBe(1);
  });
  it("any overlapping reservation → 0", () => {
    expect(calculateAvailability(indiv, [res("2026-05-03", "2026-05-04")], range)).toBe(0);
  });
  it("non-overlapping reservation → 1", () => {
    expect(calculateAvailability(indiv, [res("2026-04-01", "2026-04-15")], range)).toBe(1);
  });
});

describe("calculateAvailability — out_of_service", () => {
  it("always 0 regardless of reservations", () => {
    expect(calculateAvailability(broken, [], range)).toBe(0);
    expect(calculateAvailability(broken, [res("2026-04-01", "2026-04-15", 1)], range)).toBe(0);
  });
});

describe("canTransition", () => {
  it("pending → approved: only staff", () => {
    expect(canTransition("pending", "approved", "staff")).toBe(true);
    expect(canTransition("pending", "approved", "self")).toBe(false);
  });
  it("pending → rejected: only staff", () => {
    expect(canTransition("pending", "rejected", "staff")).toBe(true);
    expect(canTransition("pending", "rejected", "self")).toBe(false);
  });
  it("pending → cancelled: anyone", () => {
    expect(canTransition("pending", "cancelled", "self")).toBe(true);
    expect(canTransition("pending", "cancelled", "staff")).toBe(true);
  });
  it("approved → checked_out: anyone (date check happens at call site)", () => {
    expect(canTransition("approved", "checked_out", "self")).toBe(true);
    expect(canTransition("approved", "checked_out", "staff")).toBe(true);
  });
  it("approved → cancelled: anyone", () => {
    expect(canTransition("approved", "cancelled", "self")).toBe(true);
  });
  it("checked_out → returned: anyone", () => {
    expect(canTransition("checked_out", "returned", "self")).toBe(true);
  });
  it("terminal states do not transition", () => {
    expect(canTransition("returned", "checked_out", "staff")).toBe(false);
    expect(canTransition("rejected", "approved", "staff")).toBe(false);
    expect(canTransition("cancelled", "approved", "staff")).toBe(false);
  });
  it("self-loop is never allowed", () => {
    expect(canTransition("approved", "approved", "staff")).toBe(false);
  });
  it("pending → checked_out is not allowed (must approve first)", () => {
    expect(canTransition("pending", "checked_out", "staff")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test tests/unit/inventory.test.ts --run
```

Expected: all tests pass. If any fail, fix `src/lib/inventory.ts` before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/inventory.test.ts
git commit -m "test: unit tests for inventory library"
```

---

### Task 6: Admin Inventory Hub + Card on Admin Hub

**Files:**
- Create: `src/app/(app)/admin/inventory/page.tsx`
- Create: `src/app/(app)/admin/inventory/loading.tsx`
- Modify: `src/app/(app)/admin/page.tsx`

- [ ] **Step 1: Write the inventory hub**

```tsx
// src/app/(app)/admin/inventory/page.tsx
import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Boxes, Package, ListChecks, ClipboardClock } from "lucide-react";

export default async function AdminInventoryHubPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const [pending, overdue] = await Promise.all([
    supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "checked_out").lt("end_date", today),
  ]);

  const pendingCount = pending.count ?? 0;
  const overdueCount = overdue.count ?? 0;

  return (
    <div>
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">← Admin</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Inventory</h1>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <Link href="/admin/inventory/categories" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Boxes className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Categories</div>
          <div className="text-xs text-slate-500 mt-1">Group items, set visibility</div>
        </Link>
        <Link href="/admin/inventory/items" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Package className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Items</div>
          <div className="text-xs text-slate-500 mt-1">Add, edit, mark condition</div>
        </Link>
        <Link href="/admin/inventory/reservations" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <ListChecks className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Reservations</div>
          <div className="text-xs text-slate-500 mt-1">
            {pendingCount > 0 ? `${pendingCount} pending` : "Approve, check out, return"}
          </div>
        </Link>
        {overdueCount > 0 && (
          <Link href="/admin/inventory/reservations?filter=overdue" className="bg-red-50 rounded-xl border border-red-200 p-5 hover:bg-red-100 transition-colors">
            <ClipboardClock className="w-6 h-6 text-red-600 mb-3" />
            <div className="font-medium text-red-900 text-sm">{overdueCount} overdue</div>
            <div className="text-xs text-red-700 mt-1">Items past their return date</div>
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the loading skeleton**

```tsx
// src/app/(app)/admin/inventory/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-32 bg-slate-200 rounded mt-1 mb-6" />
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
            <div className="w-9 h-9 bg-slate-200 rounded-lg" />
            <div className="h-4 w-24 bg-slate-200 rounded" />
            <div className="h-3 w-40 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add an Inventory card to the admin hub**

Replace the existing JSX inside `src/app/(app)/admin/page.tsx` so it includes the new card. The full new file:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Users, Upload, Users2, Boxes } from "lucide-react";

export default async function AdminPage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <Link href="/admin/invites" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Users className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Invite member</div>
          <div className="text-xs text-slate-500 mt-1">Send an invite link to a new member</div>
        </Link>
        <Link href="/admin/import" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Upload className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Import via CSV</div>
          <div className="text-xs text-slate-500 mt-1">Bulk import members from a spreadsheet</div>
        </Link>
        <Link href="/admin/teams" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Users2 className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Manage teams</div>
          <div className="text-xs text-slate-500 mt-1">Set up teams, positions, and member assignments</div>
        </Link>
        <Link href="/admin/inventory" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Boxes className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Inventory</div>
          <div className="text-xs text-slate-500 mt-1">Categories, items, reservations</div>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript and visit**

```bash
npx tsc --noEmit
```

Expected: zero errors. Start the dev server (`pnpm dev`), log in as admin, navigate to `/admin/inventory`. Expected: hub renders with three cards (Categories, Items, Reservations).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/admin/inventory/page.tsx" "src/app/(app)/admin/inventory/loading.tsx" "src/app/(app)/admin/page.tsx"
git commit -m "feat: admin inventory hub page + admin hub card"
```

---

### Task 7: Categories — CRUD Page + Actions

**Files:**
- Create: `src/app/(app)/admin/inventory/categories/page.tsx`
- Create: `src/app/(app)/admin/inventory/categories/loading.tsx`
- Create: `src/app/(app)/admin/inventory/categories/CategoriesEditor.tsx`
- Create: `src/app/(app)/admin/inventory/categories/actions.ts`

- [ ] **Step 1: Write the server actions**

```ts
// src/app/(app)/admin/inventory/categories/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

export async function createCategoryAction(formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();
  const name  = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string) || PRESET_COLORS[0];
  const isPublic = formData.get("is_public") === "on";
  if (!name) return;

  const supabase = await createClient();
  const { data: maxOrder } = await supabase
    .from("inventory_categories")
    .select('"order"')
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("inventory_categories").insert({
    name,
    color,
    is_public: isPublic,
    order: (maxOrder?.order ?? 0) + 1,
  });

  revalidatePath("/admin/inventory/categories");
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();
  const name  = (formData.get("name") as string)?.trim();
  const color = formData.get("color") as string;
  const isPublic = formData.get("is_public") === "on";
  if (!name || !color) return;

  const supabase = await createClient();
  await supabase
    .from("inventory_categories")
    .update({ name, color, is_public: isPublic })
    .eq("id", id);

  revalidatePath("/admin/inventory/categories");
}

export async function deleteCategoryAction(id: string): Promise<{ error?: string } | void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (count && count > 0) {
    return { error: `Category has ${count} item(s). Move or delete them first.` };
  }

  await supabase.from("inventory_categories").delete().eq("id", id);
  revalidatePath("/admin/inventory/categories");
}
```

- [ ] **Step 2: Write the client editor for inline updates with optimistic state**

```tsx
// src/app/(app)/admin/inventory/categories/CategoriesEditor.tsx
"use client";

import { useOptimistic, useState, useTransition } from "react";
import { deleteCategoryAction, updateCategoryAction } from "./actions";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

type Category = { id: string; name: string; color: string; is_public: boolean; order: number };

export function CategoriesEditor({ categories }: { categories: Category[] }) {
  const [optimistic, setOptimistic] = useOptimistic(
    categories,
    (current: Category[], removedId: string) => current.filter(c => c.id !== removedId),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (optimistic.length === 0) {
    return <p className="text-sm text-slate-400">No categories yet — add one below.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {optimistic.map(c => (
        <form
          key={c.id}
          action={updateCategoryAction.bind(null, c.id)}
          className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
        >
          <input type="color" name="color" defaultValue={c.color} className="w-8 h-8 rounded cursor-pointer flex-shrink-0" list={`presets-${c.id}`} />
          <datalist id={`presets-${c.id}`}>
            {PRESET_COLORS.map(p => <option key={p} value={p} />)}
          </datalist>
          <input
            type="text"
            name="name"
            defaultValue={c.name}
            required
            className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" name="is_public" defaultChecked={c.is_public} className="rounded border-slate-300 text-indigo-600" />
            Public
          </label>
          <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">Save</button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm(`Delete "${c.name}"?`)) return;
              setError(null);
              startTransition(async () => {
                setOptimistic(c.id);
                const res = await deleteCategoryAction(c.id);
                if (res && "error" in res && res.error) setError(res.error);
              });
            }}
            className="text-xs text-red-400 hover:text-red-700 px-2 py-1 disabled:opacity-50"
          >
            Delete
          </button>
        </form>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/app/(app)/admin/inventory/categories/page.tsx
import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoriesEditor } from "./CategoriesEditor";
import { createCategoryAction } from "./actions";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

export default async function CategoriesPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("id, name, color, is_public, order")
    .order("order");

  return (
    <div className="max-w-2xl">
      <Link href="/admin/inventory" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Categories</h1>

      <CategoriesEditor categories={categories ?? []} />

      <form action={createCategoryAction} className="bg-white rounded-xl border border-slate-200 p-4 mt-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-slate-600">New category name</label>
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. AV & Tech"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Colour</label>
          <input type="color" name="color" defaultValue={PRESET_COLORS[0]} className="w-10 h-9 rounded cursor-pointer" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer pb-2">
          <input type="checkbox" name="is_public" defaultChecked className="rounded border-slate-300 text-indigo-600" />
          Public
        </label>
        <button type="submit" className="text-sm font-medium bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
          Add
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write the loading skeleton**

```tsx
// src/app/(app)/admin/inventory/categories/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-2xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-32 bg-slate-200 rounded mt-1 mb-6" />
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-slate-200" />
            <div className="flex-1 h-7 bg-slate-100 rounded" />
            <div className="h-4 w-12 bg-slate-100 rounded" />
            <div className="h-6 w-12 bg-slate-100 rounded" />
            <div className="h-6 w-14 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
      <div className="h-16 bg-slate-100 rounded-xl mt-4" />
    </div>
  );
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
```

Visit `/admin/inventory/categories`, add "AV & Tech", confirm it appears. Toggle public off and save. Try to delete (should succeed since no items yet).

```bash
git add "src/app/(app)/admin/inventory/categories/"
git commit -m "feat: inventory categories CRUD with public flag and optimistic delete"
```

---

### Task 8: Items — List Page

**Files:**
- Create: `src/app/(app)/admin/inventory/items/page.tsx`
- Create: `src/app/(app)/admin/inventory/items/loading.tsx`
- Create: `src/app/(app)/admin/inventory/items/ItemsList.tsx`

- [ ] **Step 1: Write the client filter list**

```tsx
// src/app/(app)/admin/inventory/items/ItemsList.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

type Category = { id: string; name: string; color: string };
type Item = {
  id: string;
  name: string;
  category_id: string;
  tracked_individually: boolean;
  total_quantity: number;
  condition: "good" | "needs_repair" | "out_of_service";
  is_public: boolean;
};

const CONDITION_BADGE: Record<Item["condition"], string> = {
  good: "bg-green-100 text-green-700",
  needs_repair: "bg-amber-100 text-amber-700",
  out_of_service: "bg-red-100 text-red-700",
};

export function ItemsList({ items, categories }: { items: Item[]; categories: Category[] }) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);

  const catById = new Map(categories.map(c => [c.id, c]));

  const filtered = items.filter(i => {
    if (categoryId && i.category_id !== categoryId) return false;
    if (showHiddenOnly && i.is_public) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          className="flex-1 min-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showHiddenOnly} onChange={e => setShowHiddenOnly(e.target.checked)} className="rounded border-slate-300 text-indigo-600" />
          Hidden only
        </label>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-400">No items match.</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filtered.map(i => {
          const c = catById.get(i.category_id);
          return (
            <Link key={i.id} href={`/admin/inventory/items/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
              {c && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />}
              <span className="flex-1 text-sm font-medium text-slate-900">{i.name}</span>
              {!i.is_public && <span className="text-xs text-slate-400">hidden</span>}
              <span className="text-xs text-slate-500">
                {i.tracked_individually ? "1 unit" : `${i.total_quantity} avail.`}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${CONDITION_BADGE[i.condition]}`}>
                {i.condition.replace("_", " ")}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/(app)/admin/inventory/items/page.tsx
import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ItemsList } from "./ItemsList";

export default async function ItemsPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const [{ data: items }, { data: categories }] = await Promise.all([
    supabase.from("inventory_items").select("id, name, category_id, tracked_individually, total_quantity, condition, is_public").order("name"),
    supabase.from("inventory_categories").select("id, name, color").order("order"),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/inventory" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <div className="flex items-center justify-between mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Items</h1>
        <Link
          href="/admin/inventory/items/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + New item
        </Link>
      </div>

      {(categories ?? []).length === 0 && (
        <p className="text-sm text-slate-400 mb-4">
          Create a category first. <Link href="/admin/inventory/categories" className="text-indigo-600 hover:text-indigo-800">Manage categories →</Link>
        </p>
      )}

      <ItemsList items={items ?? []} categories={categories ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: Write the loading skeleton**

```tsx
// src/app/(app)/admin/inventory/items/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="flex items-center justify-between mt-1 mb-6">
        <div className="h-7 w-20 bg-slate-200 rounded" />
        <div className="h-8 w-28 bg-slate-200 rounded-lg" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
        <div className="h-8 w-32 bg-slate-100 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="flex-1 h-4 bg-slate-200 rounded" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-5 w-16 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
```

Visit `/admin/inventory/items`. Expected: empty state with "+ New item" button visible.

```bash
git add "src/app/(app)/admin/inventory/items/page.tsx" "src/app/(app)/admin/inventory/items/loading.tsx" "src/app/(app)/admin/inventory/items/ItemsList.tsx"
git commit -m "feat: admin items list page with search, category filter, hidden-only toggle"
```

---

### Task 9: Items — Create Page + Action

**Files:**
- Create: `src/app/(app)/admin/inventory/items/new/page.tsx`
- Create: `src/app/(app)/admin/inventory/items/new/loading.tsx`
- Create: `src/app/(app)/admin/inventory/items/new/actions.ts`

- [ ] **Step 1: Write the create action**

```ts
// src/app/(app)/admin/inventory/items/new/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createItemAction(formData: FormData): Promise<void> {
  const user = await requireLogisticsOrAdmin();

  const name              = (formData.get("name") as string)?.trim();
  const description       = (formData.get("description") as string)?.trim() || null;
  const categoryId        = formData.get("category_id") as string;
  const trackedIndividually = formData.get("tracked_individually") === "on";
  const totalQuantity     = trackedIndividually ? 1 : Math.max(1, Number(formData.get("total_quantity") ?? "1"));
  const serialNumber      = (formData.get("serial_number") as string)?.trim() || null;
  const condition         = (formData.get("condition") as "good" | "needs_repair" | "out_of_service") ?? "good";
  const conditionNotes    = (formData.get("condition_notes") as string)?.trim() || null;
  const approvalRequired  = formData.get("approval_required") === "on";
  const location          = (formData.get("location") as string)?.trim() || null;
  const isPublic          = formData.get("is_public") === "on";
  const photoUrl          = (formData.get("photo_url") as string)?.trim() || null;

  if (!name || !categoryId) return;

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      name,
      description,
      category_id: categoryId,
      tracked_individually: trackedIndividually,
      total_quantity: totalQuantity,
      serial_number: serialNumber,
      condition,
      condition_notes: conditionNotes,
      approval_required: approvalRequired,
      location,
      is_public: isPublic,
      photo_url: photoUrl,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !item) return;

  redirect(`/admin/inventory/items/${item.id}`);
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/(app)/admin/inventory/items/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createItemAction } from "./actions";

export default async function NewItemPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("id, name")
    .order("order");

  if (!categories || categories.length === 0) {
    redirect("/admin/inventory/categories");
  }

  return (
    <div className="max-w-md">
      <Link href="/admin/inventory/items" className="text-sm text-slate-500 hover:text-slate-900">← Items</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">New item</h1>

      <form action={createItemAction} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Item name</label>
          <input type="text" name="name" required autoFocus className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            {categories!.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Description (optional)</label>
          <textarea name="description" rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="tracked_individually" className="rounded border-slate-300 text-indigo-600" />
          Tracked individually (each unit is unique, like Mic #1)
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Total quantity (ignored if tracked individually)</label>
          <input type="number" name="total_quantity" min="1" defaultValue="1" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Serial number (optional)</label>
          <input type="text" name="serial_number" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition</label>
          <select name="condition" defaultValue="good" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition notes (optional)</label>
          <input type="text" name="condition_notes" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Location (optional)</label>
          <input type="text" name="location" placeholder="e.g. AV Room" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Photo URL (optional)</label>
          <input type="url" name="photo_url" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="approval_required" className="rounded border-slate-300 text-indigo-600" />
          Member reservations need approval
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="is_public" defaultChecked className="rounded border-slate-300 text-indigo-600" />
          Visible to members (their visibility also depends on the category)
        </label>

        <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Create item
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Write the loading skeleton**

```tsx
// src/app/(app)/admin/inventory/items/new/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-28 bg-slate-200 rounded mt-1 mb-6" />
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 w-24 bg-slate-200 rounded" />
            <div className="h-9 bg-slate-100 rounded-lg" />
          </div>
        ))}
        <div className="h-9 w-full bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
```

Visit `/admin/inventory/items/new`, create a category first if needed (`/admin/inventory/categories`), then create an item. Expected: redirect to `/admin/inventory/items/<id>` (not yet built — 404 is OK for now).

```bash
git add "src/app/(app)/admin/inventory/items/new/"
git commit -m "feat: admin new item page + create action"
```

---

### Task 10: Items — Detail / Edit Page

**Files:**
- Create: `src/app/(app)/admin/inventory/items/[id]/page.tsx`
- Create: `src/app/(app)/admin/inventory/items/[id]/loading.tsx`
- Create: `src/app/(app)/admin/inventory/items/[id]/EditItemForm.tsx`
- Create: `src/app/(app)/admin/inventory/items/[id]/actions.ts`

- [ ] **Step 1: Write the actions**

```ts
// src/app/(app)/admin/inventory/items/[id]/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateItemAction(id: string, formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();

  const name              = (formData.get("name") as string)?.trim();
  const description       = (formData.get("description") as string)?.trim() || null;
  const categoryId        = formData.get("category_id") as string;
  const trackedIndividually = formData.get("tracked_individually") === "on";
  const totalQuantity     = trackedIndividually ? 1 : Math.max(1, Number(formData.get("total_quantity") ?? "1"));
  const serialNumber      = (formData.get("serial_number") as string)?.trim() || null;
  const condition         = (formData.get("condition") as "good" | "needs_repair" | "out_of_service") ?? "good";
  const conditionNotes    = (formData.get("condition_notes") as string)?.trim() || null;
  const approvalRequired  = formData.get("approval_required") === "on";
  const location          = (formData.get("location") as string)?.trim() || null;
  const isPublic          = formData.get("is_public") === "on";
  const photoUrl          = (formData.get("photo_url") as string)?.trim() || null;

  if (!name || !categoryId) return;

  const supabase = await createClient();
  await supabase
    .from("inventory_items")
    .update({
      name,
      description,
      category_id: categoryId,
      tracked_individually: trackedIndividually,
      total_quantity: totalQuantity,
      serial_number: serialNumber,
      condition,
      condition_notes: conditionNotes,
      approval_required: approvalRequired,
      location,
      is_public: isPublic,
      photo_url: photoUrl,
    })
    .eq("id", id);

  revalidatePath(`/admin/inventory/items/${id}`);
  revalidatePath("/admin/inventory/items");
}

export async function deleteItemAction(id: string): Promise<void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("inventory_reservations")
    .select("id", { count: "exact", head: true })
    .eq("item_id", id)
    .in("status", ["pending", "approved", "checked_out"]);

  if (count && count > 0) return;

  await supabase.from("inventory_items").delete().eq("id", id);
  redirect("/admin/inventory/items");
}
```

- [ ] **Step 2: Write the edit form (client)**

```tsx
// src/app/(app)/admin/inventory/items/[id]/EditItemForm.tsx
"use client";

import { useTransition } from "react";
import { deleteItemAction, updateItemAction } from "./actions";

type Category = { id: string; name: string };
type Item = {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  tracked_individually: boolean;
  total_quantity: number;
  serial_number: string | null;
  condition: "good" | "needs_repair" | "out_of_service";
  condition_notes: string | null;
  approval_required: boolean;
  location: string | null;
  is_public: boolean;
  photo_url: string | null;
};

export function EditItemForm({ item, categories }: { item: Item; categories: Category[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <form action={updateItemAction.bind(null, item.id)} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Item name</label>
          <input type="text" name="name" required defaultValue={item.name} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" required defaultValue={item.category_id} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Description</label>
          <textarea name="description" rows={2} defaultValue={item.description ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="tracked_individually" defaultChecked={item.tracked_individually} className="rounded border-slate-300 text-indigo-600" />
          Tracked individually
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Total quantity</label>
          <input type="number" name="total_quantity" min="1" defaultValue={item.total_quantity} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Serial number</label>
          <input type="text" name="serial_number" defaultValue={item.serial_number ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition</label>
          <select name="condition" defaultValue={item.condition} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition notes</label>
          <input type="text" name="condition_notes" defaultValue={item.condition_notes ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Location</label>
          <input type="text" name="location" defaultValue={item.location ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Photo URL</label>
          <input type="url" name="photo_url" defaultValue={item.photo_url ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="approval_required" defaultChecked={item.approval_required} className="rounded border-slate-300 text-indigo-600" />
          Member reservations need approval
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="is_public" defaultChecked={item.is_public} className="rounded border-slate-300 text-indigo-600" />
          Visible to members
        </label>

        <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Save
        </button>
      </form>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Delete "${item.name}"? This is only allowed if no active reservations exist.`)) return;
          startTransition(async () => {
            await deleteItemAction(item.id);
          });
        }}
        className="mt-4 text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
      >
        Delete item
      </button>
    </>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/app/(app)/admin/inventory/items/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditItemForm } from "./EditItemForm";

const RES_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-slate-100 text-slate-500",
  checked_out: "bg-indigo-100 text-indigo-700",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLogisticsOrAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: categories }, { data: history }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", id).maybeSingle(),
    supabase.from("inventory_categories").select("id, name").order("order"),
    supabase
      .from("inventory_reservations")
      .select("id, status, start_date, end_date, profiles!inventory_reservations_profile_id_fkey(first_name, last_name)")
      .eq("item_id", id)
      .order("start_date", { ascending: false })
      .limit(20),
  ]);

  if (!item) notFound();

  return (
    <div className="max-w-md">
      <Link href="/admin/inventory/items" className="text-sm text-slate-500 hover:text-slate-900">← Items</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">{item.name}</h1>

      <EditItemForm item={item} categories={categories ?? []} />

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Recent reservations</h2>
        {(history ?? []).length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
        {(history ?? []).map(r => {
          const p = r.profiles as { first_name: string; last_name: string } | null;
          return (
            <div key={r.id} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0 text-sm">
              <span className="flex-1">{p ? `${p.first_name} ${p.last_name}` : "—"}</span>
              <span className="text-xs text-slate-500">
                {r.start_date} → {r.end_date}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${RES_STATUS_BADGE[r.status]}`}>
                {r.status.replace("_", " ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the loading skeleton**

```tsx
// src/app/(app)/admin/inventory/items/[id]/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="h-4 w-16 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-48 bg-slate-200 rounded mt-1 mb-6" />
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 w-24 bg-slate-200 rounded" />
            <div className="h-9 bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6 space-y-3">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        {[1, 2, 3].map(i => <div key={i} className="h-6 bg-slate-100 rounded" />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
```

Create an item, navigate to its detail page, edit a field, save. Confirm the change persists on reload.

```bash
git add "src/app/(app)/admin/inventory/items/[id]/"
git commit -m "feat: admin item edit page with reservation history and delete guard"
```

---

### Task 11: Member Catalogue `/inventory`

**Files:**
- Create: `src/app/(app)/inventory/page.tsx`
- Create: `src/app/(app)/inventory/loading.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/(app)/inventory/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const CONDITION_BADGE: Record<string, string> = {
  good: "bg-green-100 text-green-700",
  needs_repair: "bg-amber-100 text-amber-700",
  out_of_service: "bg-red-100 text-red-700",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireUser();
  const { category } = await searchParams;
  const supabase = await createClient();

  // RLS handles visibility; we just query.
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("inventory_categories").select("id, name, color, order").order("order"),
    supabase
      .from("inventory_items")
      .select("id, name, photo_url, category_id, condition, tracked_individually, total_quantity")
      .order("name"),
  ]);

  const visibleCategories = categories ?? [];
  const filteredItems = (items ?? []).filter(i => !category || i.category_id === category);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Inventory</h1>

      {visibleCategories.length === 0 && (
        <p className="text-sm text-slate-400">No items available right now.</p>
      )}

      <div className="flex gap-2 flex-wrap mb-5">
        <Link
          href="/inventory"
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
            !category ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
          )}
        >
          All
        </Link>
        {visibleCategories.map(c => (
          <Link
            key={c.id}
            href={`/inventory?category=${c.id}`}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-colors",
              category === c.id ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
            {c.name}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {filteredItems.map(i => {
          const isOutOfService = i.condition === "out_of_service";
          return (
            <Link
              key={i.id}
              href={isOutOfService ? "#" : `/inventory/${i.id}`}
              className={cn(
                "bg-white rounded-xl border border-slate-200 p-4 transition-colors",
                isOutOfService ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50",
              )}
            >
              {i.photo_url && (
                <img src={i.photo_url} alt="" className="w-full h-32 object-cover rounded-lg mb-3 bg-slate-100" />
              )}
              <div className="text-sm font-medium text-slate-900">{i.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", CONDITION_BADGE[i.condition])}>
                  {i.condition.replace("_", " ")}
                </span>
                <span className="text-xs text-slate-500">
                  {i.tracked_individually ? "1 unit" : `${i.total_quantity} total`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {filteredItems.length === 0 && visibleCategories.length > 0 && (
        <p className="text-sm text-slate-400 text-center mt-8">No items in this category.</p>
      )}

      <div className="mt-6">
        <Link href="/inventory/reservations" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          My reservations →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the loading skeleton**

```tsx
// src/app/(app)/inventory/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-32 bg-slate-200 rounded mb-4" />
      <div className="flex gap-2 flex-wrap mb-5">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-7 w-20 bg-slate-100 rounded-full" />)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="h-32 bg-slate-100 rounded-lg" />
            <div className="h-4 w-32 bg-slate-200 rounded" />
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
              <div className="h-5 w-12 bg-slate-100 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
```

Visit `/inventory` as a member or admin. Expected: catalogue grid renders with category filter chips.

```bash
git add "src/app/(app)/inventory/page.tsx" "src/app/(app)/inventory/loading.tsx"
git commit -m "feat: member inventory catalogue with category filter"
```

---

### Task 12: Item Detail + Reserve Form

**Files:**
- Create: `src/app/(app)/inventory/[id]/page.tsx`
- Create: `src/app/(app)/inventory/[id]/loading.tsx`
- Create: `src/app/(app)/inventory/[id]/ReserveForm.tsx`
- Create: `src/app/(app)/inventory/[id]/actions.ts`

- [ ] **Step 1: Write the create-reservation action**

```ts
// src/app/(app)/inventory/[id]/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calculateAvailability } from "@/lib/inventory";

export async function createReservationAction(itemId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const startDate = formData.get("start_date") as string;
  const endDate   = formData.get("end_date")   as string;
  const quantity  = Math.max(1, Number(formData.get("quantity") ?? "1"));
  const notes     = (formData.get("notes") as string)?.trim() || null;

  if (!startDate || !endDate || endDate < startDate) return;

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, tracked_individually, total_quantity, condition, approval_required")
    .eq("id", itemId)
    .maybeSingle();

  if (!item || item.condition === "out_of_service") return;

  const { data: actives } = await supabase
    .from("inventory_reservations")
    .select("status, start_date, end_date, quantity")
    .eq("item_id", itemId)
    .in("status", ["approved", "checked_out"]);

  const available = calculateAvailability(
    { tracked_individually: item.tracked_individually, total_quantity: item.total_quantity, condition: item.condition },
    (actives ?? []) as { status: "approved" | "checked_out"; start_date: string; end_date: string; quantity: number }[],
    { start_date: startDate, end_date: endDate },
  );

  const requested = item.tracked_individually ? 1 : quantity;
  if (available < requested) return;

  const isStaff = user.role === "admin" || user.role === "logistics";
  const status = item.approval_required && !isStaff ? "pending" : "approved";

  await supabase.from("inventory_reservations").insert({
    item_id: itemId,
    profile_id: user.id,
    created_by: user.id,
    quantity: requested,
    start_date: startDate,
    end_date: endDate,
    status,
    notes,
    approved_by: status === "approved" ? user.id : null,
    approved_at: status === "approved" ? new Date().toISOString() : null,
  });

  redirect("/inventory/reservations");
}
```

- [ ] **Step 2: Write the reserve form (client)**

```tsx
// src/app/(app)/inventory/[id]/ReserveForm.tsx
"use client";

import { useState } from "react";
import { createReservationAction } from "./actions";

type Props = {
  itemId: string;
  trackedIndividually: boolean;
  maxQuantity: number;
  approvalRequired: boolean;
};

export function ReserveForm({ itemId, trackedIndividually, maxQuantity, approvalRequired }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  return (
    <form action={createReservationAction.bind(null, itemId)} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input
            type="date"
            name="start_date"
            required
            min={today}
            value={start}
            onChange={e => {
              setStart(e.target.value);
              if (end < e.target.value) setEnd(e.target.value);
            }}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input
            type="date"
            name="end_date"
            required
            min={start}
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {!trackedIndividually && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Quantity (max {maxQuantity})</label>
          <input
            type="number"
            name="quantity"
            min="1"
            max={maxQuantity}
            defaultValue="1"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Reason (optional)</label>
        <input
          type="text"
          name="notes"
          placeholder="e.g. Youth meeting"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
        {approvalRequired ? "Request" : "Reserve"}
      </button>
      {approvalRequired && (
        <p className="text-xs text-slate-500 text-center">Logistics will review and confirm.</p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/app/(app)/inventory/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calculateAvailability } from "@/lib/inventory";
import { ReserveForm } from "./ReserveForm";
import { cn } from "@/lib/utils";

const CONDITION_BADGE: Record<string, string> = {
  good: "bg-green-100 text-green-700",
  needs_repair: "bg-amber-100 text-amber-700",
  out_of_service: "bg-red-100 text-red-700",
};

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, name, description, photo_url, category_id, tracked_individually, total_quantity, serial_number, condition, condition_notes, approval_required, location, inventory_categories(name, color)")
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  const today = new Date().toISOString().split("T")[0];
  const sixtyDaysOut = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().split("T")[0];

  const { data: actives } = await supabase
    .from("inventory_reservations")
    .select("status, start_date, end_date, quantity")
    .eq("item_id", id)
    .in("status", ["approved", "checked_out"])
    .gte("end_date", today)
    .lte("start_date", sixtyDaysOut);

  const todayAvailable = calculateAvailability(
    { tracked_individually: item.tracked_individually, total_quantity: item.total_quantity, condition: item.condition },
    (actives ?? []) as { status: "approved" | "checked_out"; start_date: string; end_date: string; quantity: number }[],
    { start_date: today, end_date: today },
  );

  const cat = item.inventory_categories as { name: string; color: string } | null;
  const isOutOfService = item.condition === "out_of_service";

  return (
    <div className="max-w-md">
      <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-4">{item.name}</h1>

      {item.photo_url && (
        <img src={item.photo_url} alt="" className="w-full h-48 object-cover rounded-xl mb-4 bg-slate-100" />
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-2 text-sm">
        {cat && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
            <span className="text-slate-700">{cat.name}</span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", CONDITION_BADGE[item.condition])}>
            {item.condition.replace("_", " ")}
          </span>
          <span className="text-xs text-slate-500">
            {item.tracked_individually ? "Individually tracked" : `${item.total_quantity} total`}
          </span>
          <span className="text-xs text-slate-500">{todayAvailable} available today</span>
        </div>
        {item.serial_number && <p className="text-xs text-slate-500">Serial: {item.serial_number}</p>}
        {item.location && <p className="text-xs text-slate-500">Location: {item.location}</p>}
        {item.condition_notes && <p className="text-xs text-amber-600">Note: {item.condition_notes}</p>}
        {item.description && <p className="text-slate-700 pt-2 border-t border-slate-100">{item.description}</p>}
      </div>

      {isOutOfService ? (
        <p className="text-sm text-slate-500 bg-slate-100 rounded-xl p-4 text-center">This item is out of service and cannot be reserved.</p>
      ) : (
        <ReserveForm
          itemId={item.id}
          trackedIndividually={item.tracked_individually}
          maxQuantity={item.total_quantity}
          approvalRequired={item.approval_required}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the loading skeleton**

```tsx
// src/app/(app)/inventory/[id]/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-md animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-48 bg-slate-200 rounded mt-1 mb-4" />
      <div className="h-48 bg-slate-100 rounded-xl mb-4" />
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-2">
        <div className="h-4 w-24 bg-slate-200 rounded" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-slate-100 rounded-full" />
          <div className="h-5 w-20 bg-slate-100 rounded-full" />
        </div>
        <div className="h-3 w-40 bg-slate-100 rounded" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="h-9 bg-slate-100 rounded-lg" />
          <div className="h-9 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-9 bg-slate-100 rounded-lg" />
        <div className="h-9 w-full bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
```

Click an item from `/inventory`, fill in the reserve form, submit. Expected: redirected to `/inventory/reservations` (not yet built — fine for now).

```bash
git add "src/app/(app)/inventory/[id]/"
git commit -m "feat: member item detail page with availability and reserve form"
```

---

### Task 13: My Reservations Page + Cancel/Return Actions

**Files:**
- Create: `src/app/(app)/inventory/reservations/page.tsx`
- Create: `src/app/(app)/inventory/reservations/loading.tsx`
- Create: `src/app/(app)/inventory/reservations/MyReservationsList.tsx`
- Create: `src/app/(app)/inventory/reservations/actions.ts`

- [ ] **Step 1: Write the actions**

```ts
// src/app/(app)/inventory/reservations/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function cancelOwnReservationAction(reservationId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("inventory_reservations")
    .select("profile_id, status")
    .eq("id", reservationId)
    .maybeSingle();

  if (!r || r.profile_id !== user.id) return;
  if (r.status !== "pending" && r.status !== "approved") return;

  await supabase
    .from("inventory_reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId);

  revalidatePath("/inventory/reservations");
  revalidatePath("/dashboard");
}

export async function markReturnedSelfAction(reservationId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("inventory_reservations")
    .select("profile_id, status, item_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (!r || r.profile_id !== user.id || r.status !== "checked_out") return;

  const condition = formData.get("return_condition") as "good" | "needs_repair" | "out_of_service" | null;
  const returnNotes = (formData.get("return_notes") as string)?.trim() || null;

  await supabase
    .from("inventory_reservations")
    .update({
      status: "returned",
      returned_at: new Date().toISOString(),
      return_condition: condition,
      return_notes: returnNotes,
    })
    .eq("id", reservationId);

  if (condition) {
    await supabase.from("inventory_items").update({ condition }).eq("id", r.item_id);
  }

  revalidatePath("/inventory/reservations");
  revalidatePath("/dashboard");
}
```

- [ ] **Step 2: Write the client list with optimistic cancel**

```tsx
// src/app/(app)/inventory/reservations/MyReservationsList.tsx
"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { cancelOwnReservationAction, markReturnedSelfAction } from "./actions";

type Reservation = {
  id: string;
  status: "pending" | "approved" | "rejected" | "checked_out" | "returned" | "cancelled";
  start_date: string;
  end_date: string;
  quantity: number;
  notes: string | null;
  rejection_reason: string | null;
  inventory_items: { id: string; name: string } | null;
};

const STATUS_BADGE: Record<Reservation["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-slate-100 text-slate-500",
  checked_out: "bg-indigo-100 text-indigo-700",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function MyReservationsList({ reservations }: { reservations: Reservation[] }) {
  const [optimistic, cancelOptimistic] = useOptimistic(
    reservations,
    (current: Reservation[], cancelledId: string) =>
      current.map(r => r.id === cancelledId ? { ...r, status: "cancelled" as const } : r),
  );
  const [isPending, startTransition] = useTransition();

  const pending = optimistic.filter(r => r.status === "pending" || r.status === "approved");
  const active  = optimistic.filter(r => r.status === "checked_out");
  const past    = optimistic.filter(r => r.status === "returned" || r.status === "rejected" || r.status === "cancelled");

  const Card = ({ r, showCancel, showReturn }: { r: Reservation; showCancel: boolean; showReturn: boolean }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link href={r.inventory_items ? `/inventory/${r.inventory_items.id}` : "#"} className="text-sm font-medium text-slate-900 hover:text-indigo-600">
            {r.inventory_items?.name ?? "—"}
          </Link>
          <div className="text-xs text-slate-500 mt-0.5">
            {formatDate(r.start_date)} → {formatDate(r.end_date)}
            {r.quantity > 1 && ` · qty ${r.quantity}`}
          </div>
          {r.notes && <div className="text-xs text-slate-400 mt-0.5">{r.notes}</div>}
          {r.rejection_reason && <div className="text-xs text-red-500 mt-0.5">Rejected: {r.rejection_reason}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${STATUS_BADGE[r.status]}`}>
          {r.status.replace("_", " ")}
        </span>
      </div>

      {showCancel && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              cancelOptimistic(r.id);
              await cancelOwnReservationAction(r.id);
            });
          }}
          className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          Cancel
        </button>
      )}

      {showReturn && (
        <form action={markReturnedSelfAction.bind(null, r.id)} className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <select name="return_condition" defaultValue="good" className="text-xs border border-slate-200 rounded px-2 py-1">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
          <input type="text" name="return_notes" placeholder="Notes (optional)" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 min-w-0" />
          <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Mark returned</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Pending & approved</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">None.</p>
        ) : (
          <div className="space-y-2">
            {pending.map(r => <Card key={r.id} r={r} showCancel showReturn={false} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Currently checked out</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">None.</p>
        ) : (
          <div className="space-y-2">
            {active.map(r => <Card key={r.id} r={r} showCancel={false} showReturn />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Past</h2>
          <div className="space-y-2">
            {past.map(r => <Card key={r.id} r={r} showCancel={false} showReturn={false} />)}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/app/(app)/inventory/reservations/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MyReservationsList } from "./MyReservationsList";

export default async function MyReservationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: reservations } = await supabase
    .from("inventory_reservations")
    .select("id, status, start_date, end_date, quantity, notes, rejection_reason, inventory_items(id, name)")
    .eq("profile_id", user.id)
    .order("start_date", { ascending: false });

  return (
    <div className="max-w-2xl">
      <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">My reservations</h1>
      <MyReservationsList reservations={(reservations ?? []) as Parameters<typeof MyReservationsList>[0]["reservations"]} />
    </div>
  );
}
```

- [ ] **Step 4: Write the loading skeleton**

```tsx
// src/app/(app)/inventory/reservations/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-2xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-44 bg-slate-200 rounded mt-1 mb-6" />
      {[1, 2].map(s => (
        <div key={s} className="mb-6">
          <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 mb-2 space-y-2">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
```

Reserve an item, navigate to `/inventory/reservations`, confirm it appears in "Pending & approved". Click Cancel; row updates to "cancelled" instantly.

```bash
git add "src/app/(app)/inventory/reservations/"
git commit -m "feat: my reservations page with cancel and self-return"
```

---

### Task 14: Admin Reservations + Approve/Reject/Checkout/Return Actions

**Files:**
- Create: `src/app/(app)/admin/inventory/reservations/page.tsx`
- Create: `src/app/(app)/admin/inventory/reservations/loading.tsx`
- Create: `src/app/(app)/admin/inventory/reservations/AdminReservationsList.tsx`
- Create: `src/app/(app)/admin/inventory/reservations/actions.ts`

- [ ] **Step 1: Write the actions**

```ts
// src/app/(app)/admin/inventory/reservations/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function approveReservationAction(id: string): Promise<void> {
  const user = await requireLogisticsOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("inventory_reservations")
    .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/inventory/reservations");
}

export async function rejectReservationAction(id: string, formData: FormData): Promise<void> {
  const user = await requireLogisticsOrAdmin();
  const supabase = await createClient();
  const reason = (formData.get("rejection_reason") as string)?.trim() || null;
  await supabase
    .from("inventory_reservations")
    .update({ status: "rejected", approved_by: user.id, approved_at: new Date().toISOString(), rejection_reason: reason })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/inventory/reservations");
}

export async function checkoutReservationAction(id: string): Promise<void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("inventory_reservations")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved");
  revalidatePath("/admin/inventory/reservations");
}

export async function returnReservationAction(id: string, formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const condition = formData.get("return_condition") as "good" | "needs_repair" | "out_of_service" | null;
  const returnNotes = (formData.get("return_notes") as string)?.trim() || null;

  const { data: r } = await supabase
    .from("inventory_reservations")
    .select("item_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!r || r.status !== "checked_out") return;

  await supabase
    .from("inventory_reservations")
    .update({
      status: "returned",
      returned_at: new Date().toISOString(),
      return_condition: condition,
      return_notes: returnNotes,
    })
    .eq("id", id);

  if (condition) {
    await supabase.from("inventory_items").update({ condition }).eq("id", r.item_id);
  }

  revalidatePath("/admin/inventory/reservations");
}
```

- [ ] **Step 2: Write the admin list (client)**

```tsx
// src/app/(app)/admin/inventory/reservations/AdminReservationsList.tsx
"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  approveReservationAction,
  rejectReservationAction,
  checkoutReservationAction,
  returnReservationAction,
} from "./actions";

type Reservation = {
  id: string;
  status: "pending" | "approved" | "rejected" | "checked_out" | "returned" | "cancelled";
  start_date: string;
  end_date: string;
  quantity: number;
  notes: string | null;
  rejection_reason: string | null;
  inventory_items: { id: string; name: string } | null;
  profiles: { first_name: string; last_name: string } | null;
};

const STATUS_BADGE: Record<Reservation["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-slate-100 text-slate-500",
  checked_out: "bg-indigo-100 text-indigo-700",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function AdminReservationsList({ reservations }: { reservations: Reservation[] }) {
  const [optimistic, updateOptimistic] = useOptimistic(
    reservations,
    (current: Reservation[], update: { id: string; status: Reservation["status"] }) =>
      current.map(r => r.id === update.id ? { ...r, status: update.status } : r),
  );
  const [isPending, startTransition] = useTransition();
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const pending  = optimistic.filter(r => r.status === "pending");
  const upcoming = optimistic.filter(r => r.status === "approved");
  const active   = optimistic.filter(r => r.status === "checked_out" && r.end_date >= today);
  const overdue  = optimistic.filter(r => r.status === "checked_out" && r.end_date < today);
  const recent   = optimistic.filter(r => ["returned", "rejected", "cancelled"].includes(r.status)).slice(0, 20);

  const Card = ({ r, action }: { r: Reservation; action: "approve" | "checkout" | "return" | "none" }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900">{r.inventory_items?.name ?? "—"}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "—"} · {formatDate(r.start_date)} → {formatDate(r.end_date)}
            {r.quantity > 1 && ` · qty ${r.quantity}`}
          </div>
          {r.notes && <div className="text-xs text-slate-400 mt-0.5">{r.notes}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${STATUS_BADGE[r.status]}`}>
          {r.status.replace("_", " ")}
        </span>
      </div>

      {action === "approve" && (
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              updateOptimistic({ id: r.id, status: "approved" });
              await approveReservationAction(r.id);
            })}
            className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-lg disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setShowRejectFor(r.id)}
            className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg"
          >
            Reject
          </button>
        </div>
      )}

      {showRejectFor === r.id && (
        <form
          action={async (fd: FormData) => {
            startTransition(async () => {
              updateOptimistic({ id: r.id, status: "rejected" });
              await rejectReservationAction(r.id, fd);
              setShowRejectFor(null);
            });
          }}
          className="flex items-center gap-2 pt-2 border-t border-slate-100"
        >
          <input type="text" name="rejection_reason" placeholder="Reason (optional)" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1" />
          <button type="submit" className="text-xs font-medium text-red-700">Confirm reject</button>
          <button type="button" onClick={() => setShowRejectFor(null)} className="text-xs text-slate-500">Cancel</button>
        </form>
      )}

      {action === "checkout" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            updateOptimistic({ id: r.id, status: "checked_out" });
            await checkoutReservationAction(r.id);
          })}
          className="text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg disabled:opacity-50"
        >
          Mark checked out
        </button>
      )}

      {action === "return" && (
        <form action={returnReservationAction.bind(null, r.id)} className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <select name="return_condition" defaultValue="good" className="text-xs border border-slate-200 rounded px-2 py-1">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
          <input type="text" name="return_notes" placeholder="Notes (optional)" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 min-w-0" />
          <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Mark returned</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Section title="Pending approval" rs={pending} action="approve" />
      <Section title="Upcoming (approved)" rs={upcoming} action="checkout" />
      <Section title="Currently checked out" rs={active} action="return" />
      {overdue.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-700 mb-2">Overdue</h2>
          <div className="space-y-2">
            {overdue.map(r => <Card key={r.id} r={r} action="return" />)}
          </div>
        </section>
      )}
      <Section title="Recent activity" rs={recent} action="none" />
    </div>
  );

  function Section({ title, rs, action }: { title: string; rs: Reservation[]; action: "approve" | "checkout" | "return" | "none" }) {
    if (rs.length === 0) return (
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">{title}</h2>
        <p className="text-sm text-slate-400">None.</p>
      </section>
    );
    return (
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">{title}</h2>
        <div className="space-y-2">
          {rs.map(r => <Card key={r.id} r={r} action={action} />)}
        </div>
      </section>
    );
  }
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/app/(app)/admin/inventory/reservations/page.tsx
import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminReservationsList } from "./AdminReservationsList";

export default async function AdminReservationsPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: reservations } = await supabase
    .from("inventory_reservations")
    .select("id, status, start_date, end_date, quantity, notes, rejection_reason, inventory_items(id, name), profiles!inventory_reservations_profile_id_fkey(first_name, last_name)")
    .order("start_date", { ascending: false })
    .limit(200);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/inventory" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Reservations</h1>
      <AdminReservationsList reservations={(reservations ?? []) as Parameters<typeof AdminReservationsList>[0]["reservations"]} />
    </div>
  );
}
```

- [ ] **Step 4: Write the loading skeleton**

```tsx
// src/app/(app)/admin/inventory/reservations/loading.tsx
export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
      <div className="h-7 w-36 bg-slate-200 rounded mt-1 mb-6" />
      {[1, 2, 3].map(s => (
        <div key={s} className="mb-6">
          <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 mb-2 space-y-2">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="h-3 w-48 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
```

As a member, request an item that requires approval. Sign in as logistics/admin, visit `/admin/inventory/reservations`, click Approve, then Mark checked out, then submit return.

```bash
git add "src/app/(app)/admin/inventory/reservations/"
git commit -m "feat: admin reservations page with approve/reject/checkout/return"
```

---

### Task 15: Navigation — Sidebar + Bottom Tabs

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomTabs.tsx`

- [ ] **Step 1: Add Inventory to the sidebar**

Modify `src/components/layout/Sidebar.tsx`. Find the line:

```tsx
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  ClipboardList,
} from "lucide-react";
```

Replace it with:

```tsx
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  ClipboardList,
  Boxes,
} from "lucide-react";
```

Find the `NAV_ITEMS` constant and add the Inventory item before `Roster`:

```tsx
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/people",    label: "People",    icon: Users },
  { href: "/schedule",  label: "Schedule",  icon: Calendar },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/roster",    label: "Roster",    icon: ClipboardList, adminOnly: true },
  { href: "/admin",     label: "Admin",     icon: Settings, adminOnly: true },
];
```

- [ ] **Step 2: Add Inventory tab to bottom nav**

Modify `src/components/layout/BottomTabs.tsx`. Replace the `tabs` array inside the `BottomTabs` function:

```tsx
  const tabs = [
    { href: "/dashboard", label: "Home",      icon: LayoutDashboard },
    { href: "/inventory", label: "Inventory", icon: Boxes },
    { href: "/schedule",  label: "Schedule",  icon: Calendar },
    ...(role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: Settings }]
      : []),
  ];
```

And update the imports at the top:

```tsx
import { LayoutDashboard, Boxes, Calendar, Settings } from "lucide-react";
```

(People is removed from the bottom tab to keep the bar at four items max — it remains in the sidebar.)

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
```

Reload the app — sidebar shows Inventory link, mobile bottom tabs show Inventory.

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/BottomTabs.tsx
git commit -m "feat: add Inventory to sidebar and bottom tabs"
```

---

### Task 16: Dashboard Integration — Member + Staff Strips

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Read the current dashboard**

```bash
cat "src/app/(app)/dashboard/page.tsx"
```

- [ ] **Step 2: Add inventory data fetch and render**

In `src/app/(app)/dashboard/page.tsx`, add these imports at the top (next to existing imports):

```tsx
import { Boxes, Bell } from "lucide-react";
```

After the existing data fetches (and before the `return`), add:

```tsx
  // My active inventory reservations (anything not finished)
  const { data: myInvRes } = await supabase
    .from("inventory_reservations")
    .select("id, status, start_date, end_date, inventory_items(id, name)")
    .eq("profile_id", user.id)
    .in("status", ["pending", "approved", "checked_out"])
    .order("start_date");

  // Staff alerts
  const isStaff = user.role === "admin" || user.role === "logistics";
  let pendingApprovalCount = 0;
  let overdueCount = 0;
  if (isStaff) {
    const today = new Date().toISOString().split("T")[0];
    const [{ count: pc }, { count: oc }] = await Promise.all([
      supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "checked_out").lt("end_date", today),
    ]);
    pendingApprovalCount = pc ?? 0;
    overdueCount = oc ?? 0;
  }
```

Then, inside the returned JSX, just **after** the existing top-of-page elements (e.g. greeting/heading) and before the existing Upcoming assignments section, insert:

```tsx
      {/* Inventory: my reservations */}
      {(myInvRes ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Boxes className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">My inventory</h2>
            <Link href="/inventory/reservations" className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800">
              See all →
            </Link>
          </div>
          <div className="space-y-1">
            {(myInvRes ?? []).slice(0, 4).map(r => {
              const it = r.inventory_items as { id: string; name: string } | null;
              return (
                <div key={r.id} className="flex items-center gap-3 text-sm py-1">
                  <span className="flex-1 text-slate-800">{it?.name ?? "—"}</span>
                  <span className="text-xs text-slate-500">{r.start_date} → {r.end_date}</span>
                  <span className="text-xs text-indigo-600 capitalize">{r.status.replace("_", " ")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inventory: staff alerts */}
      {isStaff && (pendingApprovalCount > 0 || overdueCount > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <Bell className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 flex-1">
            {pendingApprovalCount > 0 && <>{pendingApprovalCount} pending approval{pendingApprovalCount > 1 && "s"}</>}
            {pendingApprovalCount > 0 && overdueCount > 0 && " · "}
            {overdueCount > 0 && <>{overdueCount} overdue</>}
          </span>
          <Link href="/admin/inventory/reservations" className="text-xs font-medium text-amber-700 hover:text-amber-900">
            Review →
          </Link>
        </div>
      )}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
```

As a member with a reservation, the dashboard now shows "My inventory" with up to four rows. As staff, when there are pending or overdue items, the amber alert strip appears.

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: dashboard inventory strip (member) and alerts strip (staff)"
```

---

### Task 17: E2E Tests

**Files:**
- Create: `tests/e2e/inventory.spec.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/e2e/inventory.spec.ts
import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL    = "admin@commune.local";
const ADMIN_PASSWORD = "commune-admin-dev";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test.describe("Inventory — admin flow", () => {
  test("admin creates a category and a public bulk item", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/inventory/categories");

    const catName = `E2E Cat ${Date.now()}`;
    await page.getByLabel("New category name").fill(catName);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByDisplayValue(catName)).toBeVisible();

    await page.goto("/admin/inventory/items/new");
    await page.getByLabel("Item name").fill("E2E Test Chairs");
    await page.getByLabel("Category").selectOption({ label: catName });
    await page.getByLabel("Total quantity (ignored if tracked individually)").fill("10");
    await page.getByLabel("Location (optional)").fill("Hall");
    await page.getByRole("button", { name: "Create item" }).click();

    await expect(page).toHaveURL(/\/admin\/inventory\/items\//);
    await expect(page.getByDisplayValue("E2E Test Chairs")).toBeVisible();
  });

  test("admin sees inventory hub card on /admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /Inventory/ })).toBeVisible();
  });

  test("inventory tab appears in sidebar for everyone", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: "Inventory" })).toBeVisible();
  });
});

test.describe("Inventory — reservation flow", () => {
  test("admin creates auto-confirm item and reserves it; status is approved immediately", async ({ page }) => {
    await loginAsAdmin(page);

    // Ensure a category exists
    await page.goto("/admin/inventory/categories");
    const catName = `Auto ${Date.now()}`;
    await page.getByLabel("New category name").fill(catName);
    await page.getByRole("button", { name: "Add" }).click();

    // Create an auto-confirm item
    await page.goto("/admin/inventory/items/new");
    const itemName = `AutoItem ${Date.now()}`;
    await page.getByLabel("Item name").fill(itemName);
    await page.getByLabel("Category").selectOption({ label: catName });
    await page.getByLabel("Total quantity (ignored if tracked individually)").fill("3");
    await page.getByRole("button", { name: "Create item" }).click();

    // Reserve from the catalogue
    await page.goto("/inventory");
    await page.getByText(itemName).click();
    await page.getByPlaceholder("e.g. Youth meeting").fill("E2E test");
    await page.getByRole("button", { name: "Reserve" }).click();

    await expect(page).toHaveURL("/inventory/reservations");
    await expect(page.getByText(itemName)).toBeVisible();
    await expect(page.getByText("approved").first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run Playwright (skip if not running locally — CI will exercise this)**

```bash
pnpm exec playwright test tests/e2e/inventory.spec.ts --reporter=list
```

If Playwright isn't installed locally yet (`pnpm exec playwright install` once), skip running and rely on CI.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "test: e2e tests for inventory categories, items, and reservation flow"
```

---

### Task 18: Final Validation

- [ ] **Step 1: Run the unit suite**

```bash
pnpm test --run
```

Expected: all unit suites pass, including the new `inventory.test.ts`.

- [ ] **Step 2: Run the type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Smoke-test the app**

```bash
pnpm dev
```

In a browser, log in as admin and walk through:
1. `/admin/inventory/categories` — add "AV & Tech" (public) and "Vehicles" (private).
2. `/admin/inventory/items/new` — create a public bulk item ("Folding Chairs", qty 50) and a private individual item ("Church Van", VIN as serial).
3. `/inventory` — verify only "AV & Tech" category and "Folding Chairs" appear (Vehicles is hidden).
4. Direct URL `/inventory/<van-id>` — confirm 404 (RLS blocks it for the public catalogue path; admin can still see via `/admin/inventory/items/<id>`).
5. Reserve "Folding Chairs" with quantity 5 — confirm immediately approved (no `approval_required` flag).
6. Edit chairs to mark `approval_required = true`. Reserve again — confirm status is `pending`.
7. Visit `/admin/inventory/reservations` — approve the pending reservation, mark checked out, mark returned with `condition = needs_repair`. Confirm chairs item now shows `needs_repair` on its detail page.

- [ ] **Step 4: Final commit if anything is loose**

```bash
git status
```

If there is anything uncommitted, commit it. Otherwise nothing to do.

---

## Self-Review

**Spec coverage:**
- ✅ Three tables (categories, items, reservations) with RLS — Task 1
- ✅ `is_logistics_or_admin()` helper, RLS policies — Task 1
- ✅ Indexes — Task 1
- ✅ TypeScript types regenerated — Task 2
- ✅ `requireLogisticsOrAdmin()` helper — Task 3
- ✅ Pure helper module (`calculateAvailability`, `detectOverlap`, `canTransition`) — Task 4
- ✅ Unit tests covering bulk, individual, out-of-service, boundaries, and state machine — Task 5
- ✅ Admin inventory hub + admin hub card — Task 6
- ✅ Categories CRUD with public flag and optimistic delete — Task 7
- ✅ Items list with search/category-filter/hidden-only — Task 8
- ✅ New item form with all schema fields — Task 9
- ✅ Item edit page with reservation history and delete guard — Task 10
- ✅ Member catalogue with category chips and out-of-service dimming — Task 11
- ✅ Member item detail with availability and reserve form (auto-confirm vs pending) — Task 12
- ✅ My reservations page with cancel and self-return — Task 13
- ✅ Admin reservations page with approve/reject/checkout/return — Task 14
- ✅ Sidebar + bottom-tab Inventory entries — Task 15
- ✅ Dashboard inventory strip (member) + staff alerts — Task 16
- ✅ E2E tests — Task 17
- ✅ Loading skeletons at every route segment — Tasks 6–14
- ✅ Optimistic UI on cancel and admin status updates — Tasks 7, 13, 14

**Type consistency:**
- `InventoryCondition`, `ReservationStatus`, `ItemForAvailability`, `ActiveReservation`, `ActorRole` — all defined in `src/lib/inventory.ts` (Task 4); imported by tests in Task 5.
- `calculateAvailability` signature is consistent across Tasks 4, 5, 12 (called from `createReservationAction`).
- `requireLogisticsOrAdmin` defined in Task 3, used in every staff-side action and page (Tasks 6–10, 14).
- Reservation status enum strings (`pending`, `approved`, `rejected`, `checked_out`, `returned`, `cancelled`) used identically in DB migration (Task 1), library (Task 4), action layer (Tasks 12, 13, 14), and UI components (Tasks 13, 14).
- All page → action → table column names match the migration (e.g. `approval_required`, `tracked_individually`, `total_quantity`, `is_public`, `return_condition`, `rejection_reason`).

**Out of scope (per spec):** service-assignment, notifications, photo upload UI, maintenance scheduling, audit log, CSV import, member-facing search, calendar view, QR codes — none of these are addressed in this plan and that is intentional.
