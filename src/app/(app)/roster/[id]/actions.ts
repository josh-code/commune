// src/app/(app)/roster/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validatePublishable } from "@/lib/rostering";

export type Assignment = {
  positionId: string;
  teamId: string;
  profileId: string;
};

export async function saveDraftAction(
  serviceId: string,
  assignments: Assignment[],
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  // Preserve existing statuses where the same person stays in the same slot
  const { data: existing } = await supabase
    .from("roster_slots")
    .select("position_id, profile_id, status")
    .eq("service_id", serviceId);

  const existingMap = new Map(
    (existing ?? []).map(s => [s.position_id, { profileId: s.profile_id, status: s.status }]),
  );

  // Wipe all slots for this service, then reinsert
  await supabase.from("roster_slots").delete().eq("service_id", serviceId);

  if (assignments.length > 0) {
    const rows = assignments.map(a => {
      const prev = existingMap.get(a.positionId);
      const status = prev && prev.profileId === a.profileId ? prev.status : "unassigned";
      return {
        service_id: serviceId,
        team_id: a.teamId,
        position_id: a.positionId,
        profile_id: a.profileId,
        status,
      };
    });
    const { error } = await supabase.from("roster_slots").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath(`/roster/${serviceId}`);
  return {};
}

export async function publishAction(
  serviceId: string,
  assignments: Assignment[],
): Promise<{ error?: string }> {
  await requireAdmin();

  const assignmentMap: Record<string, string | null> = Object.fromEntries(
    assignments.map(a => [a.positionId, a.profileId]),
  );
  const validationError = validatePublishable(assignmentMap);
  if (validationError) return { error: validationError };

  // Save draft first
  const saveResult = await saveDraftAction(serviceId, assignments);
  if (saveResult.error) return saveResult;

  const supabase = await createClient();

  // Set all slots to pending
  await supabase
    .from("roster_slots")
    .update({ status: "pending" })
    .eq("service_id", serviceId)
    .not("profile_id", "is", null);

  // Set service status to published
  const { error } = await supabase
    .from("services")
    .update({ status: "published" })
    .eq("id", serviceId);

  if (error) return { error: error.message };
  revalidatePath(`/roster/${serviceId}`);
  return {};
}

export async function completeAction(serviceId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ status: "completed" })
    .eq("id", serviceId);
  if (error) return { error: error.message };
  revalidatePath(`/roster/${serviceId}`);
  revalidatePath("/roster");
  return {};
}

export async function deleteServiceAction(serviceId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("services").delete().eq("id", serviceId);
  redirect("/roster");
}
