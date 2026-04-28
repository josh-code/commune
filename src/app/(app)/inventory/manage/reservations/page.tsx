import Link from "next/link";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminReservationsList } from "./AdminReservationsList";

export default async function AdminReservationsPage() {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { data: reservations } = await supabase
    .from("inventory_reservations")
    .select("id, status, start_date, end_date, quantity, notes, rejection_reason, inventory_items(id, name), profiles!inventory_reservations_profile_id_fkey(first_name, last_name)")
    .order("start_date", { ascending: false })
    .limit(200);

  return (
    <div className="max-w-3xl">
      <Link href="/inventory/manage" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Reservations</h1>
      <AdminReservationsList reservations={(reservations ?? []) as Parameters<typeof AdminReservationsList>[0]["reservations"]} />
    </div>
  );
}
