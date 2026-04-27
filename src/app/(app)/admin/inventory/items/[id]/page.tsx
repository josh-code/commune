import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditItemForm } from "./EditItemForm";

const RES_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-slate-100 text-slate-500",
  checked_out: "bg-indigo-100 text-indigo-700",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLogisticsOrAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: categories }, { data: history }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", id).maybeSingle(),
    supabase.from("inventory_categories").select("id, name").order("order"),
    supabase
      .from("inventory_reservations")
      .select("id, status, start_date, end_date, profiles!inventory_reservations_profile_id_fkey(first_name, last_name)")
      .eq("item_id", id)
      .order("start_date", { ascending: false })
      .limit(20),
  ]);

  if (!item) notFound();

  return (
    <div className="max-w-md">
      <Link href="/admin/inventory/items" className="text-sm text-slate-500 hover:text-slate-900">← Items</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">{item.name}</h1>

      <EditItemForm item={item} categories={categories ?? []} />

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Recent reservations</h2>
        {(history ?? []).length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
        {(history ?? []).map(r => {
          const p = r.profiles as { first_name: string; last_name: string } | null;
          return (
            <div key={r.id} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0 text-sm">
              <span className="flex-1">{p ? `${p.first_name} ${p.last_name}` : "—"}</span>
              <span className="text-xs text-slate-500">
                {r.start_date} → {r.end_date}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${RES_STATUS_BADGE[r.status]}`}>
                {r.status.replace("_", " ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
