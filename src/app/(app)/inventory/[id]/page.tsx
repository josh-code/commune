import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calculateAvailability } from "@/lib/inventory";
import { ReserveForm } from "./ReserveForm";
import { cn } from "@/lib/utils";

const CONDITION_BADGE: Record<string, string> = {
  good: "bg-green-100 text-green-700",
  needs_repair: "bg-amber-100 text-amber-700",
  out_of_service: "bg-red-100 text-red-700",
};

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, name, description, photo_url, category_id, tracked_individually, total_quantity, serial_number, condition, condition_notes, approval_required, location, inventory_categories(name, color)")
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  const today = new Date().toISOString().split("T")[0];
  const sixtyDaysOut = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().split("T")[0];

  const { data: actives } = await supabase
    .from("inventory_reservations")
    .select("status, start_date, end_date, quantity")
    .eq("item_id", id)
    .in("status", ["approved", "checked_out"])
    .gte("end_date", today)
    .lte("start_date", sixtyDaysOut);

  const todayAvailable = calculateAvailability(
    { tracked_individually: item.tracked_individually, total_quantity: item.total_quantity, condition: item.condition },
    (actives ?? []) as { status: "approved" | "checked_out"; start_date: string; end_date: string; quantity: number }[],
    { start_date: today, end_date: today },
  );

  const cat = item.inventory_categories as { name: string; color: string } | null;
  const isOutOfService = item.condition === "out_of_service";

  return (
    <div className="max-w-md">
      <Link href="/inventory" className="text-sm text-slate-500 hover:text-slate-900">← Inventory</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-4">{item.name}</h1>

      {item.photo_url && (
        <img src={item.photo_url} alt="" className="w-full h-48 object-cover rounded-xl mb-4 bg-slate-100" />
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-2 text-sm">
        {cat && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
            <span className="text-slate-700">{cat.name}</span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", CONDITION_BADGE[item.condition])}>
            {item.condition.replace("_", " ")}
          </span>
          <span className="text-xs text-slate-500">
            {item.tracked_individually ? "Individually tracked" : `${item.total_quantity} total`}
          </span>
          <span className="text-xs text-slate-500">{todayAvailable} available today</span>
        </div>
        {item.serial_number && <p className="text-xs text-slate-500">Serial: {item.serial_number}</p>}
        {item.location && <p className="text-xs text-slate-500">Location: {item.location}</p>}
        {item.condition_notes && <p className="text-xs text-amber-600">Note: {item.condition_notes}</p>}
        {item.description && <p className="text-slate-700 pt-2 border-t border-slate-100">{item.description}</p>}
      </div>

      {isOutOfService ? (
        <p className="text-sm text-slate-500 bg-slate-100 rounded-xl p-4 text-center">This item is out of service and cannot be reserved.</p>
      ) : (
        <ReserveForm
          itemId={item.id}
          trackedIndividually={item.tracked_individually}
          maxQuantity={item.total_quantity}
          approvalRequired={item.approval_required}
        />
      )}
    </div>
  );
}
