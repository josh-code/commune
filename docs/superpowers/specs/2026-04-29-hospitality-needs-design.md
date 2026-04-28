# Hospitality Needs List — Design Spec

**Goal:** Give the Hospitality team a master catalog of items they buy, a per-service needs list with quantities, a "Request to order" workflow that batches notifications to admin and the hospitality team leader, and a generic in-app notifications inbox built to be reused for future plans.

**Date:** 2026-04-29

---

## 1. Data Model

### `hospitality_categories`

Reusable categories for grouping items (e.g. "Drinks", "Disposables", "Snacks").

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | UNIQUE, NOT NULL |
| created_by | uuid → profiles | |
| created_at | timestamptz | default now() |

### `hospitality_items`

Master catalog. Editable by any Hospitality team member or admin.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | NOT NULL |
| category_id | uuid → hospitality_categories ON DELETE RESTRICT | |
| created_by | uuid → profiles | |
| created_at | timestamptz | default now() |
| | | UNIQUE (category_id, name) |

### `hospitality_needs`

Per-service entries. One row per item per service, with quantity, notes, and lifecycle status.

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| service_id | uuid → services ON DELETE CASCADE | |
| item_id | uuid → hospitality_items ON DELETE RESTRICT | |
| quantity | text | NOT NULL — freeform, e.g. "2 litres", "100" |
| notes | text | nullable |
| status | enum `hospitality_need_status` | `needed` (default), `requested`, `fulfilled` |
| requested_at | timestamptz | nullable — set when batch request fires |
| fulfilled_by | uuid → profiles | nullable |
| fulfilled_at | timestamptz | nullable |
| created_by | uuid → profiles | |
| created_at | timestamptz | default now() |

### `notifications`

Generic in-app inbox table. Built once for this plan, reused for future plans (worship setlist published, projection brief reminder, etc.).

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| recipient_id | uuid → profiles ON DELETE CASCADE | |
| type | text | NOT NULL — namespaced string e.g. `hospitality_order_requested` |
| payload | jsonb | NOT NULL — type-specific data |
| read_at | timestamptz | nullable — null = unread |
| created_at | timestamptz | default now() |

Indexed on `(recipient_id, read_at, created_at DESC)` for fast unread fetches.

---

## 2. Routes & Pages

All under `/hospitality/`. Notifications surface lives at `/notifications`.

| Path | Purpose | Access |
|------|---------|--------|
| `/hospitality` | Index — services with active needs lists, jump-in points | Hospitality + Admin |
| `/hospitality/items` | Master catalog — categories and items, add/edit/delete | Hospitality + Admin |
| `/hospitality/services/[service_id]` | Per-service needs list — add items, request to order, mark fulfilled | Hospitality + Admin |
| `/notifications` | Generic notifications inbox for current user | Any authenticated user |

**Index page (`/hospitality`):** Shows upcoming services (services where `date >= today`, ordered ascending). For each service, shows item count broken down by status (e.g. "3 needed · 2 requested · 5 fulfilled"). Clicking a row opens the per-service needs list. A small "All services" toggle expands to past services too.

**Catalog page (`/hospitality/items`):** Two sections — categories at top (inline add, rename, delete; delete blocked if any item references the category), items below grouped by category. Each item has inline edit and delete (delete blocked if any `hospitality_needs` row references it via `ON DELETE RESTRICT`).

**Per-service page (`/hospitality/services/[service_id]`):** Header shows service name + date. Three groupings: "Needed", "Requested", "Fulfilled". Each entry shows item name, quantity, notes, fulfilled-by user (when applicable). An "Add item" picker pulls from the catalog (typeahead by name with category). A "Request to order" button is enabled when ≥ 1 item is in `needed`; clicking it batch-flips them to `requested` and fires notifications. Each item has a checkbox/button to mark fulfilled.

**Notifications page (`/notifications`):** Reverse-chronological list of notifications for the current user. Unread shown bolder. Clicking a notification marks it read and navigates to the relevant page based on `type` (hospitality notifications go to `/hospitality/services/[service_id]`). "Mark all read" button.

---

## 3. Permissions

| Action | Who |
|--------|-----|
| View / edit master catalog | Hospitality team member + Admin |
| View / add / edit needs entries | Hospitality team member + Admin |
| Click "Request to order" | Hospitality team member + Admin |
| Mark needs entry fulfilled | Hospitality team member + Admin |
| View own notifications | Recipient only |

A new DB function `is_hospitality_or_admin()` mirrors `is_logistics_or_admin()`:

```sql
SELECT EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
)
OR EXISTS (
  SELECT 1 FROM team_member_positions tmp
  JOIN teams t ON t.id = tmp.team_id
  WHERE tmp.profile_id = auth.uid() AND t.name = 'Hospitality'
);
```

A new auth helper `requireHospitalityOrAdmin()` in `src/lib/auth.ts` mirrors `requireLogisticsOrAdmin()` (admin shortcut + RPC fallback).

**Hospitality leader detection** (for notification recipient list) — any profile with `team_role = 'leader'` in `team_member_positions` for the Hospitality team.

