// src/app/(app)/schedule/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function confirmAction(slotId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("roster_slots")
    .select("id, profile_id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || slot.profile_id !== user.id) return;

  const { error } = await supabase
    .from("roster_slots")
    .update({ status: "confirmed", responded_at: new Date().toISOString() })
    .eq("id", slotId);

  if (error) return;
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

export async function declineAction(slotId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("roster_slots")
    .select("id, profile_id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || slot.profile_id !== user.id) return;

  const { error } = await supabase
    .from("roster_slots")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", slotId);

  if (error) return;
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

export async function markUnavailableAction(serviceId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from("service_unavailability")
    .insert({ profile_id: user.id, service_id: serviceId });
  // ignore duplicate key errors (23505) — idempotent

  revalidatePath("/schedule");
}

export async function unmarkUnavailableAction(serviceId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from("service_unavailability")
    .delete()
    .eq("profile_id", user.id)
    .eq("service_id", serviceId);

  revalidatePath("/schedule");
}

export async function addRangeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const startDate = formData.get("start_date") as string;
  const endDate   = formData.get("end_date")   as string;
  const reason    = (formData.get("reason") as string)?.trim() || null;

  if (!startDate || !endDate || endDate < startDate) return;

  const supabase = await createClient();
  await supabase.from("unavailability_ranges").insert({
    profile_id: user.id,
    start_date: startDate,
    end_date: endDate,
    reason,
  });

  revalidatePath("/schedule");
}

export async function removeRangeAction(rangeId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: range } = await supabase
    .from("unavailability_ranges")
    .select("profile_id")
    .eq("id", rangeId)
    .maybeSingle();

  if (!range || range.profile_id !== user.id) return;

  await supabase
    .from("unavailability_ranges")
    .delete()
    .eq("id", rangeId);

  revalidatePath("/schedule");
}
