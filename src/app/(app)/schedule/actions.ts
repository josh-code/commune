// src/app/(app)/schedule/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function confirmAction(slotId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("roster_slots")
    .select("id, profile_id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || slot.profile_id !== user.id) return { error: "Not authorised." };

  const { error } = await supabase
    .from("roster_slots")
    .update({ status: "confirmed", responded_at: new Date().toISOString() })
    .eq("id", slotId);

  if (error) return { error: error.message };
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return {};
}

export async function declineAction(slotId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: slot } = await supabase
    .from("roster_slots")
    .select("id, profile_id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || slot.profile_id !== user.id) return { error: "Not authorised." };

  const { error } = await supabase
    .from("roster_slots")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", slotId);

  if (error) return { error: error.message };
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return {};
}

export async function markUnavailableAction(serviceId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("service_unavailability")
    .insert({ profile_id: user.id, service_id: serviceId });

  if (error && error.code !== "23505") return { error: error.message }; // ignore duplicate
  revalidatePath("/schedule");
  return {};
}

export async function unmarkUnavailableAction(serviceId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("service_unavailability")
    .delete()
    .eq("profile_id", user.id)
    .eq("service_id", serviceId);

  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return {};
}

export async function addRangeAction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser();
  const startDate = formData.get("start_date") as string;
  const endDate   = formData.get("end_date")   as string;
  const reason    = (formData.get("reason") as string)?.trim() || null;

  if (!startDate || !endDate) return { error: "Start and end dates are required." };
  if (endDate < startDate)    return { error: "End date must be on or after start date." };

  const supabase = await createClient();
  const { error } = await supabase.from("unavailability_ranges").insert({
    profile_id: user.id,
    start_date: startDate,
    end_date: endDate,
    reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return {};
}

export async function removeRangeAction(rangeId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: range } = await supabase
    .from("unavailability_ranges")
    .select("profile_id")
    .eq("id", rangeId)
    .maybeSingle();

  if (!range || range.profile_id !== user.id) return { error: "Not authorised." };

  const { error } = await supabase
    .from("unavailability_ranges")
    .delete()
    .eq("id", rangeId);

  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return {};
}
