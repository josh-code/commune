import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewBookForm } from "./NewBookForm";

export default async function NewBookPage() {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const { data: cats } = await supabase
    .from("library_categories")
    .select("id, name")
    .order("name");

  if (!cats || cats.length === 0) redirect("/library/manage/books");

  return (
    <div className="max-w-md">
      <Link href="/library/manage/books" className="text-sm text-slate-500 hover:text-slate-900">← Catalog</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Add book</h1>
      <NewBookForm categories={cats} />
    </div>
  );
}
