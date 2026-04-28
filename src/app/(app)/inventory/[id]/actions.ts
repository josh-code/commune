"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calculateAvailability } from "@/lib/inventory";

export async function createReservationAction(itemId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const startDate = formData.get("start_date") as string;
  const endDate   = formData.get("end_date")   as string;
  const quantity  = Math.max(1, Number(formData.get("quantity") ?? "1"));
  const notes     = (formData.get("notes") as string)?.trim() || null;

  if (!startDate || !endDate || endDate < startDate) return;

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, tracked_individually, total_quantity, condition, approval_required")
    .eq("id", itemId)
    .maybeSingle();

  if (!item || item.condition === "out_of_service") return;

  const { data: actives } = await supabase
    .from("inventory_reservations")
    .select("status, start_date, end_date, quantity")
    .eq("item_id", itemId)
    .in("status", ["approved", "checked_out"]);

  const available = calculateAvailability(
    { tracked_individually: item.tracked_individually, total_quantity: item.total_quantity, condition: item.condition },
    (actives ?? []) as { status: "approved" | "checked_out"; start_date: string; end_date: string; quantity: number }[],
    { start_date: startDate, end_date: endDate },
  );

  const requested = item.tracked_individually ? 1 : quantity;
  if (available < requested) return;

  const isStaff = user.role === "admin" || user.role === "logistics";
  const status = item.approval_required && !isStaff ? "pending" : "approved";

  await supabase.from("inventory_reservations").insert({
    item_id: itemId,
    profile_id: user.id,
    created_by: user.id,
    quantity: requested,
    start_date: startDate,
    end_date: endDate,
    status,
    notes,
    approved_by: status === "approved" ? user.id : null,
    approved_at: status === "approved" ? new Date().toISOString() : null,
  });

  redirect("/inventory/reservations");
}
