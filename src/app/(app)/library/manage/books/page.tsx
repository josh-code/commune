import Link from "next/link";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CatalogManager } from "./CatalogManager";

export default async function ManageBooksPage() {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const [{ data: cats }, { data: books }] = await Promise.all([
    supabase.from("library_categories").select("id, name, color").order("name"),
    supabase.from("library_books").select("id, title, author, category_id").order("title"),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/library/manage" className="text-sm text-slate-500 hover:text-slate-900">← Library admin</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Catalog</h1>
      <CatalogManager categories={cats ?? []} books={books ?? []} />
    </div>
  );
}
