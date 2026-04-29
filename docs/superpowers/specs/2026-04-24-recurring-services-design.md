# Plan 04 — Recurring Services & Date Range Unavailability

## Overview

Two features that extend the rostering module:

1. **Recurring Services** — admins define a service template with a recurrence rule (weekly, monthly, etc.) and the system auto-generates future service instances, removing the need to hand-create every Sunday individually.
2. **Date Range Unavailability** — members mark a start/end date range (e.g. "away 15–22 Apr") and all services falling within that window are automatically treated as unavailable, without needing to tick each service individually.
3. **Spreadsheet Roster View** *(deferred)* — a grid showing multiple services side-by-side for bulk assignment, documented here but built later.

---

## 1. Recurring Services

### Data Model

```
service_templates
  id             uuid PK
  name           text          e.g. "Sunday Service"
  type           text          regular_sunday | special_event
  frequency      text          daily | weekly | monthly | yearly
  day_of_week    int?          0–6 (0=Sun) — used for weekly
  day_of_month   int?          1–31 — used for monthly and yearly
  month_of_year  int?          1–12 — used for yearly
  created_by     uuid FK → profiles
  created_at     timestamptz

services (add column)
  template_id    uuid? FK → service_templates ON DELETE SET NULL
```

### Generation Logic

A pure helper `generateDates(config, fromDate, count)` computes the next N occurrence dates after a given date. On template creation the admin picks how many weeks ahead to generate (default 8). An admin can tap "Generate more" on the template list at any time to extend further.

### UX — Admin

- `/roster` gains a **Templates** section above the services list, showing each template with a description ("Every Sunday"), count of upcoming draft services, and a "Generate 8 more" button.
- `/roster/templates/new` — a form: name, type, frequency (select), conditional day fields, generate-ahead count. On submit creates the template row and inserts services.
- `/roster/new` remains for one-off services (unchanged).

### Name Generation

Generated services are auto-named by date: `"Sunday 27 Apr 2025"` for a weekly Sunday template. The admin can rename any individual service from the roster builder.

---

## 2. Date Range Unavailability

### Data Model

```
unavailability_ranges
  id           uuid PK
  profile_id   uuid FK → profiles ON DELETE CASCADE
  start_date   date NOT NULL
  end_date     date NOT NULL   (end_date >= start_date enforced by CHECK)
  reason       text?           optional note ("Holiday", "Conference")
  created_at   timestamptz
```

### Logic

When the roster builder fetches eligible members for a service on `date`, it also fetches `unavailability_ranges` and marks any member whose range includes `date` as unavailable — in addition to the existing per-service `service_unavailability` check.

### UX — Member (Schedule page)

New **"Dates I'm away"** card below the existing "Services I can't make" card:
- Date range form: start + end date pickers + optional reason text + "Mark unavailable" button.
- List of existing ranges with a "Remove" button per row.
- Ranges are shown sorted by start_date ascending; past ranges are hidden.

The per-service "Services I can't make" checklist remains — members can still tick individual services independently of ranges.

---

## 3. Spreadsheet Roster View *(Deferred)*

### Intent

A grid view at `/roster/spreadsheet` (or a tab on `/roster`) where an admin can fill in rosters for multiple upcoming services of the same template side-by-side without navigating between pages.

### Grid Layout

```
                  | 27 Apr  | 4 May   | 11 May  | 18 May  |
──────────────────┼─────────┼─────────┼─────────┼─────────┤
Worship           │         │         │         │         │
  Lead Vocals     │ [Jane]  │ [     ] │ [John]  │ [     ] │
  Acoustic Guitar │ [     ] │ [Sam]   │ [     ] │ [Sam]   │
  ...             │         │         │         │         │
Sound             │         │         │         │         │
  Front of House  │ [Mark]  │ [Mark]  │ [     ] │ [     ] │
  ...             │         │         │         │         │
```

- Columns = upcoming draft services for the selected template
- Rows = positions (grouped by team)
- Cells = a member select dropdown (shows eligible members, marks unavailable ones)
- "Publish All" button publishes every column at once
- "Save Draft" saves all unsaved changes across all columns

### Prerequisites

Requires recurring services to exist — columns come naturally from the template cadence. Build this after Plan 04 is stable.

---

## RLS Summary (new tables)

| Table | Member SELECT | Member INSERT | Member DELETE | Admin |
|---|---|---|---|---|
| service_templates | authenticated | — | — | ALL |
| unavailability_ranges | own | own | own | ALL |
