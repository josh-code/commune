"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function pathFor(bookId: string) { return `/library/${bookId}`; }

export async function selfCheckoutAction(bookId: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("self_checkout", { p_book_id: bookId });
  if (error) {
    if (error.message.includes("already_borrowed"))
      return { error: "You already have a copy of this book." };
    if (error.message.includes("unavailable"))
      return { error: "All copies are checked out." };
    return { error: "Could not check out — please try again." };
  }
  revalidatePath(pathFor(bookId));
  revalidatePath("/library");
  revalidatePath("/library/me");
  return {};
}

export async function reserveAction(bookId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("library_reservations")
    .insert({ book_id: bookId, profile_id: user.id });
  if (error) {
    if (error.code === "23505") return { error: "You're already on the wait list." };
    return { error: "Could not reserve." };
  }
  revalidatePath(pathFor(bookId));
  revalidatePath("/library/me");
  return {};
}

export async function cancelMyReservationAction(reservationId: string, bookId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("library_reservations")
    .delete()
    .eq("id", reservationId)
    .eq("profile_id", user.id);
  revalidatePath(pathFor(bookId));
  revalidatePath("/library/me");
}
