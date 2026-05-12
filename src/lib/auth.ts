import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role, TeamSlug } from "@/lib/nav";

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  teams: TeamSlug[];
  status: "invited" | "active" | "on_leave" | "left";
};

export const has = (u: SessionUser, ...roles: Role[]): boolean =>
  roles.some(r => u.roles.includes(r));

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, roles, status")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { data: teamRows } = await supabase
    .from("team_member_positions")
    .select("teams!inner(name)")
    .eq("profile_id", user.id);

  const teams = [...new Set(
    (teamRows ?? [])
      .map(r => (r.teams as unknown as { name: string }).name.toLowerCase())
  )] as TeamSlug[];

  return {
    id: user.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    roles: profile.roles as Role[],
    teams,
    status: profile.status,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function requireLogisticsOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "logistics") redirect("/dashboard");
  return user;
}

export async function requireHospitalityOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_hospitality_or_admin");
  if (!data) redirect("/dashboard");
  return user;
}

export async function requireWorshipWriteAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_worship_write_allowed");
  if (!data) redirect("/dashboard");
  return user;
}

export type RosterGridAccess = {
  user: SessionUser;
  canEditAll: boolean;
  editableTeamIds: string[];
};

export async function requireRosterGridAccess(): Promise<RosterGridAccess> {
  const user = await requireUser();
  const supabase = await createClient();

  if (user.role === "admin" || user.role === "roster_maker") {
    return { user, canEditAll: true, editableTeamIds: [] };
  }

  const { data: leaderRows } = await supabase
    .from("team_member_positions")
    .select("team_id")
    .eq("profile_id", user.id)
    .eq("team_role", "leader");

  const editableTeamIds = [...new Set((leaderRows ?? []).map((r) => r.team_id))];

  if (editableTeamIds.length === 0) redirect("/dashboard");

  return { user, canEditAll: false, editableTeamIds };
}

export async function requireBriefViewAccess(serviceId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;

  const supabase = await createClient();
  const [{ data: media }, { data: speaker }] = await Promise.all([
    supabase.rpc("is_media_or_admin"),
    supabase.rpc("is_service_speaker", { sid: serviceId }),
  ]);

  if (!media && !speaker) redirect("/dashboard");
  return user;
}

export async function requireBriefEditAccess(serviceId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;

  const supabase = await createClient();
  const { data: speaker } = await supabase.rpc("is_service_speaker", { sid: serviceId });
  if (!speaker) redirect("/dashboard");
  return user;
}

export async function requireLibrarianOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin" || user.role === "librarian") return user;
  redirect("/dashboard");
}
