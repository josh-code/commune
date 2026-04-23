// src/app/(app)/schedule/page.tsx
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { confirmAction, declineAction, markUnavailableAction, unmarkUnavailableAction } from "./actions";

const SLOT_STATUS_STYLES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-700",
  confirmed:  "bg-green-100 text-green-700",
  declined:   "bg-red-100 text-red-700",
  unassigned: "bg-slate-100 text-slate-500",
};

const UNAVAILABILITY_WARNING =
  "You're already rostered for this service — marking unavailable won't remove your assignment. Contact your admin.";

export default async function SchedulePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // My upcoming published slots
  const { data: mySlots } = await supabase
    .from("roster_slots")
    .select(`
      id, status, service_id,
      services ( id, name, date, status ),
      teams ( id, name, color ),
      team_positions ( id, name )
    `);
  // Note: profile_id filter applied by RLS (member sees own slots only)

  type SlotRow = {
    id: string;
    status: string;
    service_id: string;
    services: { id: string; name: string; date: string; status: string } | null;
    teams: { id: string; name: string; color: string } | null;
    team_positions: { id: string; name: string } | null;
  };

  const typedSlots = (mySlots ?? []) as SlotRow[];
  const upcomingSlots = typedSlots.filter(
    s => s.services?.status === "published" && s.services.date >= today,
  );
  const pastSlots = typedSlots.filter(
    s => s.services?.status === "completed",
  );

  // All upcoming services for unavailability checklist
  const { data: allServices } = await supabase
    .from("services")
    .select("id, name, date, type")
    .neq("status", "completed")
    .gte("date", today)
    .order("date");

  // My unavailability
  const { data: unavailability } = await supabase
    .from("service_unavailability")
    .select("service_id");

  const myUnavailableIds = new Set((unavailability ?? []).map(u => u.service_id));
  const myRosteredServiceIds = new Set(typedSlots.map(s => s.service_id));

  // suppress unused variable warning — user is used indirectly for RLS auth
  void user;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Schedule</h1>

      {/* Upcoming assignments */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">My assignments</h2>
        {upcomingSlots.length === 0 && (
          <p className="text-sm text-slate-400">No upcoming assignments.</p>
        )}
        {upcomingSlots.map(slot => {
          const confirm = confirmAction.bind(null, slot.id);
          const decline = declineAction.bind(null, slot.id);
          const confirmVoid = async () => { await confirm(); };
          const declineVoid = async () => { await decline(); };
          return (
          <div key={slot.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
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
                <form action={confirmVoid}>
                  <button type="submit" className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg transition-colors">
                    Confirm
                  </button>
                </form>
                <form action={declineVoid}>
                  <button type="submit" className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors">
                    Decline
                  </button>
                </form>
              </div>
            )}
          </div>
          );
        })}

        {pastSlots.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-slate-400 cursor-pointer select-none">Past assignments ({pastSlots.length})</summary>
            <div className="mt-2 space-y-1">
              {pastSlots.map(slot => (
                <div key={slot.id} className="flex items-center gap-3 py-1">
                  <span className="flex-1 text-xs text-slate-600">{slot.services?.name}</span>
                  <span className="text-xs text-slate-400">{slot.teams?.name} — {slot.team_positions?.name}</span>
                  <span className={cn("text-xs px-1.5 py-0.5 rounded-full capitalize", SLOT_STATUS_STYLES[slot.status])}>
                    {slot.status}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Services I can't make */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Services I can&#39;t make</h2>
        <p className="text-xs text-slate-400 mb-4">Check a service to let the admin know you&#39;re unavailable.</p>
        {(allServices ?? []).length === 0 && (
          <p className="text-sm text-slate-400">No upcoming services.</p>
        )}
        {(allServices ?? []).map(svc => {
          const isUnavailable = myUnavailableIds.has(svc.id);
          const isRostered = myRosteredServiceIds.has(svc.id);
          const toggleBound = isUnavailable
            ? unmarkUnavailableAction.bind(null, svc.id)
            : markUnavailableAction.bind(null, svc.id);
          const toggleVoid = async () => { await toggleBound(); };

          return (
            <div key={svc.id} className="py-2 border-b border-slate-100 last:border-0">
              <form action={toggleVoid}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={isUnavailable}
                    onChange={e => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span className="text-sm text-slate-800">{svc.name}</span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {new Date(svc.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </span>
                </label>
              </form>
              {isRostered && isUnavailable && (
                <p className="text-xs text-amber-600 mt-1 ml-7">{UNAVAILABILITY_WARNING}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