A `Hospitality` team is seeded with color `#06b6d4` (cyan) in the migration if it doesn't already exist.

---

## 4. Notification Workflow

When the user clicks "Request to order" on a service's needs list, the server action:

1. Verifies the caller is hospitality or admin.
2. Selects all `hospitality_needs` rows for `service_id` with `status = 'needed'`. If empty, returns silently.
3. In a single transaction:
   - Updates those rows to `status = 'requested'`, `requested_at = now()`.
   - Looks up recipients: all admins, plus all profiles with `team_role = 'leader'` in the Hospitality team. Deduplicated.
   - Inserts one row per recipient into `notifications`:
     ```json
     {
       "recipient_id": "...",
       "type": "hospitality_order_requested",
       "payload": {
         "service_id": "...",
         "service_name": "...",
         "service_date": "2026-05-04",
         "item_count": 7,
         "requested_by": "..."
       }
     }
     ```
4. Calls `revalidatePath` on the service page.

**Repeat requests:** Items added after a request stay in `needed`. Clicking "Request to order" again creates a fresh batch + new notifications. The original request remains in `requested` status.

**Notification badge:** A small client component in the sidebar/topbar polls (or fetches once on mount + revalidates on navigation) the user's unread notification count from `notifications` where `recipient_id = auth.uid()` and `read_at IS NULL`. The badge renders next to the user's avatar.

**Mark-as-read:** Server action sets `read_at = now()` for one notification (on click) or all unread (via "Mark all read"). RLS limits this to the recipient.

---

## 5. State Machine

```
needed ──(Request to order)──> requested ──(Mark fulfilled)──> fulfilled
   │                                                              ▲
   └──(Mark fulfilled directly, e.g. already had it)──────────────┘
```

Transitions enforced in server actions (and validated by a pure helper `canTransition(from, to)` in `src/lib/hospitality.ts`):

| From | To | Allowed |
|------|----|---------|
| needed | requested | yes (only via batch action) |
| needed | fulfilled | yes (direct) |
| requested | fulfilled | yes |
| fulfilled | * | no — terminal |
| any | needed | no — would unsend a request |

Deletion is allowed in any status (mistakes can happen). Deletion does not re-send any notification.

---

## 6. RLS Policies

```sql
-- hospitality_categories
ALTER TABLE hospitality_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_cat_member_read" ON hospitality_categories
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_cat_member_all" ON hospitality_categories
  FOR ALL USING (is_hospitality_or_admin());

-- hospitality_items
ALTER TABLE hospitality_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_item_member_read" ON hospitality_items
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_item_member_all" ON hospitality_items
  FOR ALL USING (is_hospitality_or_admin());

-- hospitality_needs
ALTER TABLE hospitality_needs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosp_needs_member_read" ON hospitality_needs
  FOR SELECT USING (is_hospitality_or_admin());
CREATE POLICY "hosp_needs_member_all" ON hospitality_needs
  FOR ALL USING (is_hospitality_or_admin());

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_self_read" ON notifications
  FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notif_self_update" ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());
-- Inserts go through SECURITY DEFINER server actions / RPC; no direct INSERT policy.
```

---

## 7. Files Created / Modified

**Created:**
- `supabase/migrations/0008_hospitality.sql` — tables, enum, RLS, helper function, Hospitality team seed
- `src/lib/hospitality.ts` — pure helpers (`canTransition`, status display strings)
- `tests/unit/hospitality.test.ts` — unit tests for `canTransition`
- `src/app/(app)/hospitality/page.tsx` — index
- `src/app/(app)/hospitality/items/page.tsx` — catalog server shell
- `src/app/(app)/hospitality/items/CatalogEditor.tsx` — client (categories + items)
- `src/app/(app)/hospitality/items/actions.ts` — catalog server actions
- `src/app/(app)/hospitality/services/[service_id]/page.tsx` — needs list server shell
- `src/app/(app)/hospitality/services/[service_id]/NeedsListEditor.tsx` — client
- `src/app/(app)/hospitality/services/[service_id]/actions.ts` — needs list + request server actions
- `src/app/(app)/notifications/page.tsx` — inbox
- `src/app/(app)/notifications/actions.ts` — mark-as-read actions
- `src/components/notifications/NotificationBadge.tsx` — sidebar badge

**Modified:**
- `src/lib/auth.ts` — `requireHospitalityOrAdmin()`
- `src/components/layout/Sidebar.tsx` — Hospitality nav + notification badge wired in
- `src/components/layout/BottomTabs.tsx` — Hospitality tab
- `src/types/database.ts` — add 4 new table types + new enum

---

## 8. Out of Scope

- Email / WhatsApp delivery of notifications (`notifications` table is built to support it later)
- Recurring needs (e.g. "milk every Sunday") — manually re-add per service
- Cross-link to `inventory_items` for shared catalog
- Photo uploads on hospitality items
- Cost / price tracking on items
- Member-side visibility (members can't see hospitality lists)
- Bulk import of categories or items
