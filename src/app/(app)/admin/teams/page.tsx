// src/app/(app)/admin/teams/page.tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TeamsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, color")
    .order("name");

  // Count positions and members per team
  const { data: positionCounts } = await supabase
    .from("team_positions")
    .select("team_id");

  const { data: memberCounts } = await supabase
    .from("team_member_positions")
    .select("team_id, profile_id");

  const posByTeam = new Map<string, number>();
  (positionCounts ?? []).forEach(p => {
    posByTeam.set(p.team_id, (posByTeam.get(p.team_id) ?? 0) + 1);
  });

  // Unique members per team
  const membersByTeam = new Map<string, Set<string>>();
  (memberCounts ?? []).forEach(m => {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, new Set());
    membersByTeam.get(m.team_id)!.add(m.profile_id);
  });

  return (
    <div>
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">← Admin</Link>
      <div className="flex items-center justify-between mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Teams</h1>
        <Link
          href="/admin/teams/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + New team
        </Link>
      </div>
      {(teams ?? []).length === 0 && (
        <p className="text-sm text-slate-400">
          No teams yet. <Link href="/admin/teams/new" className="text-indigo-600 hover:text-indigo-800">Create one →</Link>
        </p>
      )}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {(teams ?? []).map((team) => (
          <div key={team.id} className="flex items-center gap-4 px-5 py-4">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: team.color }}
            />
            <span className="flex-1 font-medium text-slate-900 text-sm">{team.name}</span>
            <span className="text-xs text-slate-500">
              {posByTeam.get(team.id) ?? 0} positions
            </span>
            <span className="text-xs text-slate-500">
              {membersByTeam.get(team.id)?.size ?? 0} members
            </span>
            <Link
              href={`/admin/teams/${team.id}`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Manage →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
