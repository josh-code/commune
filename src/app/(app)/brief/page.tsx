import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeBriefStatus } from "@/lib/brief";
import { FileText } from "lucide-react";

export default async function BriefIndexPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: services }, { data: briefs }, { data: speakerSlots }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, date")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(30),
    supabase
      .from("service_briefs")
      .select("service_id, deadline, sermon_submitted_at"),
    // Speaker for each upcoming service via Preaching team's Speaker position
    supabase
      .from("roster_slots")
      .select(`
        service_id,
        profile:profile_id ( first_name, last_name ),
        team_positions!inner ( name, teams!inner ( name ) )
      `)
      .eq("team_positions.name", "Speaker")
      .eq("team_positions.teams.name", "Preaching")
      .gte("status", "unassigned"),
  ]);

  const briefByService = new Map<string, { deadline: string; sermon_submitted_at: string | null }>();
  for (const b of briefs ?? []) briefByService.set(b.service_id, b);

  const speakerByService = new Map<string, string>();
  for (const s of (speakerSlots ?? []) as any[]) {
    if (s.profile) {
      speakerByService.set(
        s.service_id,
        `${s.profile.first_name ?? ""} ${s.profile.last_name ?? ""}`.trim() || "—",
      );
    }
  }

  // Suppress unused variable warning
  void user;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Projection briefs</h1>

      {!services || services.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No upcoming services.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => {
            const b = briefByService.get(s.id);
            const speakerName = speakerByService.get(s.id) ?? "Speaker not assigned";
            const status = b
              ? computeBriefStatus({
                  sermon_submitted_at: b.sermon_submitted_at,
                  deadline: b.deadline,
                })
              : "pending";
            const date = new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
            });
            return (
              <li key={s.id}>
                <Link
                  href={`/brief/${s.id}`}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{date} · {speakerName}</div>
                  </div>
                  {status === "complete" && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Complete</span>
                  )}
                  {status === "pending" && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
                  )}
                  {status === "late" && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Late</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
