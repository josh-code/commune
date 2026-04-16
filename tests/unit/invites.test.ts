import { describe, it, expect } from "vitest";
import {
  generateInviteToken,
  isInviteExpired,
  INVITE_TTL_DAYS,
} from "@/lib/invites";

describe("generateInviteToken", () => {
  it("returns a UUID v4 and an expiry 7 days in the future", () => {
    const before = new Date();
    const { token, expiresAt } = generateInviteToken();
    const after = new Date();

    // UUID v4 shape
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const expectedMin = new Date(
      before.getTime() + INVITE_TTL_DAYS * 86_400_000 - 1_000,
    );
    const expectedMax = new Date(
      after.getTime() + INVITE_TTL_DAYS * 86_400_000 + 1_000,
    );
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
  });

  it("generates unique tokens on successive calls", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.token).not.toEqual(b.token);
  });
});

describe("isInviteExpired", () => {
  it("returns true when expiresAt is in the past", () => {
    const past = new Date(Date.now() - 1_000);
    expect(isInviteExpired(past)).toBe(true);
  });

  it("returns false when expiresAt is in the future", () => {
    const future = new Date(Date.now() + 1_000);
    expect(isInviteExpired(future)).toBe(false);
  });

  it("returns true when expiresAt is null (no active invite)", () => {
    expect(isInviteExpired(null)).toBe(true);
  });
});
