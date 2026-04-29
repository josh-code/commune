import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MyLoansList } from "./MyLoansList";

export default async function MyLoansPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: activeRaw }, { data: histRaw }, { data: resRaw }, { data: pendingExt }] = await Promise.all([
    supabase
      .from("library_loans")
      .select(`
        id, due_at,
        library_book_copies ( copy_number, library_books ( title ) )
      `)
      .eq("borrower_id", user.id)
      .is("returned_at", null)
      .order("due_at"),
    supabase
      .from("library_loans")
      .select(`
        id, checked_out_at, returned_at,
        library_book_copies ( copy_number, library_books ( title ) )
      `)
      .eq("borrower_id", user.id)
      .not("returned_at", "is", null)
      .order("returned_at", { ascending: false })
      .limit(20),
    supabase
      .from("library_reservations")
      .select(`
        id, book_id, created_at, notified_at,
        library_books ( title )
      `)
      .eq("profile_id", user.id)
      .order("created_at"),
    supabase
      .from("library_loan_extensions")
      .select("id, loan_id, requested_until, status")
      .eq("requested_by", user.id)
      .eq("status", "pending"),
  ]);

  const extByLoan = new Map(
    (pendingExt ?? []).map((e) => [e.loan_id, { id: e.id, requested_until: e.requested_until }]),
  );

  const active = (activeRaw ?? []).map((r: any) => ({
    id: r.id,
    due_at: r.due_at,
    copy_number: r.library_book_copies?.copy_number ?? 0,
    book_title: r.library_book_copies?.library_books?.title ?? "Unknown",
    pending_extension: extByLoan.get(r.id) ?? null,
  }));

  // Compute reservation queue position via batched fetch (one query per book gets expensive;
  // instead fetch positions inline by counting earlier reservations for each book).
  const reservations = await Promise.all(
    (resRaw ?? []).map(async (r: any) => {
      const { count } = await supabase
        .from("library_reservations")
        .select("id", { count: "exact", head: true })
        .eq("book_id", r.book_id)
        .lte("created_at", r.created_at);
      return {
        id: r.id,
        book_id: r.book_id,
        book_title: r.library_books?.title ?? "Unknown",
        position: count ?? 1,
        notified_at: r.notified_at,
      };
    }),
  );

  const history = (histRaw ?? []).map((r: any) => ({
    id: r.id,
    book_title: r.library_book_copies?.library_books?.title ?? "Unknown",
    copy_number: r.library_book_copies?.copy_number ?? 0,
    checked_out_at: r.checked_out_at,
    returned_at: r.returned_at,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">My library</h1>
      <MyLoansList active={active} reservations={reservations} history={history} />
    </div>
  );
}
