# Recurring Services & Date Range Unavailability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recurring service templates (weekly/monthly/etc.) so admins don't hand-create every service, and date range unavailability so members can mark "I'm away 15–22 Apr" instead of ticking each service individually.

**Architecture:** A new `service_templates` table drives date generation via pure helpers in `src/lib/recurring.ts`. A new `unavailability_ranges` table extends the existing per-service unavailability — both the schedule page and roster builder check ranges. The spreadsheet view is specced in this plan as Task 11 but not implemented; it depends on recurring services being stable.

**Tech Stack:** Next.js 16.2.4 App Router (`params`/`searchParams` are `Promise<{}>` — must `await`), Supabase JS v2 + SSR (`createClient()` async), Tailwind v4, Vitest (unit), Playwright (E2E).

---

## File Map

**Created:**
- `supabase/migrations/0005_recurring_unavailability.sql`
- `src/lib/recurring.ts` — pure date helpers (unit-testable)
- `src/app/(app)/roster/templates/page.tsx`
- `src/app/(app)/roster/templates/new/page.tsx`
- `src/app/(app)/roster/templates/new/actions.ts`
- `tests/unit/recurring.test.ts`
- `tests/e2e/recurring.spec.ts`

**Modified:**
- `src/types/database.ts` — add `service_templates`, `unavailability_ranges`, `template_id` on services
- `src/app/(app)/roster/page.tsx` — add Templates section + "Generate more" action
- `src/app/(app)/roster/[id]/page.tsx` — also fetch `unavailability_ranges` for the service date
- `src/app/(app)/roster/[id]/RosterBuilder.tsx` — mark members unavailable via ranges
- `src/app/(app)/schedule/page.tsx` — add "Dates I'm away" card
- `src/app/(app)/schedule/actions.ts` — add `addRangeAction`, `removeRangeAction`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0005_recurring_unavailability.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_recurring_unavailability.sql
-- Plan 04: Recurring Services & Date Range Unavailability

-- ── service_templates ────────────────────────────────────────────────────────

CREATE TABLE service_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  type          text        NOT NULL DEFAULT 'regular_sunday'
                              CHECK (type IN ('regular_sunday', 'special_event')),
  frequency     text        NOT NULL
                              CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  day_of_week   int         CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month  int         CHECK (day_of_month BETWEEN 1 AND 31),
  month_of_year int         CHECK (month_of_year BETWEEN 1 AND 12),
  created_by    uuid        NOT NULL REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── unavailability_ranges ────────────────────────────────────────────────────

CREATE TABLE unavailability_ranges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_range CHECK (end_date >= start_date)
);

-- ── Add template_id to services ──────────────────────────────────────────────

ALTER TABLE services
  ADD COLUMN template_id uuid REFERENCES service_templates(id) ON DELETE SET NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE service_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_auth_read" ON service_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "st_admin_all" ON service_templates FOR ALL USING (is_admin());

ALTER TABLE unavailability_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ur_select"        ON unavailability_ranges FOR SELECT USING (profile_id = auth.uid() OR is_admin());
CREATE POLICY "ur_member_insert" ON unavailability_ranges FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "ur_member_delete" ON unavailability_ranges FOR DELETE USING (profile_id = auth.uid());

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX ON unavailability_ranges (profile_id);
CREATE INDEX ON unavailability_ranges (start_date, end_date);
CREATE INDEX ON services (template_id) WHERE template_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

```bash
cd "/Users/joshuaferndes/Code/Work Projects/Commune" && npx supabase db reset
```

Expected: `Finished supabase db reset.` with no errors.

- [ ] **Step 3: Verify**

```bash
npx supabase db execute --local "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

Expected output includes: `service_templates`, `unavailability_ranges`. Also verify services table has `template_id`:

```bash
npx supabase db execute --local "SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'template_id';"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_recurring_unavailability.sql
git commit -m "feat: recurring services + date range unavailability schema"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Regenerate**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

- [ ] **Step 2: Verify new tables present and no compile errors**

