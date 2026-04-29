"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function requestExtensionAction(
  loanId: string,
  requestedUntilIso: string,
  reason: string | null,
): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_extension", {
    p_loan_id: loanId,
    p_requested_until: requestedUntilIso,
    p_reason: reason,
  });
  if (error) {
    if (error.message.includes("must_be_after_current_due"))
      return { error: "Pick a date after the current due date." };
    if (error.message.includes("loan_returned"))
      return { error: "This loan is already returned." };
    return { error: "Could not submit extension request." };
  }
  revalidatePath("/library/me");
  return {};
}

export async function cancelReservationAction(reservationId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("library_reservations")
    .delete()
    .eq("id", reservationId)
    .eq("profile_id", user.id);
  revalidatePath("/library/me");
}
