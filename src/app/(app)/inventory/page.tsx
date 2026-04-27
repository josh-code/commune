import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const CONDITION_BADGE: Record<string, string> = {
  good: "bg-green-100 text-green-700",
  needs_repair: "bg-amber-100 text-amber-700",
  out_of_service: "bg-red-100 text-red-700",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireUser();
  const { category } = await searchParams;
  const supabase = await createClient();

  // RLS handles visibility; we just query.
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("inventory_categories").select("id, name, color, order").order("order"),
    supabase
      .from("inventory_items")
      .select("id, name, photo_url, category_id, condition, tracked_individually, total_quantity")
      .order("name"),
  ]);

  const visibleCategories = categories ?? [];
  const filteredItems = (items ?? []).filter(i => !category || i.category_id === category);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Inventory</h1>

      {visibleCategories.length === 0 && (
        <p className="text-sm text-slate-400">No items available right now.</p>
      )}

      <div className="flex gap-2 flex-wrap mb-5">
        <Link
          href="/inventory"
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
            !category ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
          )}
        >
          All
        </Link>
        {visibleCategories.map(c => (
          <Link
            key={c.id}
            href={`/inventory?category=${c.id}`}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-colors",
              category === c.id ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
            {c.name}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {filteredItems.map(i => {
          const isOutOfService = i.condition === "out_of_service";
          return (
            <Link
              key={i.id}
              href={isOutOfService ? "#" : `/inventory/${i.id}`}
              className={cn(
                "bg-white rounded-xl border border-slate-200 p-4 transition-colors",
                isOutOfService ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50",
              )}
            >
              {i.photo_url && (
                <img src={i.photo_url} alt="" className="w-full h-32 object-cover rounded-lg mb-3 bg-slate-100" />
              )}
              <div className="text-sm font-medium text-slate-900">{i.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", CONDITION_BADGE[i.condition])}>
                  {i.condition.replace("_", " ")}
                </span>
                <span className="text-xs text-slate-500">
                  {i.tracked_individually ? "1 unit" : `${i.total_quantity} total`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {filteredItems.length === 0 && visibleCategories.length > 0 && (
        <p className="text-sm text-slate-400 text-center mt-8">No items in this category.</p>
      )}

      <div className="mt-6">
        <Link href="/inventory/reservations" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          My reservations →
        </Link>
      </div>
    </div>
  );
}
