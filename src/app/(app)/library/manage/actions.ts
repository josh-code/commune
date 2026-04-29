"use server";

import { revalidatePath } from "next/cache";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function returnLoanAction(
  loanId: string,
  condition: "good" | "damaged" | "poor" | null,
  notes: string | null,
): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_loan", {
    p_loan_id: loanId,
    p_condition: condition,
    p_notes: notes,
  });
  if (error) return { error: "Could not record return." };
  revalidatePath("/library/manage");
  revalidatePath("/library");
  return {};
}

export async function decideExtensionAction(
  extensionId: string,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_extension", {
    p_extension_id: extensionId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) return { error: "Could not save decision." };
  revalidatePath("/library/manage");
  return {};
}

export async function sendManualReminderAction(loanId: string): Promise<void> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const { data: loan } = await supabase
    .from("library_loans")
    .select(`
      id, due_at, borrower_id,
      library_book_copies ( library_books ( title ) )
    `)
    .eq("id", loanId)
    .single();
  if (!loan) return;

  const due = new Date(loan.due_at);
  const days = Math.max(0, Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24)));

  await supabase.from("notifications").insert({
    recipient_id: loan.borrower_id,
    type: "library_loan_overdue",
    payload: {
      loan_id: loan.id,
      book_title: (loan as any).library_book_copies?.library_books?.title ?? "Unknown",
      due_at: loan.due_at,
      days_overdue: days,
    },
  });

  await supabase
    .from("library_loans")
    .update({ last_reminder_at: new Date().toISOString() })
    .eq("id", loanId);

  revalidatePath("/library/manage");
}
