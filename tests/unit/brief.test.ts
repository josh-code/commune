import { describe, it, expect } from "vitest";
import {
  computeBriefStatus,
  defaultDeadlineFor,
  formatVerseRef,
  storagePathFromBriefAttachmentUrl,
  type BriefStatus,
} from "@/lib/brief";

describe("computeBriefStatus", () => {
  it("returns 'complete' when sermon_submitted_at is set", () => {
    const status: BriefStatus = computeBriefStatus({
      sermon_submitted_at: "2026-04-29T10:00:00Z",
      deadline: "2026-04-25T23:59:00Z",
      now: new Date("2026-04-30T10:00:00Z"),
    });
    expect(status).toBe("complete");
  });
  it("returns 'late' when not submitted and deadline passed", () => {
    expect(computeBriefStatus({
      sermon_submitted_at: null,
      deadline: "2026-04-25T23:59:00Z",
      now: new Date("2026-04-30T10:00:00Z"),
    })).toBe("late");
  });
  it("returns 'pending' when not submitted and deadline future", () => {
    expect(computeBriefStatus({
      sermon_submitted_at: null,
      deadline: "2026-05-01T23:59:00Z",
      now: new Date("2026-04-29T10:00:00Z"),
    })).toBe("pending");
  });
});

describe("defaultDeadlineFor", () => {
  it("returns 4 days before service date at 23:59 (local time)", () => {
    // service is Sunday 2026-05-03 → deadline is Wednesday 2026-04-29 23:59
    const result = defaultDeadlineFor("2026-05-03");
    const d = new Date(result);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(29);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

describe("formatVerseRef", () => {
  it("single verse without override → uses default version", () => {
    expect(formatVerseRef({
      book: "John", chapter: 3, verse_start: 16, verse_end: null, version_override: null,
    }, "NIV")).toBe("John 3:16 (NIV)");
  });
  it("verse range", () => {
    expect(formatVerseRef({
      book: "John", chapter: 3, verse_start: 16, verse_end: 17, version_override: null,
    }, "NIV")).toBe("John 3:16-17 (NIV)");
  });
  it("override beats default", () => {
    expect(formatVerseRef({
      book: "Romans", chapter: 8, verse_start: 28, verse_end: null, version_override: "ESV",
    }, "NIV")).toBe("Romans 8:28 (ESV)");
  });
});

describe("storagePathFromBriefAttachmentUrl", () => {
  const BASE = "https://abc.supabase.co/storage/v1/object/public/brief-attachments/";
  it("extracts the path", () => {
    expect(storagePathFromBriefAttachmentUrl(`${BASE}briefs/abc/file.pdf`))
      .toBe("briefs/abc/file.pdf");
  });
  it("throws on a different bucket URL", () => {
    expect(() => storagePathFromBriefAttachmentUrl(
      "https://abc.supabase.co/storage/v1/object/public/chord-sheets/x.pdf"
    )).toThrow();
  });
});
