"use server";

import { revalidatePath } from "next/cache";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function pathFor(serviceId: string) {
  return `/hospitality/services/${serviceId}`;
}

export async function addNeedAction(serviceId: string, formData: FormData): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const itemId = (formData.get("item_id") as string)?.trim();
  const quantity = (formData.get("quantity") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!itemId || !quantity) return;

  const supabase = await createClient();
  await supabase.from("hospitality_needs").insert({
    service_id: serviceId,
    item_id: itemId,
    quantity,
    notes,
    created_by: user.id,
  });
  revalidatePath(pathFor(serviceId));
}

export async function updateNeedAction(
  needId: string,
  serviceId: string,
  formData: FormData,
): Promise<void> {
  await requireHospitalityOrAdmin();
  const quantity = (formData.get("quantity") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!quantity) return;

  const supabase = await createClient();
  await supabase
    .from("hospitality_needs")
    .update({ quantity, notes })
    .eq("id", needId);
  revalidatePath(pathFor(serviceId));
}

export async function deleteNeedAction(needId: string, serviceId: string): Promise<void> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();
  await supabase.from("hospitality_needs").delete().eq("id", needId);
  revalidatePath(pathFor(serviceId));
}

export async function markFulfilledAction(needId: string, serviceId: string): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("hospitality_needs")
    .update({
      status: "fulfilled",
      fulfilled_by: user.id,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", needId);
  revalidatePath(pathFor(serviceId));
}

export async function requestOrderAction(serviceId: string): Promise<{ count: number }> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_hospitality_order", { p_service_id: serviceId });
  if (error) return { count: 0 };
  revalidatePath(pathFor(serviceId));
  return { count: typeof data === "number" ? data : 0 };
}
