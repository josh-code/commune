// src/lib/rostering.ts

/** Returns profileIds that appear more than once in an assignment map */
export function findConflictingProfileIds(
  assignments: Record<string, string | null>,
): Set<string> {
  const counts = new Map<string, number>();
  for (const pid of Object.values(assignments)) {
    if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()].filter(([, c]) => c > 1).map(([pid]) => pid),
  );
}

/** Returns a warning message if a member is already rostered for a service they've marked unavailable */
export function getUnavailabilityWarning(
  profileId: string,
  unavailableProfileIds: string[],
): string | null {
  if (unavailableProfileIds.includes(profileId)) {
    return "You're already rostered for this service — marking unavailable won't remove your assignment. Contact your admin.";
  }
  return null;
}

/** Returns an error message if the service cannot be published */
export function validatePublishable(
  assignments: Record<string, string | null>,
): string | null {
  const assignedCount = Object.values(assignments).filter(v => v !== null).length;
  if (assignedCount === 0) return "Cannot publish: no members are assigned.";
  return null;
}
