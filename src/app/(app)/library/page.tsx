import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookCard } from "@/components/library/BookCard";
import { BookOpen } from "lucide-react";
import Link from "next/link";

type SearchParams = Promise<{ q?: string; cat?: string }>;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const { q = "", cat = "" } = await searchParams;
  const supabase = await createClient();

  const [{ data: categories }, { data: books }, { data: copies }] = await Promise.all([
    supabase.from("library_categories").select("id, name, color").order("name"),
    supabase
      .from("library_books")
      .select("id, title, author, isbn, cover_url, tags, category_id")
      .order("title"),
    supabase
      .from("library_book_copies")
      .select("id, book_id, status"),
  ]);

  const catById = new Map((categories ?? []).map((c) => [c.id, c]));

  const counts = new Map<string, { total: number; available: number }>();
  for (const c of copies ?? []) {
    const cur = counts.get(c.book_id) ?? { total: 0, available: 0 };
    cur.total++;
    if (c.status === "available") cur.available++;
    counts.set(c.book_id, cur);
  }

  const filtered = (books ?? []).filter((b) => {
    if (cat && b.category_id !== cat) return false;
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      b.title.toLowerCase().includes(ql) ||
      b.author.toLowerCase().includes(ql) ||
      (b.isbn ?? "").toLowerCase().includes(ql)
    );
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Library</h1>
        <Link href="/library/me" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          My loans
        </Link>
      </div>

      <form className="flex gap-2 mb-6">
        <input
          type="search" name="q" defaultValue={q} placeholder="Search title, author, ISBN…"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <select
          name="cat" defaultValue={cat}
          className="text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none"
        >
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="submit" className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          Search
        </button>
      </form>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No books match.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filtered.map((b) => {
            const c = counts.get(b.id) ?? { total: 0, available: 0 };
            const cat = catById.get(b.category_id) ?? null;
            return (
              <BookCard
                key={b.id} id={b.id} title={b.title} author={b.author}
                cover_url={b.cover_url}
                category={cat ? { name: cat.name, color: cat.color } : null}
                available_count={c.available} total_count={c.total}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
