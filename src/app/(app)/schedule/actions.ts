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

export async function markUnavailableAction(serviceDate: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase.from("unavailability_ranges").insert({
    profile_id: user.id,
    start_date: serviceDate,
    end_date: serviceDate,
  });
  // ignore duplicate key errors — idempotent

  revalidatePath("/schedule");
}

export async function unmarkUnavailableAction(serviceDate: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from("unavailability_ranges")
    .delete()
    .eq("profile_id", user.id)
    .eq("start_date", serviceDate)
    .eq("end_date", serviceDate);

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
