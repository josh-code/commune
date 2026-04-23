import { describe, it, expect } from "vitest";
import {
  findConflictingProfileIds,
  getUnavailabilityWarning,
  validatePublishable,
} from "@/lib/rostering";

describe("findConflictingProfileIds", () => {
  it("returns empty set when all assignments are unique", () => {
    const assignments = {
      "pos-1": "user-a",
      "pos-2": "user-b",
      "pos-3": "user-c",
    };
    expect(findConflictingProfileIds(assignments).size).toBe(0);
  });

  it("returns the profileId when the same member is assigned to two positions", () => {
    const assignments = {
      "pos-1": "user-a",
      "pos-2": "user-a",
      "pos-3": "user-b",
    };
    const conflicts = findConflictingProfileIds(assignments);
    expect(conflicts.has("user-a")).toBe(true);
    expect(conflicts.has("user-b")).toBe(false);
  });

  it("ignores null (unassigned) positions", () => {
    const assignments = {
      "pos-1": null,
      "pos-2": null,
    };
    expect(findConflictingProfileIds(assignments).size).toBe(0);
  });

  it("handles three-way conflict", () => {
    const assignments = {
      "pos-1": "user-a",
      "pos-2": "user-a",
      "pos-3": "user-a",
    };
    const conflicts = findConflictingProfileIds(assignments);
    expect(conflicts.has("user-a")).toBe(true);
    expect(conflicts.size).toBe(1);
  });
});

describe("getUnavailabilityWarning", () => {
  it("returns null when the member is not unavailable", () => {
    const result = getUnavailabilityWarning("user-a", ["user-b", "user-c"]);
    expect(result).toBeNull();
  });

  it("returns warning text when member is in the unavailable list", () => {
    const result = getUnavailabilityWarning("user-a", ["user-a", "user-b"]);
    expect(result).toContain("already rostered");
    expect(result).toContain("Contact your admin");
  });

  it("returns null for empty unavailability list", () => {
    expect(getUnavailabilityWarning("user-a", [])).toBeNull();
  });
});

describe("validatePublishable", () => {
  it("returns an error when no members are assigned", () => {
    const assignments = {
      "pos-1": null,
      "pos-2": null,
    };
    const result = validatePublishable(assignments);
    expect(result).not.toBeNull();
    expect(result).toContain("no members");
  });

  it("returns null when at least one member is assigned", () => {
    const assignments = {
      "pos-1": "user-a",
      "pos-2": null,
    };
    expect(validatePublishable(assignments)).toBeNull();
  });

  it("returns null when all positions are assigned", () => {
    const assignments = {
      "pos-1": "user-a",
      "pos-2": "user-b",
    };
    expect(validatePublishable(assignments)).toBeNull();
  });
});
