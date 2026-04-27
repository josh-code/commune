// src/app/(app)/admin/inventory/page.tsx
import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Boxes, Package, ListChecks, ClipboardClock } from "lucide-react";

export default async function AdminInventoryHubPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const [pending, overdue] = await Promise.all([
    supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "checked_out").lt("end_date", today),
  ]);

  const pendingCount = pending.count ?? 0;
  const overdueCount = overdue.count ?? 0;

  return (
    <div>
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">← Admin</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Inventory</h1>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <Link href="/admin/inventory/categories" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Boxes className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Categories</div>
          <div className="text-xs text-slate-500 mt-1">Group items, set visibility</div>
        </Link>
        <Link href="/admin/inventory/items" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <Package className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Items</div>
          <div className="text-xs text-slate-500 mt-1">Add, edit, mark condition</div>
        </Link>
        <Link href="/admin/inventory/reservations" className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors">
          <ListChecks className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Reservations</div>
          <div className="text-xs text-slate-500 mt-1">
            {pendingCount > 0 ? `${pendingCount} pending` : "Approve, check out, return"}
          </div>
        </Link>
        {overdueCount > 0 && (
          <Link href="/admin/inventory/reservations?filter=overdue" className="bg-red-50 rounded-xl border border-red-200 p-5 hover:bg-red-100 transition-colors">
            <ClipboardClock className="w-6 h-6 text-red-600 mb-3" />
            <div className="font-medium text-red-900 text-sm">{overdueCount} overdue</div>
            <div className="text-xs text-red-700 mt-1">Items past their return date</div>
          </Link>
        )}
      </div>
    </div>
  );
}
