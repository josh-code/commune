import { randomUUID } from "crypto";

export const INVITE_TTL_DAYS = 7;

export function generateInviteToken(): { token: string; expiresAt: Date } {
  return {
    token: randomUUID(),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  };
}

export function isInviteExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return true;
  const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return exp.getTime() <= Date.now();
}
