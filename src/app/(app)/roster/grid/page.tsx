import { requireRosterGridAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { defaultGridRange, parseGridRange, cellKey, mergeUnavailability } from "@/lib/roster-grid";
import { RosterGrid, type GridData } from "./RosterGrid";

type SearchParams = Promise<{ start?: string; end?: string }>;

export default async function RosterGridPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const access = await requireRosterGridAccess();
  const params = await searchParams;
  const { start, end } = parseGridRange({ start: params.start, end: params.end });
  const supabase = await createClient();

  const [
    { data: services },
    { data: teams },
    { data: positions },
    { data: tmp },
    { data: profiles },
    { data: ranges },
    { data: perService },
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, date, status, type")
      .gte("date", start)
      .lte("date", end)
      .order("date"),
    supabase.from("teams").select("id, name, color").order("name"),
    supabase.from("team_positions").select("id, team_id, name, order").order("order"),
    supabase.from("team_member_positions").select("profile_id, position_id, team_role"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, status")
      .in("status", ["active", "invited"]),
    supabase
      .from("unavailability_ranges")
      .select("profile_id, start_date, end_date")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("service_unavailability")
      .select("profile_id, service_id"),
  ]);

  const serviceList = services ?? [];

  // Slots only for visible services
  let slotsRows: { id: string; service_id: string; position_id: string; profile_id: string | null; status: string }[] = [];
  if (serviceList.length > 0) {
    const { data } = await supabase
      .from("roster_slots")
      .select("id, service_id, position_id, profile_id, status")
      .in("service_id", serviceList.map((s) => s.id));
    slotsRows = (data ?? []) as typeof slotsRows;
  }

  const slots: GridData["slots"] = {};
  for (const r of slotsRows) {
    slots[cellKey(r.service_id, r.position_id)] = {
      slot_id: r.id,
      profile_id: r.profile_id,
      status: r.status as "unassigned" | "pending" | "confirmed" | "declined",
    };
  }

  const eligibility: GridData["eligibility"] = {};
  for (const row of tmp ?? []) {
    const arr = eligibility[row.position_id] ?? [];
    arr.push({ profile_id: row.profile_id, team_role: row.team_role as "leader" | "member" });
    eligibility[row.position_id] = arr;
  }

  const visibleServices = serviceList.map((s) => ({ id: s.id, date: s.date }));
  const visiblePerService = (perService ?? []).filter((u) =>
    visibleServices.some((s) => s.id === u.service_id),
  );
  const unavailableByService = mergeUnavailability(visibleServices, ranges ?? [], visiblePerService);

  const data: GridData = {
    services: serviceList as GridData["services"],
    teams: (teams ?? []) as GridData["teams"],
    positions: (positions ?? []) as GridData["positions"],
    slots,
    profiles: (profiles ?? []).map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })),
    eligibility,
    unavailableByService,
  };

  return (
    <RosterGrid
      data={data}
      range={{ start, end }}
      canEditAll={access.canEditAll}
      editableTeamIds={access.editableTeamIds}
    />
  );
}
