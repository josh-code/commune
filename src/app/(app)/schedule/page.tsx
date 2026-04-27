// src/app/(app)/schedule/page.tsx
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { confirmAction, declineAction, addRangeAction, removeRangeAction } from "./actions";
import { ServiceUnavailabilityList } from "./ServiceUnavailabilityList";

const SLOT_STATUS_STYLES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-700",
  confirmed:  "bg-green-100 text-green-700",
  declined:   "bg-red-100 text-red-700",
  unassigned: "bg-slate-100 text-slate-500",
};


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

  const myRosteredServiceIds = new Set(typedSlots.map(s => s.service_id));

  // My upcoming date ranges (end_date >= today) — single source for all unavailability
  const { data: myRanges } = await supabase
    .from("unavailability_ranges")
    .select("id, start_date, end_date, reason")
    .eq("profile_id", user.id)
    .gte("end_date", today)
    .order("start_date");

  // Compute per-service unavailability from ranges
  const myUnavailableIds = new Set<string>();
  const myMultiRangeCoveredIds = new Set<string>();
  for (const svc of allServices ?? []) {
    for (const range of myRanges ?? []) {
      if (svc.date >= range.start_date && svc.date <= range.end_date) {
        myUnavailableIds.add(svc.id);
        if (range.start_date !== range.end_date) {
          myMultiRangeCoveredIds.add(svc.id);
        }
      }
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Schedule</h1>

      {/* Upcoming assignments */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">My assignments</h2>
        {upcomingSlots.length === 0 && (
          <p className="text-sm text-slate-400">No upcoming assignments.</p>
        )}
        {upcomingSlots.map(slot => (
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
                <form action={confirmAction.bind(null, slot.id)}>
                  <button type="submit" className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg transition-colors">
                    Confirm
                  </button>
                </form>
                <form action={declineAction.bind(null, slot.id)}>
                  <button type="submit" className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors">
                    Decline
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}

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
        <ServiceUnavailabilityList
          services={allServices ?? []}
          unavailableIds={Array.from(myUnavailableIds)}
          multiRangeCoveredIds={Array.from(myMultiRangeCoveredIds)}
          rosteredServiceIds={Array.from(myRosteredServiceIds)}
        />
      </div>

      {/* Dates I'm away */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Dates I&#39;m away</h2>
        <p className="text-xs text-slate-400 mb-4">
          Add a date range and all services in that window will be marked unavailable automatically.
        </p>

        {/* Existing ranges */}
        {(myRanges ?? []).length > 0 && (
          <div className="space-y-2 mb-4">
            {(myRanges ?? []).map(r => (
              <div key={r.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0">
                <div className="flex-1">
                  <span className="text-slate-800 font-medium">
                    {new Date(r.start_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                    {" — "}
                    {new Date(r.end_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </span>
                  {r.reason && <span className="text-xs text-slate-400 ml-2">{r.reason}</span>}
                </div>
                <form action={removeRangeAction.bind(null, r.id)}>
                  <button type="submit" className="text-xs text-red-400 hover:text-red-700">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {/* Add range form */}
        <form action={addRangeAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">From</label>
              <input type="date" name="start_date" required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">To</label>
              <input type="date" name="end_date" required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>
          <input type="text" name="reason" placeholder="Reason (optional)"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20" />
          <button type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
            Mark unavailable
          </button>
        </form>
      </div>
    </div>
  );
}
