import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, ArrowLeft } from "lucide-react";
import { BookActions } from "./BookActions";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ book_id: string }>;
}) {
  const { book_id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("library_books")
    .select("id, title, author, isbn, publisher, year_published, description, cover_url, tags, category_id, library_categories(id, name, color)")
    .eq("id", book_id)
    .single();

  if (!book) notFound();

  const [{ data: copies }, { data: myActiveLoan }, { data: myRes }, { data: queueCount }] = await Promise.all([
    supabase
      .from("library_book_copies")
      .select("id, copy_number, status, condition, location")
      .eq("book_id", book_id)
      .order("copy_number"),
    supabase
      .from("library_loans")
      .select("id, due_at, library_book_copies!inner(book_id)")
      .eq("borrower_id", user.id)
      .is("returned_at", null)
      .eq("library_book_copies.book_id", book_id)
      .maybeSingle(),
    supabase
      .from("library_reservations")
      .select("id, created_at")
      .eq("book_id", book_id)
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("library_reservations")
      .select("id", { count: "exact", head: true })
      .eq("book_id", book_id),
  ]);

  const availableCount = (copies ?? []).filter((c) => c.status === "available").length;
  const cat = (book as any).library_categories;

  return (
    <div className="max-w-3xl">
      <Link href="/library" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Library
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-3">
        <div className="aspect-[3/4] bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
          {book.cover_url
            ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            : <BookOpen className="w-12 h-12 text-slate-300" />}
        </div>

        <div className="sm:col-span-2 space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{book.title}</h1>
            <div className="text-sm text-slate-600">{book.author}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {cat && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: cat.color + "20", color: cat.color }}
              >
                {cat.name}
              </span>
            )}
            {(book.tags ?? []).map((t: string) => (
              <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
          <dl className="text-xs text-slate-500 space-y-1">
            {book.year_published && <div>Year: {book.year_published}</div>}
            {book.publisher && <div>Publisher: {book.publisher}</div>}
            {book.isbn && <div>ISBN: {book.isbn}</div>}
          </dl>
          {book.description && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{book.description}</p>
          )}

          <BookActions
            bookId={book_id}
            availableCount={availableCount}
            myActiveLoan={myActiveLoan ? { id: myActiveLoan.id, due_at: myActiveLoan.due_at } : null}
            myReservation={myRes ? { id: myRes.id } : null}
            queueLength={queueCount?.length ?? 0}
          />

          {(user.role === "admin" || user.role === "librarian") && (
            <Link
              href={`/library/manage/books/${book_id}`}
              className="inline-block text-xs text-indigo-600 hover:text-indigo-800 mt-2"
            >
              Edit book →
            </Link>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Copies</h2>
        <ul className="space-y-2">
          {(copies ?? []).map((c) => (
            <li key={c.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="text-sm text-slate-900">
                Copy #{c.copy_number}
                <span className="text-xs text-slate-500 ml-2">{c.condition}{c.location ? ` · ${c.location}` : ""}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                c.status === "available" ? "bg-emerald-100 text-emerald-700" :
                c.status === "checked_out" ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-500"
              }`}>{c.status.replace("_"," ")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