```bash
grep -c "service_templates\|unavailability_ranges" src/types/database.ts
npx tsc --noEmit
```

Expected: count ≥ 2, zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: regenerate types for recurring services schema"
```

---

### Task 3: Recurring Date Helpers

**Files:**
- Create: `src/lib/recurring.ts`

- [ ] **Step 1: Write the helper library**

```ts
// src/lib/recurring.ts

export type TemplateConfig = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  day_of_week: number | null;   // 0=Sun..6=Sat — for weekly
  day_of_month: number | null;  // 1–31 — for monthly and yearly
  month_of_year: number | null; // 1–12 — for yearly
};

/**
 * Returns the next occurrence strictly after `afterDate`.
 * Operates on local calendar dates (no timezone conversion).
 */
export function nextOccurrence(config: TemplateConfig, afterDate: Date): Date {
  const d = new Date(afterDate);
  d.setDate(d.getDate() + 1); // start searching the day after

  switch (config.frequency) {
    case "daily":
      return d;

    case "weekly": {
      const target = config.day_of_week ?? 0;
      while (d.getDay() !== target) d.setDate(d.getDate() + 1);
      return d;
    }

    case "monthly": {
      const target = config.day_of_month ?? 1;
      if (d.getDate() > target) {
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
      }
      d.setDate(target);
      return d;
    }

    case "yearly": {
      const targetMonth = (config.month_of_year ?? 1) - 1; // 0-indexed
      const targetDay = config.day_of_month ?? 1;
      if (
        d.getMonth() > targetMonth ||
        (d.getMonth() === targetMonth && d.getDate() > targetDay)
      ) {
        d.setFullYear(d.getFullYear() + 1);
      }
      d.setMonth(targetMonth);
      d.setDate(targetDay);
      return d;
    }
  }
}

/** Returns `count` dates strictly after `fromDate`. */
export function generateDates(config: TemplateConfig, fromDate: Date, count: number): Date[] {
  const dates: Date[] = [];
  let current = new Date(fromDate);
  for (let i = 0; i < count; i++) {
    current = nextOccurrence(config, current);
    dates.push(new Date(current));
  }
  return dates;
}

/** Converts a Date to a `YYYY-MM-DD` string using local time. */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns true if `dateStr` (YYYY-MM-DD) falls within any of the given ranges. */
export function isDateInRanges(
  dateStr: string,
  ranges: { start_date: string; end_date: string }[],
): boolean {
  return ranges.some(r => dateStr >= r.start_date && dateStr <= r.end_date);
}

/**
 * Generates a human-readable service name from a template name and date.
 * e.g. "Sunday Service" + 2025-04-27 → "Sunday Service — 27 Apr 2025"
 */
