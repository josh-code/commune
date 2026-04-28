"use server";

import { revalidatePath } from "next/cache";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function approveReservationAction(id: string): Promise<void> {
  const user = await requireLogisticsOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("inventory_reservations")
    .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/inventory/reservations");
}

export async function rejectReservationAction(id: string, formData: FormData): Promise<void> {
  const user = await requireLogisticsOrAdmin();
  const supabase = await createClient();
  const reason = (formData.get("rejection_reason") as string)?.trim() || null;
  await supabase
    .from("inventory_reservations")
    .update({ status: "rejected", approved_by: user.id, approved_at: new Date().toISOString(), rejection_reason: reason })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/inventory/reservations");
}

export async function checkoutReservationAction(id: string): Promise<void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();
  await supabase
    .from("inventory_reservations")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved");
  revalidatePath("/admin/inventory/reservations");
}

export async function returnReservationAction(id: string, formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const condition = formData.get("return_condition") as "good" | "needs_repair" | "out_of_service" | null;
  const returnNotes = (formData.get("return_notes") as string)?.trim() || null;

  const { data: r } = await supabase
    .from("inventory_reservations")
    .select("item_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!r || r.status !== "checked_out") return;

  await supabase
    .from("inventory_reservations")
    .update({
      status: "returned",
      returned_at: new Date().toISOString(),
      return_condition: condition,
      return_notes: returnNotes,
    })
    .eq("id", id);

  if (condition) {
    await supabase.from("inventory_items").update({ condition }).eq("id", r.item_id);
  }

  revalidatePath("/admin/inventory/reservations");
}
