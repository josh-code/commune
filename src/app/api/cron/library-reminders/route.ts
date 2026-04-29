import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Use the service-role key to bypass RLS for this scheduled task.
  const supabase = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Find overdue loans not yet reminded today
  const { data: loans, error } = await supabase
    .from("library_loans")
    .select(`
      id, due_at, borrower_id, last_reminder_at,
      library_book_copies ( library_books ( title ) )
    `)
    .is("returned_at", null)
    .lt("due_at", new Date().toISOString())
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${todayIso}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let count = 0;
  const nowIso = new Date().toISOString();

  for (const loan of loans ?? []) {
    const due = new Date(loan.due_at).getTime();
    const days = Math.max(1, Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24)));
    const title = (loan as any).library_book_copies?.library_books?.title ?? "Unknown";

    const { error: insErr } = await supabase.from("notifications").insert({
      recipient_id: loan.borrower_id,
      type: "library_loan_overdue",
      payload: { loan_id: loan.id, book_title: title, due_at: loan.due_at, days_overdue: days },
    });
    if (insErr) continue;

    await supabase
      .from("library_loans")
      .update({ last_reminder_at: nowIso })
      .eq("id", loan.id);

    count++;
  }

  return NextResponse.json({ ok: true, reminders_sent: count });
}
