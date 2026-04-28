import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MyReservationsList } from "./MyReservationsList";

export default async function MyReservationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: reservations } = await supabase
    .from("inventory_reservations")
    .select("id, status, start_date, end_date, quantity, notes, rejection_reason, inventory_items(id, name)")
    .eq("profile_id", user.id)
    .order("start_date", { ascending: false });

  return (
    <div className="max-w-2xl">
      <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">My reservations</h1>
      <MyReservationsList reservations={(reservations ?? []) as Parameters<typeof MyReservationsList>[0]["reservations"]} />
    </div>
  );
}
