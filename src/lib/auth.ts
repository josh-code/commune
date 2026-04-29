import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "member" | "logistics" | "librarian" | "roster_maker";
  status: "invited" | "active" | "on_leave" | "left";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, role, status")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: profile.role,
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
