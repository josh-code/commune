import { describe, it, expect } from "vitest";
import {
  computeOverdueDays,
  defaultDueDate,
  storagePathFromCoverUrl,
  matchesSearch,
} from "@/lib/library";

describe("computeOverdueDays", () => {
  it("returns 0 if not yet due", () => {
    expect(computeOverdueDays("2026-05-10T00:00:00Z", new Date("2026-05-09T00:00:00Z"))).toBe(0);
  });
  it("returns 0 on the due day", () => {
    expect(computeOverdueDays("2026-05-10T00:00:00Z", new Date("2026-05-10T00:00:00Z"))).toBe(0);
  });
  it("returns positive days when past due", () => {
    expect(computeOverdueDays("2026-05-10T00:00:00Z", new Date("2026-05-13T00:00:00Z"))).toBe(3);
  });
});

describe("defaultDueDate", () => {
  it("returns ISO string 30 days from given moment", () => {
    const start = new Date("2026-05-01T12:00:00Z");
    const got = new Date(defaultDueDate(start));
    const diffMs = got.getTime() - start.getTime();
    expect(Math.round(diffMs / (1000 * 60 * 60 * 24))).toBe(30);
  });
});

describe("storagePathFromCoverUrl", () => {
  const BASE = "https://x.supabase.co/storage/v1/object/public/book-covers/";
  it("extracts the path", () => {
    expect(storagePathFromCoverUrl(`${BASE}books/abc/cover.jpg`)).toBe("books/abc/cover.jpg");
  });
  it("throws for the wrong bucket", () => {
    expect(() =>
      storagePathFromCoverUrl("https://x.supabase.co/storage/v1/object/public/item-photos/x.jpg"),
    ).toThrow();
  });
});

describe("matchesSearch", () => {
  const book = { title: "Mere Christianity", author: "C.S. Lewis", isbn: "9780060652920" };
  it("matches title case-insensitive", () => {
    expect(matchesSearch(book, "mere")).toBe(true);
  });
  it("matches author case-insensitive", () => {
    expect(matchesSearch(book, "lewis")).toBe(true);
  });
  it("matches isbn", () => {
    expect(matchesSearch(book, "9780060")).toBe(true);
  });
  it("returns true on empty query", () => {
    expect(matchesSearch(book, "")).toBe(true);
  });
  it("returns false on no match", () => {
    expect(matchesSearch(book, "tolkien")).toBe(false);
  });
});
