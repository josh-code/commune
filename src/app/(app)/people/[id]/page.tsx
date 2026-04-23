import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { StatusForm, RoleForm, RemoveTeamForm, AddTeamForm, EditProfileForm, RemoveMemberForm } from "./ProfileForms";

const AVATAR_COLORS = [
  "bg-indigo-500", "bg-amber-500", "bg-pink-500",
  "bg-emerald-500", "bg-violet-500", "bg-orange-500",
];
function avatarColor(id: string): string {
  const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  invited:  "bg-blue-100 text-blue-700",
  on_leave: "bg-yellow-100 text-yellow-700",
  left:     "bg-slate-100 text-slate-500",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Active", invited: "Invited", on_leave: "On leave", left: "Left",
};

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; mode?: string }>;
}) {
  const [{ id }, { tab = "details", mode }, viewer] = await Promise.all([
    params,
    searchParams,
    requireUser(),
  ]);

  // Members can only see their own profile
  if (viewer.role !== "admin" && id !== viewer.id) {
    redirect(`/people/${viewer.id}`);
  }

  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, status, phone, address, bio, created_at")
    .eq("id", id)
    .single();

  if (error || !profile) redirect("/people");

  const { data: memberTeams } = await supabase
    .from("team_member_positions")
    .select("team_id, teams(id, name, color)")
    .eq("profile_id", id);

  const { data: allTeams } = await supabase
    .from("teams")
    .select("id, name, color")
    .order("name");

  // Deduplicate by team id (a member can have multiple positions in the same team)
  const assignedTeamIds = new Set<string>(
    (memberTeams ?? [])
      .map((mt) => mt.teams?.id)
      .filter((x): x is string => x != null),
  );
  const assignedTeams = Array.from(
    new Map(
      (memberTeams ?? [])
        .map((mt) => mt.teams)
        .filter((t): t is { id: string; name: string; color: string } => t != null)
        .map((t) => [t.id, t]),
    ).values(),
  );

  const isAdmin = viewer.role === "admin";
  const isOwnProfile = viewer.id === id;
  const canEdit = isAdmin || isOwnProfile;

  const tabs = ["details", "teams", "history"] as const;

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <Link
        href="/people"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4"
      >
        ← People
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="p-6 flex items-center gap-5">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0",
              avatarColor(profile.id),
            )}
          >
            {(profile.first_name?.[0] ?? "?")}{(profile.last_name?.[0] ?? "?")}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">
              {profile.first_name} {profile.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 capitalize">
                {profile.role}
              </span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  STATUS_STYLES[profile.status],
                )}
              >
                {STATUS_LABELS[profile.status]}
              </span>
            </div>
          </div>
          {canEdit && (
            <Link
              href={`/people/${id}?mode=edit`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Edit
            </Link>
          )}
        </div>

        {/* Tab bar */}
        <div className="border-t border-slate-200">
          <nav className="flex px-6">
            {tabs.map((t) => (
              <Link
                key={t}
                href={`/people/${id}${t !== "details" ? `?tab=${t}` : ""}`}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 -mb-px capitalize transition-colors",
                  tab === t
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-900",
                )}
              >
                {t}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Edit form (shown when mode=edit) */}
      {mode === "edit" && canEdit && (
        <EditProfileForm
          profile={profile}
          isAdmin={isAdmin}
          profileId={id}
        />
      )}

      {/* Tab content */}
      {tab === "details" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone ?? "—"} />
          <Field label="Address" value={profile.address ?? "—"} />
          <Field label="Bio" value={profile.bio ?? "—"} />
          <Field
            label="Joined"
            value={new Date(profile.created_at).toLocaleDateString("en-AU", {
              month: "long",
              year: "numeric",
            })}
          />

          {/* Admin-only: status + role */}
          {isAdmin && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Admin actions
              </p>
              <StatusForm profileId={id} currentStatus={profile.status} />
              <RoleForm profileId={id} currentRole={profile.role} />
              <RemoveMemberForm profileId={id} />
            </div>
          )}
        </div>
      )}

      {tab === "teams" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Teams</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {assignedTeams.length === 0 && (
              <p className="text-sm text-slate-400">No teams assigned.</p>
            )}
            {assignedTeams.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full bg-indigo-50 text-indigo-700"
              >
                {t.name}
                {isAdmin && <RemoveTeamForm profileId={id} teamId={t.id} />}
              </span>
            ))}
          </div>
          {isAdmin && (
            <AddTeamForm
              profileId={id}
              allTeams={allTeams ?? []}
              assignedTeamIds={assignedTeamIds}
            />
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-400">
            Roster history will appear here once rostering is set up (Plan 3).
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}
