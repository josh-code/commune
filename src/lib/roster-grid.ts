const RANGE_DAYS = 56;

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isValidDate(s: string | undefined): s is string {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime());
}

export function defaultGridRange(today: Date = new Date()): { start: string; end: string } {
  const start = new Date(today);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + RANGE_DAYS);
  return { start: fmt(start), end: fmt(end) };
}

export function parseGridRange(
  params: { start?: string; end?: string },
  today: Date = new Date(),
): { start: string; end: string } {
  if (!isValidDate(params.start) || !isValidDate(params.end)) return defaultGridRange(today);
  if (params.start! > params.end!) return defaultGridRange(today);
  return { start: params.start!, end: params.end! };
}

export function cellKey(serviceId: string, positionId: string): string {
  return `${serviceId}:${positionId}`;
}

// Builds: { service_id: [profile_id, ...] }
export function mergeUnavailability(
  services: { id: string; date: string }[],
  ranges: { profile_id: string; start_date: string; end_date: string }[],
  perService: { profile_id: string; service_id: string }[],
): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const s of services) out[s.id] = new Set();

  for (const r of ranges) {
    for (const s of services) {
      if (r.start_date <= s.date && s.date <= r.end_date) {
        out[s.id].add(r.profile_id);
      }
    }
  }

  for (const u of perService) {
    if (out[u.service_id]) out[u.service_id].add(u.profile_id);
  }

  const result: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(out)) result[k] = [...v];
  return result;
}
