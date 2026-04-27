"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function cancelOwnReservationAction(reservationId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("inventory_reservations")
    .select("profile_id, status")
    .eq("id", reservationId)
    .maybeSingle();

  if (!r || r.profile_id !== user.id) return;
  if (r.status !== "pending" && r.status !== "approved") return;

  await supabase
    .from("inventory_reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId);

  revalidatePath("/inventory/reservations");
  revalidatePath("/dashboard");
}

export async function markReturnedSelfAction(reservationId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("inventory_reservations")
    .select("profile_id, status, item_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (!r || r.profile_id !== user.id || r.status !== "checked_out") return;

  const condition = formData.get("return_condition") as "good" | "needs_repair" | "out_of_service" | null;
  const returnNotes = (formData.get("return_notes") as string)?.trim() || null;

  await supabase
    .from("inventory_reservations")
    .update({
      status: "returned",
      returned_at: new Date().toISOString(),
      return_condition: condition,
      return_notes: returnNotes,
    })
    .eq("id", reservationId);

  if (condition) {
    await supabase.from("inventory_items").update({ condition }).eq("id", r.item_id);
  }

  revalidatePath("/inventory/reservations");
  revalidatePath("/dashboard");
}
