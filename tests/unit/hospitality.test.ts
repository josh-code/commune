import { describe, it, expect } from "vitest";
import { canTransition, STATUS_LABELS, type HospitalityNeedStatus } from "@/lib/hospitality";

describe("canTransition", () => {
  it("needed → requested is allowed", () => {
    expect(canTransition("needed", "requested")).toBe(true);
  });
  it("needed → fulfilled is allowed (direct)", () => {
    expect(canTransition("needed", "fulfilled")).toBe(true);
  });
  it("requested → fulfilled is allowed", () => {
    expect(canTransition("requested", "fulfilled")).toBe(true);
  });
  it("fulfilled is terminal — no transitions", () => {
    expect(canTransition("fulfilled", "needed")).toBe(false);
    expect(canTransition("fulfilled", "requested")).toBe(false);
    expect(canTransition("fulfilled", "fulfilled")).toBe(false);
  });
  it("requested → needed is not allowed (would unsend a request)", () => {
    expect(canTransition("requested", "needed")).toBe(false);
  });
  it("self-loops are not allowed", () => {
    expect(canTransition("needed", "needed")).toBe(false);
    expect(canTransition("requested", "requested")).toBe(false);
  });
});

describe("STATUS_LABELS", () => {
  it("has a label for each status", () => {
    const statuses: HospitalityNeedStatus[] = ["needed", "requested", "fulfilled"];
    for (const s of statuses) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });
});