export function generateServiceName(templateName: string, date: Date): string {
  const formatted = date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${templateName} — ${formatted}`;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/recurring.ts
git commit -m "feat: recurring date helpers — nextOccurrence, generateDates, isDateInRanges"
```

---

### Task 4: Unit Tests for Recurring Helpers

**Files:**
- Create: `tests/unit/recurring.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/unit/recurring.test.ts
import { describe, it, expect } from "vitest";
import {
  nextOccurrence,
  generateDates,
  toDateString,
  isDateInRanges,
  generateServiceName,
  type TemplateConfig,
} from "@/lib/recurring";

// Helper: parse a YYYY-MM-DD string as a local-time Date
function d(dateStr: string): Date {
  const [y, m, day] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, day);
}

describe("nextOccurrence — daily", () => {
  const cfg: TemplateConfig = { frequency: "daily", day_of_week: null, day_of_month: null, month_of_year: null };

  it("returns the next day", () => {
    expect(toDateString(nextOccurrence(cfg, d("2025-04-10")))).toBe("2025-04-11");
  });

  it("crosses a month boundary", () => {
    expect(toDateString(nextOccurrence(cfg, d("2025-04-30")))).toBe("2025-05-01");
  });
});

describe("nextOccurrence — weekly", () => {
  const cfg: TemplateConfig = { frequency: "weekly", day_of_week: 0, day_of_month: null, month_of_year: null }; // 0 = Sunday

  it("returns next Sunday when after is a Monday", () => {
    // 2025-04-14 is a Monday
    expect(toDateString(nextOccurrence(cfg, d("2025-04-14")))).toBe("2025-04-20");
  });

  it("returns the following Sunday when after is itself a Sunday", () => {
    // 2025-04-13 is a Sunday
    expect(toDateString(nextOccurrence(cfg, d("2025-04-13")))).toBe("2025-04-20");
  });

  it("returns next Wednesday (day_of_week=3)", () => {
    const wed: TemplateConfig = { ...cfg, day_of_week: 3 };
    // 2025-04-14 is Monday → next Wednesday is 2025-04-16
    expect(toDateString(nextOccurrence(wed, d("2025-04-14")))).toBe("2025-04-16");
  });
});

describe("nextOccurrence — monthly", () => {
  const cfg: TemplateConfig = { frequency: "monthly", day_of_week: null, day_of_month: 15, month_of_year: null };

  it("returns the 15th of the same month if not yet passed", () => {
    // afterDate is the 10th → next is the 15th of the same month
    expect(toDateString(nextOccurrence(cfg, d("2025-04-10")))).toBe("2025-04-15");
  });

  it("returns the 15th of the next month if already past", () => {
    // afterDate is the 20th → next is the 15th of next month
    expect(toDateString(nextOccurrence(cfg, d("2025-04-20")))).toBe("2025-05-15");
  });
});

describe("nextOccurrence — yearly", () => {
  const cfg: TemplateConfig = { frequency: "yearly", day_of_week: null, day_of_month: 25, month_of_year: 12 }; // Dec 25

  it("returns Dec 25 of the same year if not yet passed", () => {
    expect(toDateString(nextOccurrence(cfg, d("2025-04-01")))).toBe("2025-12-25");
  });

  it("returns Dec 25 of the next year if already past", () => {
    expect(toDateString(nextOccurrence(cfg, d("2025-12-26")))).toBe("2026-12-25");
  });
});

describe("generateDates", () => {
  const cfg: TemplateConfig = { frequency: "weekly", day_of_week: 0, day_of_month: null, month_of_year: null };

  it("generates the correct number of dates", () => {
    const dates = generateDates(cfg, d("2025-04-13"), 4);
    expect(dates).toHaveLength(4);
  });

  it("all generated dates are Sundays", () => {
    const dates = generateDates(cfg, d("2025-04-13"), 8);
    dates.forEach(date => expect(date.getDay()).toBe(0));
  });

  it("dates are strictly increasing", () => {
    const dates = generateDates(cfg, d("2025-04-13"), 4);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
    }
  });
});

describe("isDateInRanges", () => {
  const ranges = [
    { start_date: "2025-04-15", end_date: "2025-04-22" },
    { start_date: "2025-06-01", end_date: "2025-06-07" },
  ];

  it("returns true for a date inside a range", () => {
    expect(isDateInRanges("2025-04-18", ranges)).toBe(true);
  });

  it("returns true for a date on the start boundary", () => {
    expect(isDateInRanges("2025-04-15", ranges)).toBe(true);
  });

  it("returns true for a date on the end boundary", () => {
    expect(isDateInRanges("2025-04-22", ranges)).toBe(true);
  });

  it("returns false for a date before any range", () => {
    expect(isDateInRanges("2025-04-14", ranges)).toBe(false);
  });

  it("returns false for a date between ranges", () => {
    expect(isDateInRanges("2025-05-01", ranges)).toBe(false);
  });

  it("returns false for empty ranges array", () => {
    expect(isDateInRanges("2025-04-18", [])).toBe(false);
  });
});

describe("generateServiceName", () => {
  it("formats name with date", () => {
    const name = generateServiceName("Sunday Service", d("2025-04-27"));
    expect(name).toBe("Sunday Service — 27 Apr 2025");
  });
});
```

- [ ] **Step 2: Run the tests (expect all pass)**

```bash
pnpm test tests/unit/recurring.test.ts --run
```

Expected: all tests pass. If any fail, fix `src/lib/recurring.ts` before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/recurring.test.ts
git commit -m "test: unit tests for recurring date helpers"
```

---

### Task 5: Template Create Actions

**Files:**
- Create: `src/app/(app)/roster/templates/new/actions.ts`

- [ ] **Step 1: Write the action file**

```ts
// src/app/(app)/roster/templates/new/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateDates, toDateString, generateServiceName, type TemplateConfig } from "@/lib/recurring";

export async function createTemplateAction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireAdmin();

  const name        = (formData.get("name") as string)?.trim();
  const type        = (formData.get("type") as string) ?? "regular_sunday";
  const frequency   = formData.get("frequency") as string;
  const dayOfWeek   = formData.get("day_of_week")   ? Number(formData.get("day_of_week"))   : null;
  const dayOfMonth  = formData.get("day_of_month")  ? Number(formData.get("day_of_month"))  : null;
  const monthOfYear = formData.get("month_of_year") ? Number(formData.get("month_of_year")) : null;
  const count       = Number(formData.get("count") ?? "8");

  if (!name || !frequency) return { error: "Name and frequency are required." };
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
    return { error: "Invalid frequency." };
  }

  const supabase = await createClient();

  const { data: template, error: tmplError } = await supabase
    .from("service_templates")
    .insert({
      name,
      type: type as "regular_sunday" | "special_event",
      frequency: frequency as "daily" | "weekly" | "monthly" | "yearly",
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      month_of_year: monthOfYear,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (tmplError || !template) return { error: tmplError?.message ?? "Failed to create template." };

  const config: TemplateConfig = {
    frequency: frequency as TemplateConfig["frequency"],
    day_of_week: dayOfWeek,
    day_of_month: dayOfMonth,
    month_of_year: monthOfYear,
  };

  const dates = generateDates(config, new Date(), count);
  const rows = dates.map(date => ({
    name: generateServiceName(name, date),
    date: toDateString(date),
    type: type as "regular_sunday" | "special_event",
    status: "draft" as const,
    created_by: user.id,
    template_id: template.id,
  }));

  const { error: svcError } = await supabase.from("services").insert(rows);
  if (svcError) return { error: svcError.message };

  redirect("/roster/templates");
}

export async function generateMoreAction(templateId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("service_templates")
    .select("name, type, frequency, day_of_week, day_of_month, month_of_year")
    .eq("id", templateId)
    .single();

  if (!template) return { error: "Template not found." };

  // Find the latest existing service for this template
  const { data: latest } = await supabase
    .from("services")
    .select("date")
    .eq("template_id", templateId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fromDate = latest ? new Date(latest.date + "T00:00:00") : new Date();

  const config: TemplateConfig = {
    frequency: template.frequency as TemplateConfig["frequency"],
    day_of_week: template.day_of_week,
    day_of_month: template.day_of_month,
    month_of_year: template.month_of_year,
  };

  const user = await import("@/lib/auth").then(m => m.requireAdmin());
  const dates = generateDates(config, fromDate, 8);
  const rows = dates.map(date => ({
    name: generateServiceName(template.name, date),
    date: toDateString(date),
    type: template.type as "regular_sunday" | "special_event",
    status: "draft" as const,
    created_by: user.id,
    template_id: templateId,
  }));

  const { error } = await supabase.from("services").insert(rows);
  if (error) return { error: error.message };

  return {};
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/roster/templates/new/actions.ts"
git commit -m "feat: createTemplateAction and generateMoreAction server actions"
```

---

### Task 6: Template Create Page + Template List Page

**Files:**
- Create: `src/app/(app)/roster/templates/new/page.tsx`
- Create: `src/app/(app)/roster/templates/page.tsx`

- [ ] **Step 1: Write the create template page**

```tsx
// src/app/(app)/roster/templates/new/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { createTemplateAction } from "./actions";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function NewTemplatePage() {
  const [frequency, setFrequency] = useState("weekly");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await createTemplateAction(fd);
    if (result?.error) {
      setError(result.error);
      setIsPending(false);
    }
    // On success: server redirects to /roster/templates
  };

  return (
    <div className="max-w-md">
      <Link href="/roster/templates" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        ← Templates
      </Link>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">New recurring service</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="space-y-1">
            <label htmlFor="name" className="text-xs font-medium text-slate-600">Service name</label>
            <input id="name" name="name" required placeholder="e.g. Sunday Service"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>

          <div className="space-y-1">
            <label htmlFor="type" className="text-xs font-medium text-slate-600">Type</label>
            <select id="type" name="type"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="regular_sunday">Regular Sunday</option>
              <option value="special_event">Special Event</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="frequency" className="text-xs font-medium text-slate-600">Repeats</label>
            <select id="frequency" name="frequency" value={frequency}
              onChange={e => setFrequency(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          {frequency === "weekly" && (
            <div className="space-y-1">
              <label htmlFor="day_of_week" className="text-xs font-medium text-slate-600">Day of week</label>
              <select id="day_of_week" name="day_of_week" defaultValue="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
                {DAY_NAMES.map((day, i) => (
                  <option key={i} value={i}>{day}</option>
                ))}
              </select>
            </div>
          )}

          {(frequency === "monthly" || frequency === "yearly") && (
            <div className="space-y-1">
              <label htmlFor="day_of_month" className="text-xs font-medium text-slate-600">Day of month</label>
              <input id="day_of_month" name="day_of_month" type="number" min="1" max="31"
                defaultValue="1" required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          )}

          {frequency === "yearly" && (
            <div className="space-y-1">
              <label htmlFor="month_of_year" className="text-xs font-medium text-slate-600">Month</label>
              <select id="month_of_year" name="month_of_year" defaultValue="1"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
                {MONTH_NAMES.map((month, i) => (
                  <option key={i} value={i + 1}>{month}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="count" className="text-xs font-medium text-slate-600">Generate ahead (services)</label>
            <input id="count" name="count" type="number" min="1" max="52"
              defaultValue="8"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
            <p className="text-xs text-slate-400">How many upcoming services to create now.</p>
          </div>

          <button type="submit" disabled={isPending}
            className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? "Creating…" : "Create template"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the template list page**

```tsx
// src/app/(app)/roster/templates/page.tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateMoreAction } from "./new/actions";

const FREQUENCY_LABELS: Record<string, string> = {
  daily:   "Every day",
  weekly:  "Every week",
  monthly: "Every month",
  yearly:  "Every year",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function frequencyDescription(t: {
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
}): string {
  if (t.frequency === "weekly" && t.day_of_week !== null) {
    return `Every ${DAY_NAMES[t.day_of_week]}`;
  }
  if (t.frequency === "monthly" && t.day_of_month !== null) {
    return `Every month on the ${t.day_of_month}${ordinal(t.day_of_month)}`;
  }
  return FREQUENCY_LABELS[t.frequency] ?? t.frequency;
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export default async function TemplatesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("service_templates")
    .select("id, name, type, frequency, day_of_week, day_of_month, month_of_year")
    .order("name");

  // Count upcoming draft services per template
  const today = new Date().toISOString().split("T")[0];
  const { data: upcoming } = await supabase
    .from("services")
    .select("template_id")
    .neq("status", "completed")
    .gte("date", today)
    .not("template_id", "is", null);

  const upcomingByTemplate = new Map<string, number>();
  (upcoming ?? []).forEach(s => {
    if (s.template_id) {
      upcomingByTemplate.set(s.template_id, (upcomingByTemplate.get(s.template_id) ?? 0) + 1);
    }
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/roster" className="text-sm text-slate-500 hover:text-slate-900">← Roster</Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Service templates</h1>
        </div>
        <Link href="/roster/templates/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
          + New template
        </Link>
      </div>

      {(templates ?? []).length === 0 && (
        <p className="text-sm text-slate-400">
          No templates yet. <Link href="/roster/templates/new" className="text-indigo-600 hover:text-indigo-800">Create one →</Link>
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {(templates ?? []).map(t => {
          const count = upcomingByTemplate.get(t.id) ?? 0;
          return (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{frequencyDescription(t)}</div>
              </div>
              <span className="text-xs text-slate-400">{count} upcoming</span>
              <form action={async () => { "use server"; await generateMoreAction(t.id); }}>
                <button type="submit"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50">
                  Generate 8 more
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/roster/templates/"
git commit -m "feat: /roster/templates list and create pages for recurring services"
```

---

### Task 7: Update Roster List Page to Show Templates

**Files:**
- Modify: `src/app/(app)/roster/page.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat "src/app/(app)/roster/page.tsx"
```

- [ ] **Step 2: Add a Templates shortcut section**

Add this import at the top of `src/app/(app)/roster/page.tsx`:

```tsx
import { Repeat } from "lucide-react";
```

Then add this block **above** the existing upcoming services list (after the `<div className="flex items-center justify-between mb-6">` header):

```tsx
{/* Templates shortcut */}
<div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 mb-6 flex items-center gap-3">
  <Repeat className="w-4 h-4 text-indigo-500 flex-shrink-0" />
  <span className="text-sm text-indigo-800 flex-1">Manage recurring service templates</span>
  <Link href="/roster/templates" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
    View templates →
  </Link>
</div>
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/roster/page.tsx"
git commit -m "feat: add templates shortcut to roster list page"
```

---

### Task 8: Date Range Unavailability — Actions + Schedule UI

**Files:**
- Modify: `src/app/(app)/schedule/actions.ts`
- Modify: `src/app/(app)/schedule/page.tsx`

- [ ] **Step 1: Add range actions to `src/app/(app)/schedule/actions.ts`**

Read the file first. Append these two exports at the end:

```ts
export async function addRangeAction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser();
  const startDate = formData.get("start_date") as string;
  const endDate   = formData.get("end_date")   as string;
  const reason    = (formData.get("reason") as string)?.trim() || null;

  if (!startDate || !endDate) return { error: "Start and end dates are required." };
  if (endDate < startDate)    return { error: "End date must be on or after start date." };

  const supabase = await createClient();
  const { error } = await supabase.from("unavailability_ranges").insert({
    profile_id: user.id,
    start_date: startDate,
    end_date: endDate,
    reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return {};
}

export async function removeRangeAction(rangeId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: range } = await supabase
    .from("unavailability_ranges")
    .select("profile_id")
    .eq("id", rangeId)
    .maybeSingle();

  if (!range || range.profile_id !== user.id) return { error: "Not authorised." };

  const { error } = await supabase
    .from("unavailability_ranges")
    .delete()
    .eq("id", rangeId);

  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return {};
}
```

- [ ] **Step 2: Add "Dates I'm away" card to `src/app/(app)/schedule/page.tsx`**

Read the file first. Add this import at the top:

```tsx
import { addRangeAction, removeRangeAction } from "./actions";
```

Add these data fetches inside `SchedulePage` after the existing `unavailability` fetch:

```tsx
// My date ranges (upcoming only)
const { data: myRanges } = await supabase
  .from("unavailability_ranges")
  .select("id, start_date, end_date, reason")
  .eq("profile_id", user.id)
  .gte("end_date", today)
  .order("start_date");
```

Add this card at the end of the returned JSX, after the existing "Services I can't make" card:

```tsx
{/* Dates I'm away */}
<div className="bg-white rounded-xl border border-slate-200 p-5">
  <h2 className="text-sm font-semibold text-slate-700 mb-1">Dates I&#39;m away</h2>
  <p className="text-xs text-slate-400 mb-4">
    Add a date range and all services in that window will be marked unavailable automatically.
  </p>

  {/* Existing ranges */}
  {(myRanges ?? []).length > 0 && (
    <div className="space-y-2 mb-4">
      {(myRanges ?? []).map(r => (
        <div key={r.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0">
          <div className="flex-1">
            <span className="text-slate-800 font-medium">
              {new Date(r.start_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              {" — "}
              {new Date(r.end_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
            {r.reason && <span className="text-xs text-slate-400 ml-2">{r.reason}</span>}
          </div>
          <form action={async () => { "use server"; await removeRangeAction(r.id); }}>
            <button type="submit" className="text-xs text-red-400 hover:text-red-700">Remove</button>
          </form>
        </div>
      ))}
    </div>
  )}

  {/* Add range form */}
  <form action={addRangeAction} className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">From</label>
        <input type="date" name="start_date" required
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">To</label>
        <input type="date" name="end_date" required
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20" />
      </div>
    </div>
    <input type="text" name="reason" placeholder="Reason (optional)"
      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20" />
    <button type="submit"
      className="text-sm font-medium bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
      Mark unavailable
    </button>
  </form>
</div>
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/schedule/actions.ts" "src/app/(app)/schedule/page.tsx"
git commit -m "feat: date range unavailability — add/remove ranges on schedule page"
```

---

### Task 9: Roster Builder — Check Unavailability Ranges

**Files:**
- Modify: `src/app/(app)/roster/[id]/page.tsx`
- Modify: `src/app/(app)/roster/[id]/RosterBuilder.tsx`

- [ ] **Step 1: Read both files**

```bash
cat "src/app/(app)/roster/[id]/page.tsx"
cat "src/app/(app)/roster/[id]/RosterBuilder.tsx" | head -60
```

- [ ] **Step 2: Update `roster/[id]/page.tsx` to fetch ranges**

Add this import at the top of `src/app/(app)/roster/[id]/page.tsx`:

```tsx
import { isDateInRanges } from "@/lib/recurring";
```

Add this data fetch after the existing `unavailability` fetch:

```tsx
// Members who have a date range covering this service's date
const { data: allRanges } = await supabase
  .from("unavailability_ranges")
  .select("profile_id, start_date, end_date");

// Combine: unavailable if service-specific OR if service date falls in a range
const rangeUnavailableIds = (allRanges ?? [])
  .filter(r => isDateInRanges(service.date, [r]))
  .map(r => r.profile_id);

const combinedUnavailableIds = [
  ...(unavailability ?? []).map(u => u.profile_id),
  ...rangeUnavailableIds,
].filter((id, i, arr) => arr.indexOf(id) === i); // deduplicate
```

Then change the `RosterBuilder` call to pass `combinedUnavailableIds` instead of the per-service list:

```tsx
return (
  <RosterBuilder
    service={service}
    teams={teamsWithSortedPositions}
    slots={slots ?? []}
    eligible={eligible as EligibleRow[] ?? []}
    unavailableProfileIds={combinedUnavailableIds}
  />
);
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/roster/[id]/page.tsx"
git commit -m "feat: roster builder marks members unavailable via date ranges"
```

---

### Task 10: E2E Tests

**Files:**
- Create: `tests/e2e/recurring.spec.ts`

- [ ] **Step 1: Check auth state files exist**

```bash
ls tests/e2e/.auth/ 2>/dev/null || echo "no .auth dir"
```

- [ ] **Step 2: Write the E2E tests**

```ts
// tests/e2e/recurring.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Service templates", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("admin creates a weekly template and services are generated", async ({ page }) => {
    await page.goto("/roster/templates/new");
    await expect(page.getByText("New recurring service")).toBeVisible();

    await page.getByLabel("Service name").fill("E2E Sunday Service");
    await page.getByLabel("Repeats").selectOption("weekly");
    await page.getByLabel("Day of week").selectOption("0"); // Sunday
    await page.getByLabel("Generate ahead (services)").fill("4");

    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page).toHaveURL("/roster/templates");
    await expect(page.getByText("E2E Sunday Service")).toBeVisible();
    await expect(page.getByText("4 upcoming")).toBeVisible();
  });

  test("templates page shows Generate 8 more button", async ({ page }) => {
    await page.goto("/roster/templates");
    await expect(page.getByRole("button", { name: "Generate 8 more" }).first()).toBeVisible();
  });

  test("roster list page shows templates shortcut", async ({ page }) => {
    await page.goto("/roster");
    await expect(page.getByRole("link", { name: /View templates/ })).toBeVisible();
  });
});

test.describe("Date range unavailability (member)", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("member sees Dates I'm away section on schedule page", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByText("Dates I'm away")).toBeVisible();
  });

  test("member can add and remove a date range", async ({ page }) => {
    await page.goto("/schedule");

    // Add a range
    await page.getByLabel("From").fill("2030-08-01");
    await page.getByLabel("To").fill("2030-08-14");
    await page.getByPlaceholder("Reason (optional)").fill("Holiday");
    await page.getByRole("button", { name: "Mark unavailable" }).click();

    // Range appears in list
    await expect(page.getByText("Holiday")).toBeVisible();

    // Remove it
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText("Holiday")).not.toBeVisible();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/recurring.spec.ts
git commit -m "test: e2e tests for recurring templates and date range unavailability"
```

---

### Task 11: Run Full Test Suite

- [ ] **Step 1: Run all unit tests**

```bash
pnpm test --run
```

Expected: all tests pass (should include rostering + recurring suites).

- [ ] **Step 2: Run TypeScript check across the whole project**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Final commit if any loose files**

```bash
git status
```

If clean: nothing to do. If any staged files remain, commit them.

---

### Task 12 (DEFERRED): Spreadsheet Roster View

> **Status: Not implemented in this plan.** Build after Plan 04 is stable. Prerequisites: recurring services live in production, admin feedback on template workflow collected.

**Design spec:** `docs/superpowers/specs/2026-04-24-recurring-services-design.md` — Section 3.

**When ready to build, the implementation will include:**

**Files to create:**
- `src/app/(app)/roster/spreadsheet/page.tsx` — server component; fetches a template's upcoming draft services + all positions + current slot assignments
- `src/app/(app)/roster/spreadsheet/SpreadsheetGrid.tsx` — client component; renders the position×date grid with dropdowns
- `src/app/(app)/roster/spreadsheet/actions.ts` — `saveAllDraftsAction(assignments: Record<serviceId, Assignment[]>)` and `publishAllAction(serviceIds: string[])`

**Key data shape:**
```ts
type GridData = {
  teams: { id: string; name: string; color: string; positions: { id: string; name: string }[] }[];
  services: { id: string; name: string; date: string }[];                 // columns
  slots: Record<serviceId, Record<positionId, string | null>>;            // existing assignments
  eligible: Record<positionId, { id: string; first_name: string; last_name: string }[]>;
};
```

**Route:** `/roster/spreadsheet?templateId=<uuid>` — filter by template to scope columns.

---

## Self-Review

**Spec coverage:**
- ✅ Recurring service templates with daily/weekly/monthly/yearly frequency — Tasks 1, 5, 6
- ✅ Auto-name generated services by date — `generateServiceName` in Task 3
- ✅ Generate N services on create + "Generate more" button — Tasks 5, 6
- ✅ Template list with upcoming count — Task 6
- ✅ Roster list shows templates shortcut — Task 7
- ✅ Date range unavailability table + RLS — Task 1
- ✅ Schedule page "Dates I'm away" card — Task 8
- ✅ Add/remove range actions — Task 8
- ✅ Roster builder checks ranges — Task 9
- ✅ Pure date helpers unit-tested — Tasks 3, 4
- ✅ E2E tests — Task 10
- ✅ Spreadsheet view specced and deferred — Task 12

**Type consistency:**
- `TemplateConfig` defined in `src/lib/recurring.ts` (Task 3), used in `roster/templates/new/actions.ts` (Task 5) ✅
- `generateDates`, `toDateString`, `generateServiceName`, `isDateInRanges` defined in Task 3, used in Tasks 5, 9 ✅
- `addRangeAction`, `removeRangeAction` defined in Task 8 `schedule/actions.ts`, referenced in `schedule/page.tsx` Task 8 ✅
- `generateMoreAction` defined in `roster/templates/new/actions.ts` Task 5, used in `roster/templates/page.tsx` Task 6 ✅
