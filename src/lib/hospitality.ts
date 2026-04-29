export type HospitalityNeedStatus = "needed" | "requested" | "fulfilled";

const ALLOWED: Record<HospitalityNeedStatus, HospitalityNeedStatus[]> = {
  needed:    ["requested", "fulfilled"],
  requested: ["fulfilled"],
  fulfilled: [],
};

export function canTransition(from: HospitalityNeedStatus, to: HospitalityNeedStatus): boolean {
  return ALLOWED[from].includes(to);
}

export const STATUS_LABELS: Record<HospitalityNeedStatus, string> = {
  needed:    "Needed",
  requested: "Requested",
  fulfilled: "Fulfilled",
};
