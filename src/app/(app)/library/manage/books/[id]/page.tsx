import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditBookForm } from "./EditBookForm";
import { CopiesEditor } from "./CopiesEditor";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const [{ data: book }, { data: cats }, { data: copies }] = await Promise.all([
    supabase
      .from("library_books")
      .select("id, title, author, isbn, publisher, year_published, description, category_id, tags, cover_url")
      .eq("id", id)
      .single(),
    supabase.from("library_categories").select("id, name").order("name"),
    supabase
      .from("library_book_copies")
      .select("id, copy_number, condition, condition_notes, status, location")
      .eq("book_id", id)
      .order("copy_number"),
  ]);

  if (!book) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/library/manage/books" className="text-sm text-slate-500 hover:text-slate-900">← Catalog</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">{book.title}</h1>

      <EditBookForm book={book as any} categories={cats ?? []} />

      <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-3">Copies</h2>
      <CopiesEditor bookId={id} copies={(copies ?? []) as any} />
    </div>
  );
}
