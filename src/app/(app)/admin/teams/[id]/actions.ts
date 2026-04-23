// src/app/(app)/admin/teams/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// ── Positions ────────────────────────────────────────────────────────────────

export async function addPositionAction(teamId: string, formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Position name is required." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("team_positions")
    .select("order")
    .eq("team_id", teamId)
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (existing?.order ?? 0) + 1;
  const { error } = await supabase
    .from("team_positions")
    .insert({ team_id: teamId, name, order: nextOrder });

  if (error) return { error: error.message };
  revalidatePath(`/admin/teams/${teamId}`);
  return {};
}

export async function updatePositionOrderAction(
  teamId: string,
  positionId: string,
  direction: "up" | "down",
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: positions } = await supabase
    .from("team_positions")
    .select("id, order")
    .eq("team_id", teamId)
    .order("order");

  if (!positions) return;
  const idx = positions.findIndex(p => p.id === positionId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= positions.length) return;

  const a = positions[idx];
  const b = positions[swapIdx];

  await supabase.from("team_positions").update({ order: b.order }).eq("id", a.id);
  await supabase.from("team_positions").update({ order: a.order }).eq("id", b.id);

  revalidatePath(`/admin/teams/${teamId}`);
}

export async function deletePositionAction(teamId: string, positionId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("roster_slots")
    .select("*", { count: "exact", head: true })
    .eq("position_id", positionId);

  if (count && count > 0) {
    return { error: "This position is used in one or more rosters and cannot be deleted." };
  }

  const { error } = await supabase
    .from("team_positions")
    .delete()
    .eq("id", positionId);

  if (error) return { error: error.message };
  revalidatePath(`/admin/teams/${teamId}`);
  return {};
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function assignMemberAction(
  teamId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  await requireAdmin();
  const profileId = formData.get("profileId") as string;
  const positionId = formData.get("positionId") as string;
  const teamRole = (formData.get("teamRole") as string) ?? "member";
  if (!profileId || !positionId) return { error: "Profile and position are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("team_member_positions").insert({
    profile_id: profileId,
    team_id: teamId,
    position_id: positionId,
    team_role: teamRole as "leader" | "member",
  });

  if (error) return { error: error.message };
  revalidatePath(`/admin/teams/${teamId}`);
  return {};
}

export async function updateMemberRoleAction(
  teamId: string,
  profileId: string,
  positionId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const teamRole = formData.get("teamRole") as "leader" | "member";
  if (!teamRole) return;

  const supabase = await createClient();
  await supabase
    .from("team_member_positions")
    .update({ team_role: teamRole })
    .eq("profile_id", profileId)
    .eq("position_id", positionId);

  revalidatePath(`/admin/teams/${teamId}`);
}

export async function removeMemberFromTeamAction(
  teamId: string,
  profileId: string,
  positionId: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const { data: conflicting } = await supabase
    .from("roster_slots")
    .select("services(name, date)")
    .eq("position_id", positionId)
    .eq("profile_id", profileId)
    .eq("services.status", "published")
    .gte("services.date", today);

  const conflicts = (conflicting ?? []).filter(s => s.services !== null);
  if (conflicts.length > 0) {
    const names = conflicts.map(s => (s.services as { name: string }).name).join(", ");
    return { error: `Member is rostered for: ${names}. Remove them from those rosters first.` };
  }

  await supabase
    .from("team_member_positions")
    .delete()
    .eq("profile_id", profileId)
    .eq("position_id", positionId);

  revalidatePath(`/admin/teams/${teamId}`);
  return {};
}
