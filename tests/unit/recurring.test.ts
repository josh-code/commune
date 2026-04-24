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

  it("caps day-31 to last day of month when month has fewer days", () => {
    // day_of_month=31, afterDate=Jan 31 → next occurrence is Feb 28 (not Feb 31)
    const cfg31: TemplateConfig = { frequency: "monthly", day_of_week: null, day_of_month: 31, month_of_year: null };
    expect(toDateString(nextOccurrence(cfg31, d("2025-01-31")))).toBe("2025-02-28");
  });

  it("does not overflow month when afterDate is late in month", () => {
    // afterDate=March 30, target=30 → should land April 30, not May 30
    const cfg30: TemplateConfig = { frequency: "monthly", day_of_week: null, day_of_month: 30, month_of_year: null };
    expect(toDateString(nextOccurrence(cfg30, d("2025-03-30")))).toBe("2025-04-30");
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
