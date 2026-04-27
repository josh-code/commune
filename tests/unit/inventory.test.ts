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
