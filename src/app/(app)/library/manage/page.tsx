import Link from "next/link";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

export default async function LibraryDashboardPage() {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const [{ data: loansRaw }, { data: extRaw }] = await Promise.all([
    supabase
      .from("library_loans")
      .select(`
        id, due_at, last_reminder_at,
        borrower:borrower_id ( first_name, last_name ),
        library_book_copies ( copy_number, library_books ( title ) )
      `)
      .is("returned_at", null)
      .order("due_at"),
    supabase
      .from("library_loan_extensions")
      .select(`
        id, loan_id, requested_until, reason,
        loan:loan_id ( due_at, library_book_copies ( library_books ( title ) ), borrower:borrower_id ( first_name, last_name ) )
      `)
      .eq("status", "pending")
      .order("created_at"),
  ]);

  const now = Date.now();
  const allLoans = (loansRaw ?? []).map((r: any) => ({
    id: r.id,
    due_at: r.due_at,
    last_reminder_at: r.last_reminder_at,
    borrower_name: `${r.borrower?.first_name ?? ""} ${r.borrower?.last_name ?? ""}`.trim() || "—",
    book_title: r.library_book_copies?.library_books?.title ?? "Unknown",
    copy_number: r.library_book_copies?.copy_number ?? 0,
  }));
  const overdue = allLoans.filter((l) => new Date(l.due_at).getTime() < now);
  const active = allLoans.filter((l) => new Date(l.due_at).getTime() >= now);

  const extensions = (extRaw ?? []).map((e: any) => ({
    id: e.id,
    loan_id: e.loan_id,
    requested_until: e.requested_until,
    reason: e.reason,
    current_due_at: e.loan?.due_at ?? "",
    book_title: e.loan?.library_book_copies?.library_books?.title ?? "Unknown",
    borrower_name: `${e.loan?.borrower?.first_name ?? ""} ${e.loan?.borrower?.last_name ?? ""}`.trim() || "—",
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Library admin</h1>
      <div className="flex gap-3 mb-6 text-sm">
        <Link href="/library/manage/checkout" className="text-indigo-600 hover:text-indigo-800">Walk-up checkout</Link>
        <span className="text-slate-300">·</span>
        <Link href="/library/manage/books" className="text-indigo-600 hover:text-indigo-800">Manage catalog</Link>
      </div>
      <DashboardClient overdue={overdue} active={active} extensions={extensions} />
    </div>
  );
}
