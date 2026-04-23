// src/app/(app)/admin/teams/[id]/page.tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddPositionForm, AddMemberForm } from "./TeamForms";
import { updatePositionOrderAction, deletePositionAction, updateMemberRoleAction, removeMemberFromTeamAction } from "./actions";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: teamId } = await params;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, color")
    .eq("id", teamId)
    .single();

  if (!team) return <p className="text-sm text-slate-500">Team not found.</p>;

  const { data: positions } = await supabase
    .from("team_positions")
    .select("id, name, order")
    .eq("team_id", teamId)
    .order("order");

  const { data: members } = await supabase
    .from("team_member_positions")
    .select("profile_id, position_id, team_role, profiles(id, first_name, last_name), team_positions(name)")
    .eq("team_id", teamId);

  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("status", "active")
    .order("first_name");

  type MemberRow = {
    profile_id: string;
    position_id: string;
    team_role: string;
    profiles: { id: string; first_name: string; last_name: string } | null;
    team_positions: { name: string } | null;
  };

  return (
    <div className="max-w-2xl">
      <Link href="/admin/teams" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        ← Teams
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: team.color }} />
        <h1 className="text-xl font-semibold text-slate-900">{team.name}</h1>
      </div>

      {/* Positions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Positions</h2>
        <div className="space-y-1">
          {(positions ?? []).map((pos, i) => (
            <div key={pos.id} className="flex items-center gap-2 py-1">
              <span className="text-sm text-slate-700 flex-1">{pos.name}</span>
              <form action={updatePositionOrderAction.bind(null, teamId, pos.id, "up")}>
                <button type="submit" disabled={i === 0} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30 px-1">↑</button>
              </form>
              <form action={updatePositionOrderAction.bind(null, teamId, pos.id, "down")}>
                <button type="submit" disabled={i === (positions ?? []).length - 1} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30 px-1">↓</button>
              </form>
              <form action={async () => { "use server"; await deletePositionAction(teamId, pos.id); }}>
                <button type="submit" className="text-xs text-red-400 hover:text-red-700 px-1">Delete</button>
              </form>
            </div>
          ))}
        </div>
        <AddPositionForm teamId={teamId} />
      </div>

      {/* Members */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Members</h2>
        {(members ?? []).length === 0 && (
          <p className="text-sm text-slate-400 mb-3">No members assigned.</p>
        )}
        {(members ?? []).length > 0 && (
          <div className="space-y-2 mb-3">
            {(members as MemberRow[]).map((m) => (
              <div key={`${m.profile_id}-${m.position_id}`} className="flex items-center gap-3 text-sm py-1">
                <span className="flex-1 font-medium text-slate-800">
                  {m.profiles?.first_name} {m.profiles?.last_name}
                </span>
                <span className="text-xs text-slate-500">{m.team_positions?.name}</span>
                <form action={updateMemberRoleAction.bind(null, teamId, m.profile_id, m.position_id)}>
                  <select name="teamRole" defaultValue={m.team_role}
                    onChange={e => { const fd = new FormData(); fd.set("teamRole", e.target.value); updateMemberRoleAction(teamId, m.profile_id, m.position_id, fd); }}
                    className="text-xs border border-slate-200 rounded px-1 py-0.5">
                    <option value="member">Member</option>
                    <option value="leader">Leader</option>
                  </select>
                </form>
                <form action={async () => { "use server"; await removeMemberFromTeamAction(teamId, m.profile_id, m.position_id); }}>
                  <button type="submit" className="text-xs text-red-400 hover:text-red-700">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}
        <AddMemberForm
          teamId={teamId}
          positions={positions ?? []}
          profiles={allProfiles ?? []}
        />
      </div>
    </div>
  );
}
