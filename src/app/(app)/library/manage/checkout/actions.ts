"use server";

import { redirect } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function walkUpCheckoutAction(formData: FormData): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const borrowerId = formData.get("borrower_id") as string;
  const copyId = formData.get("copy_id") as string;
  const dueAt = formData.get("due_at") as string;

  if (!borrowerId || !copyId || !dueAt) return { error: "Pick borrower, copy, and due date." };

  const dueIso = new Date(dueAt + "T23:59:59").toISOString();

  const supabase = await createClient();
  const { error } = await supabase.rpc("walk_up_checkout", {
    p_borrower_id: borrowerId,
    p_copy_id: copyId,
    p_due_at: dueIso,
  });
  if (error) {
    if (error.message.includes("unavailable")) return { error: "That copy is not available." };
    return { error: "Could not check out — please try again." };
  }
  redirect("/library/manage");
}
