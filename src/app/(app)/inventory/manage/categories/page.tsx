import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoriesEditor } from "./CategoriesEditor";
import { createCategoryAction } from "./actions";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

export default async function CategoriesPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("id, name, color, is_public, order")
    .order("order");

  return (
    <div className="max-w-2xl">
      <Link href="/inventory/manage" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Categories</h1>

      <CategoriesEditor categories={categories ?? []} />

      <form action={createCategoryAction} className="bg-white rounded-xl border border-slate-200 p-4 mt-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-slate-600">New category name</label>
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. AV & Tech"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Colour</label>
          <input type="color" name="color" defaultValue={PRESET_COLORS[0]} className="w-10 h-9 rounded cursor-pointer" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer pb-2">
          <input type="checkbox" name="is_public" defaultChecked className="rounded border-slate-300 text-indigo-600" />
          Public
        </label>
        <button type="submit" className="text-sm font-medium bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
          Add
        </button>
      </form>
    </div>
  );
}
