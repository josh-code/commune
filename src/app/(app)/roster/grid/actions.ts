"use server";

import { revalidatePath } from "next/cache";
import { requireRosterGridAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function assignSlotAction(
  slotId: string,
  profileId: string | null,
  createParams?: { service_id: string; team_id: string; position_id: string },
): Promise<{ error?: string }> {
  const access = await requireRosterGridAccess();
  const supabase = await createClient();

  // ── Create a new slot when slotId is a sentinel empty string ──────────────
  if (!slotId) {
    if (!createParams) return { error: "Missing slot creation params." };

    if (!access.canEditAll && !access.editableTeamIds.includes(createParams.team_id)) {
      return { error: "You don't have access to edit this slot." };
    }

    const { data: newSlot, error: createError } = await supabase
      .from("roster_slots")
      .insert({
        service_id: createParams.service_id,
        team_id: createParams.team_id,
        position_id: createParams.position_id,
        profile_id: profileId,
        status: "unassigned",
      })
      .select("service_id")
      .single();

    if (createError || !newSlot) return { error: createError?.message ?? "Failed to create slot." };

    revalidatePath("/roster/grid");
    revalidatePath(`/roster/${newSlot.service_id}`);
    return {};
  }

  // ── Update an existing slot ───────────────────────────────────────────────
  const { data: slot } = await supabase
    .from("roster_slots")
    .select("id, service_id, team_id, profile_id, status")
    .eq("id", slotId)
    .single();
  if (!slot) return { error: "Slot not found." };

  if (!access.canEditAll && !access.editableTeamIds.includes(slot.team_id)) {
    return { error: "You don't have access to edit this slot." };
  }

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
