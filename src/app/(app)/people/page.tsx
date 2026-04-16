import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PeopleList, type MemberRow } from "./PeopleList";

export default async function PeoplePage() {
  const user = await requireUser();

  // Members see only their own profile
  if (user.role !== "admin") {
    redirect(`/people/${user.id}`);
  }

  const supabase = await createClient();

  const { data: members, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, status, member_teams(teams(id, name, color))")
    .neq("status", "left")
    .order("first_name");

  if (error) throw new Error(error.message);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, color")
    .order("name");

  const rows: MemberRow[] = (members ?? []).map((m) => ({
    id: m.id,
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email,
    role: m.role as MemberRow["role"],
    status: m.status as MemberRow["status"],
    teams: (m.member_teams ?? [])
      .map((mt: { teams: { id: string; name: string; color: string } | null }) => mt.teams)
      .filter((t): t is { id: string; name: string; color: string } => t !== null),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">People</h1>
        <Link
          href="/admin/invites"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Invite member
        </Link>
      </div>
      <PeopleList members={rows} teams={teams ?? []} />
    </div>
  );
}
