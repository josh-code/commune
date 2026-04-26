// src/app/(app)/roster/[id]/page.tsx
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RosterBuilder } from "./RosterBuilder";
import { isDateInRanges } from "@/lib/recurring";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: serviceId } = await params;
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select("id, name, date, type, status")
    .eq("id", serviceId)
    .single();

  if (!service) redirect("/roster");

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, color, team_positions(id, name, order)")
    .order("name");

  const { data: slots } = await supabase
    .from("roster_slots")
    .select("position_id, profile_id, status")
    .eq("service_id", serviceId);

  // All team_member_positions with profile info (who is eligible for each position)
  const { data: eligible } = await supabase
    .from("team_member_positions")
    .select("profile_id, team_id, position_id, profiles(id, first_name, last_name)");

  // Who has marked themselves unavailable for this service
  const { data: unavailability } = await supabase
    .from("service_unavailability")
    .select("profile_id")
    .eq("service_id", serviceId);

  // Members who have a date range covering this service's date
  const { data: allRanges } = await supabase
    .from("unavailability_ranges")
    .select("profile_id, start_date, end_date");

  // Combine: unavailable if service-specific OR if service date falls in a range
  const rangeUnavailableIds = (allRanges ?? [])
    .filter(r => isDateInRanges(service.date, [r]))
    .map(r => r.profile_id);

  const combinedUnavailableIds = [
    ...(unavailability ?? []).map(u => u.profile_id),
    ...rangeUnavailableIds,
  ].filter((id, i, arr) => arr.indexOf(id) === i); // deduplicate

  type TeamRow = {
    id: string;
    name: string;
    color: string;
    team_positions: { id: string; name: string; order: number }[];
  };

  type EligibleRow = {
    profile_id: string;
    team_id: string;
    position_id: string;
    profiles: { id: string; first_name: string; last_name: string } | null;
  };

  // Sort positions within each team by order
  const teamsWithSortedPositions = (teams as TeamRow[] ?? []).map(t => ({
    ...t,
    team_positions: [...(t.team_positions ?? [])].sort((a, b) => a.order - b.order),
  }));

  return (
    <RosterBuilder
      service={service}
      teams={teamsWithSortedPositions}
      slots={slots ?? []}
      eligible={eligible as EligibleRow[] ?? []}
      unavailableProfileIds={combinedUnavailableIds}
    />
  );
}
