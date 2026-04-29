"use server";

import { revalidatePath } from "next/cache";
import { requireRosterGridAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function assignSlotAction(
  slotId: string,
  profileId: string | null,
): Promise<{ error?: string }> {
  const access = await requireRosterGridAccess();
  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("roster_slots")
    .select("id, service_id, team_id, profile_id, status")
    .eq("id", slotId)
    .single();
  if (!slot) return { error: "Slot not found." };

  // Permission: admin/roster_maker can edit any slot;
  // team leaders can edit only slots in their teams
  if (!access.canEditAll && !access.editableTeamIds.includes(slot.team_id)) {
    return { error: "You don't have access to edit this slot." };
  }

  // Reset status to unassigned only if the assignee changed
  const status = slot.profile_id === profileId ? slot.status : "unassigned";

  const { error } = await supabase
    .from("roster_slots")
    .update({ profile_id: profileId, status })
    .eq("id", slotId);
  if (error) return { error: error.message };

  revalidatePath("/roster/grid");
  revalidatePath(`/roster/${slot.service_id}`);
  return {};
}
