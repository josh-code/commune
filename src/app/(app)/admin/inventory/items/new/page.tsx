import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createItemAction } from "./actions";

export default async function NewItemPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("id, name")
    .order("order");

  if (!categories || categories.length === 0) {
    redirect("/admin/inventory/categories");
  }

  return (
    <div className="max-w-md">
      <Link href="/admin/inventory/items" className="text-sm text-slate-500 hover:text-slate-900">← Items</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">New item</h1>

      <form action={createItemAction} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Item name</label>
          <input type="text" name="name" required autoFocus className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            {categories!.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Description (optional)</label>
          <textarea name="description" rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="tracked_individually" className="rounded border-slate-300 text-indigo-600" />
          Tracked individually (each unit is unique, like Mic #1)
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Total quantity (ignored if tracked individually)</label>
          <input type="number" name="total_quantity" min="1" defaultValue="1" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Serial number (optional)</label>
          <input type="text" name="serial_number" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition</label>
          <select name="condition" defaultValue="good" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Condition notes (optional)</label>
          <input type="text" name="condition_notes" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Location (optional)</label>
          <input type="text" name="location" placeholder="e.g. AV Room" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Photo URL (optional)</label>
          <input type="url" name="photo_url" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="approval_required" className="rounded border-slate-300 text-indigo-600" />
          Member reservations need approval
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="is_public" defaultChecked className="rounded border-slate-300 text-indigo-600" />
          Visible to members (their visibility also depends on the category)
        </label>

        <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Create item
        </button>
      </form>
    </div>
  );
}
