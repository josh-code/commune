# Inventory & Logistics Design

## Overview

A church-wide inventory system covering everything from chairs and offering envelopes to projectors, vehicles, and instruments. It supports three workflows in one model — a stock register, item checkout/return, and reservations for future dates. Logistics-role users have full administrative control over the catalogue. Members can self-serve by browsing visible categories and reserving items, with per-item approval gates where needed.

The service-assignment workflow (linking items to specific church services) is specced as deferred and built in a later plan.

---

## Goals

- Maintain an accurate register of every physical asset and consumable the church owns.
- Let members reserve items they need for legitimate use, without exposing sensitive items (vehicles, expensive AV gear) to general browsing.
- Give logistics users a single hub to manage categories, items, condition, and the full reservation pipeline (pending → approved → checked-out → returned).
- Track condition so broken items can be flagged out-of-service and excluded from reservations automatically.
- Support both bulk-quantity items (50 chairs, 200 envelopes) and individually-tracked assets (Microphone #1) in one model.

---

## Data Model

Three new tables are introduced. All have RLS enabled.

### `inventory_categories`

| Column      | Type         | Notes                                                |
|-------------|--------------|------------------------------------------------------|
| `id`        | uuid PK      |                                                      |
| `name`      | text NOT NULL | Unique per organisation (single-org for now)        |
| `color`     | text NOT NULL DEFAULT `'#6366f1'` | Used in UI badges                |
| `icon`      | text          | Optional lucide icon name                           |
| `order`     | int NOT NULL DEFAULT 0 | Display order                              |
| `is_public` | bool NOT NULL DEFAULT true | Members see only public categories       |
| `created_at`| timestamptz NOT NULL DEFAULT now() |                                  |

### `inventory_items`

| Column                | Type        | Notes                                              |
|-----------------------|-------------|----------------------------------------------------|
| `id`                  | uuid PK     |                                                    |
| `category_id`         | uuid NOT NULL REFERENCES `inventory_categories(id)` ON DELETE RESTRICT |
| `name`                | text NOT NULL |                                                  |
| `description`         | text        |                                                    |
| `photo_url`           | text        | Manual URL paste in v1; upload UI deferred        |
| `tracked_individually`| bool NOT NULL DEFAULT false | True = unique asset; false = bulk |
| `total_quantity`      | int NOT NULL DEFAULT 1 | Used when `tracked_individually = false`. Must be ≥ 1. SQL CHECK: `CHECK (total_quantity >= 1 AND (tracked_individually = false OR total_quantity = 1))` |
| `serial_number`       | text        | Meaningful only for individual items              |
| `condition`           | enum NOT NULL DEFAULT `'good'` | `good` / `needs_repair` / `out_of_service` |
| `condition_notes`     | text        | Free-text ("cracked screen", "missing cable")     |
| `approval_required`   | bool NOT NULL DEFAULT false | If true, member reservations enter `pending` |
| `location`            | text        | Free text ("AV Room", "Storage Cupboard A")       |
| `is_public`           | bool NOT NULL DEFAULT true | Hide individual items even within public categories |
| `created_by`          | uuid NOT NULL REFERENCES `profiles(id)` |                            |
| `created_at`          | timestamptz NOT NULL DEFAULT now() |                              |

**Effective member visibility:** `category.is_public AND item.is_public`. If either flag is false, members cannot see the item in any list, search, count, or direct URL — RLS makes the row literally invisible.

### `inventory_reservations`

| Column            | Type         | Notes                                                  |
|-------------------|--------------|--------------------------------------------------------|
| `id`              | uuid PK      |                                                        |
| `item_id`         | uuid NOT NULL REFERENCES `inventory_items(id)` ON DELETE RESTRICT |
| `profile_id`      | uuid NOT NULL REFERENCES `profiles(id)` | The person the reservation is for |
| `created_by`      | uuid NOT NULL REFERENCES `profiles(id)` | The person who logged it (= profile_id for member-self, different for staff-on-behalf) |
| `quantity`        | int NOT NULL DEFAULT 1 | Always 1 for individual items                |
| `start_date`      | date NOT NULL |                                                       |
| `end_date`        | date NOT NULL | CHECK `end_date >= start_date`                        |
| `status`          | enum NOT NULL DEFAULT `'pending'` | `pending` / `approved` / `rejected` / `checked_out` / `returned` / `cancelled` |
| `notes`           | text         | Member's reason for borrowing                          |
| `approved_by`     | uuid REFERENCES `profiles(id)` | Set when approved/rejected            |
| `approved_at`     | timestamptz  |                                                        |
| `rejection_reason`| text         | Optional reason text shown to the member               |
| `checked_out_at`  | timestamptz  | Set when status moves to `checked_out`                 |
| `returned_at`     | timestamptz  | Set when status moves to `returned`                    |
| `return_condition`| enum         | `good` / `needs_repair` / `out_of_service`. Optional. If set on return, the parent item's condition is updated to match. |
| `return_notes`    | text         | Optional notes captured at return                      |
| `created_at`      | timestamptz NOT NULL DEFAULT now() |                                  |

### Indexes

- `inventory_items (category_id)`
- `inventory_items (is_public, condition) WHERE condition <> 'out_of_service'` — speeds up the common member catalogue query
- `inventory_reservations (item_id, status)`
- `inventory_reservations (profile_id, status)`
- `inventory_reservations (start_date, end_date)` — used by overlap detection

### Enums

```sql
CREATE TYPE inventory_condition  AS ENUM ('good','needs_repair','out_of_service');
CREATE TYPE reservation_status   AS ENUM ('pending','approved','rejected','checked_out','returned','cancelled');
```

---

## Reservation State Machine

```
              pending ───────────► rejected (terminal)
                 │
                 ▼
              approved ──┬──► cancelled (terminal)
                 │       │
                 ▼       
            checked_out ────► returned (terminal)
```

### Transitions

| From         | To           | Allowed by              | Conditions                                              |
|--------------|--------------|-------------------------|---------------------------------------------------------|
| (insert)     | `pending`    | Member (self only)       | `item.approval_required = true`                         |
| (insert)     | `approved`   | Member (self) — when `item.approval_required = false`. Staff (logistics/admin) — always, regardless of `approval_required` (`approved_by = created_by`, `approved_at = now()`) | Availability OK in both cases |
| `pending`    | `approved`   | Logistics / Admin        |                                                         |
| `pending`    | `rejected`   | Logistics / Admin        | `rejection_reason` optional                             |
| `pending`    | `cancelled`  | Member (own) or staff    |                                                         |
| `approved`   | `checked_out`| Logistics / Admin (member can self-checkout if `today >= start_date`) | Cannot check out before `start_date` unless staff override |
| `approved`   | `cancelled`  | Member (own) or staff    |                                                         |
| `checked_out`| `returned`   | Member (own) or staff    | `return_condition` and `return_notes` may be set        |

### Insert preconditions

- Item exists, member can see it (public OR staff caller).
- `item.condition <> 'out_of_service'`.
- `quantity >= 1`. For individual items, must equal 1 (CHECK at the DB level).
- Computed availability for `[start_date, end_date]` ≥ `quantity`.
- For members, `profile_id = auth.uid()`. Staff can set any `profile_id`.

### Overdue handling (v1)

Visual flag only — if `today > end_date AND status = 'checked_out'`, the staff reservations list shows a red **Overdue** badge. No emails or push notifications in v1.

---

## Availability Calculation

A pure function in `src/lib/inventory.ts`:

```ts
type ActiveReservation = {
  status: 'approved' | 'checked_out';
  start_date: string;
  end_date: string;
  quantity: number;
};

type Item = {
  tracked_individually: boolean;
  total_quantity: number;
  condition: 'good' | 'needs_repair' | 'out_of_service';
};

export function calculateAvailability(
  item: Item,
  reservations: ActiveReservation[],
  range: { start_date: string; end_date: string },
): number {
  if (item.condition === 'out_of_service') return 0;

  const overlapping = reservations.filter(r =>
    r.start_date <= range.end_date && range.start_date <= r.end_date
  );

  if (item.tracked_individually) {
    return overlapping.length === 0 ? 1 : 0;
  }
  const reserved = overlapping.reduce((sum, r) => sum + r.quantity, 0);
  return Math.max(0, item.total_quantity - reserved);
}
```

The function never reads from the DB; the page/action layer fetches the relevant active reservations and passes them in. This keeps the logic unit-testable and avoids hidden coupling to query patterns.

**Overlap rule:** Two date ranges overlap when `a.start <= b.end AND b.start <= a.end`. Inclusive endpoints — same-day pickup-and-return counts as overlapping (an item returned on the morning of day X cannot also be reserved by someone else for day X without a manual override).

**Inputs to the function:**
- `reservations` — ONLY rows with status ∈ `{approved, checked_out}`. The page must filter, not the function.

---

## Pages & Routes

### Member-facing (visible to all authenticated users)

- **`/inventory`** — Catalogue. Category chips at the top (only `is_public` categories visible). Items grid filtered by selected category. Each card shows name, photo (if any), condition badge, current availability indicator. Items in `out_of_service` are dimmed and not clickable. Hidden items (`is_public = false` on the item or its category) simply do not appear.
- **`/inventory/[id]`** — Item detail. Full description, condition, location, small calendar showing booked dates within the next 60 days. Reserve form: date range + quantity (only if bulk) + reason. If `approval_required = false`, success goes straight to "Approved"; if true, "Pending approval".
- **`/inventory/reservations`** — *My reservations* for the signed-in member. Three sections: Pending / Active / Past. Cancel button on `pending` and `approved` (before checkout). Mark-returned button when `checked_out` and the member has the item.

### Logistics + Admin

- **`/admin/inventory`** — Hub page. Cards for Categories, Items, Pending Approvals (with badge count), All Reservations, plus a "Today" summary (overdue items, due-back-today).
- **`/admin/inventory/categories`** — List with `+ New category` button. Inline edit name, colour, icon, public toggle, order. Delete is blocked if the category has any items.
- **`/admin/inventory/items`** — Full item list with search and category filter. Toggle to show only `out_of_service` or `private`. `+ New item` form covers all schema fields.
- **`/admin/inventory/items/[id]`** — Item detail with edit form, condition update, condition notes, full reservation history for the item.
- **`/admin/inventory/reservations`** — Pending approvals at top with quick Approve / Reject. Below: upcoming approved reservations, active checkouts, overdue items, recent returns. Filter by status, date range, and member.

### Navigation

- New `Inventory` tab added to the bottom nav (mobile) and sidebar (desktop) — visible to **everyone**, but the rendered catalogue still respects per-category and per-item visibility.
- Admin hub gets a new card linking to `/admin/inventory`.

### Dashboard integration

- If the signed-in user has any `pending`/`approved`/`checked_out` reservations, a small "My inventory" section appears on `/dashboard` listing them.
- If the user is logistics or admin and there are pending approvals or overdue items, a counter card appears with a link to the relevant filter on `/admin/inventory/reservations`.

---

## Permissions

| Action                                    | Member | Logistics | Admin |
|-------------------------------------------|:------:|:---------:|:-----:|
| View items in **public** categories       |   ✓    |     ✓     |   ✓   |
| View items in **private** categories      |   ✗    |     ✓     |   ✓   |
| Reserve a visible item for self           |   ✓    |     ✓     |   ✓   |
| Reserve any item on behalf of another     |   ✗    |     ✓     |   ✓   |
| View own reservations                     |   ✓    |     ✓     |   ✓   |
| View all reservations                     |   ✗    |     ✓     |   ✓   |
| Cancel own pending/approved reservation   |   ✓    |     ✓     |   ✓   |
| Approve / reject pending                  |   ✗    |     ✓     |   ✓   |
| Mark checked-out                          | ✓ (own, on/after start_date) | ✓ | ✓ |
| Mark returned                             | ✓ (own) | ✓ | ✓ |
| Update item condition                     |   ✗    |     ✓     |   ✓   |
| Create / edit / delete categories         |   ✗    |     ✓     |   ✓   |
| Create / edit / delete items              |   ✗    |     ✓     |   ✓   |

### DB helper

```sql
CREATE OR REPLACE FUNCTION is_logistics_or_admin() RETURNS bool
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin','logistics')
  );
$$;
```

### Key RLS policies

```sql
-- Categories
CREATE POLICY "cat_member_read" ON inventory_categories
  FOR SELECT USING (is_public OR is_logistics_or_admin());
CREATE POLICY "cat_staff_all"   ON inventory_categories
  FOR ALL USING (is_logistics_or_admin());

-- Items: visible if (item public AND category public) OR staff
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

-- Reservations
CREATE POLICY "res_self_read"   ON inventory_reservations
  FOR SELECT USING (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_self_insert" ON inventory_reservations
  FOR INSERT WITH CHECK (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_self_update" ON inventory_reservations
  FOR UPDATE USING (profile_id = auth.uid() OR is_logistics_or_admin());
CREATE POLICY "res_staff_delete" ON inventory_reservations
  FOR DELETE USING (is_logistics_or_admin());
```

### Defence in depth

Every server action begins with `requireUser()` or `requireRole(['logistics','admin'])` regardless of RLS. The action layer makes the intent explicit and produces clean error messages; RLS protects the database in the unlikely event an action is bypassed.

A direct hit on `/inventory/[id]` for a private item from a member returns a 404 — RLS makes the row literally not exist for that session, so no information is leaked about the existence of hidden items.

---

## File Structure

**Created:**
- `supabase/migrations/0006_inventory.sql`
- `src/lib/inventory.ts` — pure availability + state-transition helpers (unit-testable)
- `src/app/(app)/inventory/page.tsx` — member catalogue
- `src/app/(app)/inventory/[id]/page.tsx` — item detail + reserve
- `src/app/(app)/inventory/[id]/ReserveForm.tsx` — client component
- `src/app/(app)/inventory/[id]/actions.ts` — `createReservationAction`
- `src/app/(app)/inventory/reservations/page.tsx` — member's own reservations
- `src/app/(app)/inventory/reservations/actions.ts` — `cancelOwnAction`, `markReturnedSelfAction`
- `src/app/(app)/admin/inventory/page.tsx` — staff hub
- `src/app/(app)/admin/inventory/categories/page.tsx`
- `src/app/(app)/admin/inventory/categories/actions.ts`
- `src/app/(app)/admin/inventory/items/page.tsx`
- `src/app/(app)/admin/inventory/items/new/page.tsx`
- `src/app/(app)/admin/inventory/items/new/actions.ts`
- `src/app/(app)/admin/inventory/items/[id]/page.tsx`
- `src/app/(app)/admin/inventory/items/[id]/actions.ts`
- `src/app/(app)/admin/inventory/reservations/page.tsx`
- `src/app/(app)/admin/inventory/reservations/actions.ts` — approve/reject/checkout/return
- `tests/unit/inventory.test.ts`
- `tests/e2e/inventory.spec.ts`
- `loading.tsx` files at every route segment per house style

**Modified:**
- `src/types/database.ts` — regenerate after migration
- `src/components/layout/Sidebar.tsx` — add Inventory link
- `src/components/layout/BottomTabs.tsx` — add Inventory tab
- `src/app/(app)/admin/page.tsx` — add inventory hub card
- `src/app/(app)/dashboard/page.tsx` — add member reservations strip + staff alerts strip
- `src/lib/auth.ts` — add `requireLogisticsOrAdmin()` helper

---

## Testing Strategy

### Unit tests — `tests/unit/inventory.test.ts`

- `calculateAvailability` — bulk arithmetic across overlapping reservations
- `calculateAvailability` — individual returns 0 with any overlap, else 1
- `calculateAvailability` — `out_of_service` returns 0 regardless of reservations
- `calculateAvailability` — boundary cases: same-day, exact-edge, fully nested
- `detectOverlap` — every boundary combination
- `canTransition(from, to, role)` — rejects illegal moves; respects role; checks self-transition cases

### E2E tests — `tests/e2e/inventory.spec.ts`

1. Member sees only public categories on `/inventory`; private ones don't render.
2. Member directly hitting `/inventory/[private-item-id]` gets a 404.
3. Auto-confirm item reservation: member submits → status immediately `approved`.
4. Approval-required item: member submits → `pending` → logistics approves → `approved`.
5. Logistics rejects with reason → member sees status `rejected` and the reason on `/inventory/reservations`.
6. Two members cannot double-book an individually-tracked item over overlapping dates.
7. Bulk item: two members reserve quantities; cumulative cannot exceed `total_quantity`.
8. Logistics marks checked-out → marks returned with `return_condition = needs_repair`; item parent condition updates.
9. Out-of-service item: reserve form is disabled; direct submission rejects.
10. Member cancels own pending reservation; logistics cannot un-cancel.

---

## Out of Scope (v1)

- **Service assignment** — linking items to specific church services. Specced in Plan 04 follow-up.
- **Notifications & reminders** — email/SMS for pending approvals, overdue items, due-back-today. v1 uses dashboard counters and visual flags only.
- **Photo upload UI** — schema reserves `photo_url`; manual URL paste works in v1. Storage integration deferred.
- **Maintenance scheduling** — recurring service intervals (e.g. "PAT test every 12 months"). `condition_notes` covers the immediate need.
- **Audit log** — full who-changed-what history. Critical fields (status transitions) get timestamps inline; broader auditing comes later if needed.
- **CSV import / bulk operations** — manual entry only. Approve/reject one reservation at a time.
- **Member-facing search and filter** — only category browse + a basic item list. Search is staff-only.
- **Reservation calendar view** — staff sees a list, not a Gantt chart. Calendar visualisation can come later if reservations get heavy.
- **Item check-in QR codes / barcode scanning** — manual click-through only.
