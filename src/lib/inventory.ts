// src/lib/inventory.ts

export type InventoryCondition = "good" | "needs_repair" | "out_of_service";

export type ReservationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "checked_out"
  | "returned"
  | "cancelled";

export type ItemForAvailability = {
  tracked_individually: boolean;
  total_quantity: number;
  condition: InventoryCondition;
};

export type ActiveReservation = {
  status: "approved" | "checked_out";
  start_date: string;
  end_date: string;
  quantity: number;
};

/** Inclusive-endpoints overlap: two ranges overlap if a.start <= b.end AND b.start <= a.end. */
export function detectOverlap(
  a: { start_date: string; end_date: string },
  b: { start_date: string; end_date: string },
): boolean {
  return a.start_date <= b.end_date && b.start_date <= a.end_date;
}

/**
 * Compute units available for `range` given the item's properties and a list of active reservations.
 * Caller MUST pre-filter to status ∈ {approved, checked_out}.
 */
export function calculateAvailability(
  item: ItemForAvailability,
  reservations: ActiveReservation[],
  range: { start_date: string; end_date: string },
): number {
  if (item.condition === "out_of_service") return 0;

  const overlapping = reservations.filter(r => detectOverlap(r, range));

  if (item.tracked_individually) {
    return overlapping.length === 0 ? 1 : 0;
  }
  const reserved = overlapping.reduce((sum, r) => sum + r.quantity, 0);
  return Math.max(0, item.total_quantity - reserved);
}

/** Caller role for state transition checks. */
export type ActorRole = "self" | "staff";

/**
 * Returns true if a transition is allowed for the given actor role.
 * `self` = the reservation's profile_id holder. `staff` = logistics or admin.
 */
export function canTransition(
  from: ReservationStatus,
  to: ReservationStatus,
  actor: ActorRole,
): boolean {
  if (from === to) return false;
  switch (from) {
    case "pending":
      if (to === "approved" || to === "rejected") return actor === "staff";
      if (to === "cancelled") return true;
      return false;
    case "approved":
      if (to === "checked_out") return true; // member self-checkout enforced by date check at call site
      if (to === "cancelled")    return true;
      return false;
    case "checked_out":
      return to === "returned";
    case "rejected":
    case "returned":
    case "cancelled":
      return false;
  }
}
