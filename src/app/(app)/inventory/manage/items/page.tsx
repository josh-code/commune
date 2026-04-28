import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ItemsList } from "./ItemsList";

export default async function ItemsPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const [{ data: items }, { data: categories }] = await Promise.all([
    supabase.from("inventory_items").select("id, name, category_id, tracked_individually, total_quantity, condition, is_public").order("name"),
    supabase.from("inventory_categories").select("id, name, color").order("order"),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/inventory/manage" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <div className="flex items-center justify-between mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Items</h1>
        <Link
          href="/inventory/manage/items/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + New item
        </Link>
      </div>

      {(categories ?? []).length === 0 && (
        <p className="text-sm text-slate-400 mb-4">
          Create a category first. <Link href="/inventory/manage/categories" className="text-indigo-600 hover:text-indigo-800">Manage categories →</Link>
        </p>
      )}

      <ItemsList items={items ?? []} categories={categories ?? []} />
    </div>
  );
}
