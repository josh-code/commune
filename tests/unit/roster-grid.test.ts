import { describe, it, expect } from "vitest";
import {
  defaultGridRange,
  parseGridRange,
  cellKey,
  mergeUnavailability,
} from "@/lib/roster-grid";

describe("defaultGridRange", () => {
  it("returns today and today + 56 days as YYYY-MM-DD", () => {
    const today = new Date("2026-05-01T08:00:00Z");
    const r = defaultGridRange(today);
    expect(r.start).toBe("2026-05-01");
    expect(r.end).toBe("2026-06-26");
  });
});

describe("parseGridRange", () => {
  it("returns the search-param values when valid", () => {
    expect(parseGridRange({ start: "2026-05-10", end: "2026-06-01" }, new Date("2026-05-01T00:00:00Z")))
      .toEqual({ start: "2026-05-10", end: "2026-06-01" });
  });
  it("falls back to defaults if start > end", () => {
    const r = parseGridRange({ start: "2026-06-01", end: "2026-05-01" }, new Date("2026-05-01T08:00:00Z"));
    expect(r).toEqual({ start: "2026-05-01", end: "2026-06-26" });
  });
  it("falls back to defaults when params are absent", () => {
    expect(parseGridRange({}, new Date("2026-05-01T08:00:00Z")))
      .toEqual({ start: "2026-05-01", end: "2026-06-26" });
  });
  it("falls back when start is malformed", () => {
    expect(parseGridRange({ start: "not-a-date", end: "2026-06-01" }, new Date("2026-05-01T08:00:00Z")))
      .toEqual({ start: "2026-05-01", end: "2026-06-26" });
  });
});

describe("cellKey", () => {
  it("joins service id and position id with colon", () => {
    expect(cellKey("svc-1", "pos-9")).toBe("svc-1:pos-9");
  });
});

describe("mergeUnavailability", () => {
  it("merges per-service entries with date-range entries", () => {
    const services = [
      { id: "s1", date: "2026-05-04" },
      { id: "s2", date: "2026-05-11" },
    ];
    const ranges = [
      { profile_id: "p1", start_date: "2026-05-01", end_date: "2026-05-07" },
    ];
    const perService = [
      { profile_id: "p2", service_id: "s2" },
    ];
    const map = mergeUnavailability(services, ranges, perService);
    expect(map["s1"].sort()).toEqual(["p1"]);
    expect(map["s2"].sort()).toEqual(["p2"]);
  });
  it("dedupes a profile that appears in both", () => {
    const services = [{ id: "s1", date: "2026-05-04" }];
    const ranges = [{ profile_id: "p1", start_date: "2026-05-01", end_date: "2026-05-07" }];
    const perService = [{ profile_id: "p1", service_id: "s1" }];
    expect(mergeUnavailability(services, ranges, perService)["s1"]).toEqual(["p1"]);
  });
  it("excludes a range that doesn't cover any visible service", () => {
    const services = [{ id: "s1", date: "2026-06-01" }];
    const ranges = [{ profile_id: "p1", start_date: "2026-05-01", end_date: "2026-05-07" }];
    expect(mergeUnavailability(services, ranges, [])).toEqual({ s1: [] });
  });
});
