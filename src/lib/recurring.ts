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
