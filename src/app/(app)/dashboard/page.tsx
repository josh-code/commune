// src/app/(app)/dashboard/page.tsx
import Link from "next/link";
import { Boxes, Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { confirmAction, declineAction } from "../schedule/actions";

const SLOT_STATUS_STYLES: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  declined:  "bg-red-100 text-red-700",
  unassigned:"bg-slate-100 text-slate-500",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Fetch my next 3 upcoming published slots
  const { data: slots } = await supabase
    .from("roster_slots")
    .select(`
      id, status,
      services ( id, name, date, status ),
      teams ( name, color ),
      team_positions ( name )
    `);
  // RLS limits this to own slots

  type SlotRow = {
    id: string;
    status: string;
    services: { id: string; name: string; date: string; status: string } | null;
    teams: { name: string; color: string } | null;
    team_positions: { name: string } | null;
  };

  const upcoming = (slots as SlotRow[] ?? [])
    .filter(s => s.services?.status === "published" && (s.services?.date ?? "") >= today)
    .sort((a, b) => (a.services?.date ?? "").localeCompare(b.services?.date ?? ""))
    .slice(0, 3);

  // My active inventory reservations (anything not finished)
  const { data: myInvRes } = await supabase
    .from("inventory_reservations")
    .select("id, status, start_date, end_date, inventory_items(id, name)")
    .eq("profile_id", user.id)
    .in("status", ["pending", "approved", "checked_out"])
    .order("start_date");

  // Staff alerts
  const isStaff = user.role === "admin" || user.role === "logistics";
  let pendingApprovalCount = 0;
  let overdueCount = 0;
  if (isStaff) {
    const today = new Date().toISOString().split("T")[0];
    const [{ count: pc }, { count: oc }] = await Promise.all([
      supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("inventory_reservations").select("id", { count: "exact", head: true }).eq("status", "checked_out").lt("end_date", today),
    ]);
    pendingApprovalCount = pc ?? 0;
    overdueCount = oc ?? 0;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user.firstName}</h1>
        <p className="text-sm text-slate-500 mt-1 capitalize">{user.role}</p>
      </div>

      {/* Inventory: my reservations */}
      {(myInvRes ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Boxes className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">My inventory</h2>
            <Link href="/inventory/reservations" className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800">
              See all →
            </Link>
          </div>
          <div className="space-y-1">
            {(myInvRes ?? []).slice(0, 4).map(r => {
              const it = r.inventory_items as { id: string; name: string } | null;
              return (
                <div key={r.id} className="flex items-center gap-3 text-sm py-1">
                  <span className="flex-1 text-slate-800">{it?.name ?? "—"}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(r.start_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                    {r.start_date !== r.end_date && ` → ${new Date(r.end_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
                  </span>
                  <span className="text-xs text-indigo-600 capitalize">{r.status.replace("_", " ")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inventory: staff alerts */}
      {isStaff && (pendingApprovalCount > 0 || overdueCount > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <Bell className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 flex-1">
            {pendingApprovalCount > 0 && <>{pendingApprovalCount} pending approval{pendingApprovalCount > 1 && "s"}</>}
            {pendingApprovalCount > 0 && overdueCount > 0 && " · "}
            {overdueCount > 0 && <>{overdueCount} overdue</>}
          </span>
          <Link href="/admin/inventory/reservations" className="text-xs font-medium text-amber-700 hover:text-amber-900">
            Review →
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Upcoming assignments</h2>
            <Link href="/schedule" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {upcoming.map(slot => (
              <div key={slot.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{slot.services?.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {slot.services?.date && new Date(slot.services.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                    {" · "}
                    {slot.teams?.name} — {slot.team_positions?.name}
                  </div>
                </div>
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize flex-shrink-0", SLOT_STATUS_STYLES[slot.status])}>
                  {slot.status}
                </span>
                {slot.status === "pending" && (
                  <div className="flex gap-1">
                    <form action={async () => { "use server"; await confirmAction(slot.id); }}>
                      <button type="submit" className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg">
                        ✓
                      </button>
                    </form>
                    <form action={async () => { "use server"; await declineAction(slot.id); }}>
                      <button type="submit" className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg">
                        ✗
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
