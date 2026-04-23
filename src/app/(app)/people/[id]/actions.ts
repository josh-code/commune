"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// ─── Update own contact fields (or full update for admin) ───────────────────

const contactSchema = z.object({
  phone:   z.string().max(30).optional(),
  address: z.string().max(200).optional(),
  bio:     z.string().max(500).optional(),
});

const adminProfileSchema = contactSchema.extend({
  firstName: z.string().min(1, "First name required"),
  lastName:  z.string().min(1, "Last name required"),
});

export type UpdateProfileState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function updateProfileAction(
  profileId: string,
  _prev: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const viewer = await requireUser();
  const isAdmin = viewer.role === "admin";
  const isOwn = viewer.id === profileId;

  if (!isAdmin && !isOwn) {
    return { status: "error", message: "Not authorised." };
  }

  const supabase = await createClient();

  if (isAdmin) {
    const parsed = adminProfileSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName:  formData.get("lastName"),
      phone:     formData.get("phone") ?? undefined,
      address:   formData.get("address") ?? undefined,
      bio:       formData.get("bio") ?? undefined,
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0].message };
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: parsed.data.firstName,
        last_name:  parsed.data.lastName,
        phone:      parsed.data.phone ?? null,
        address:    parsed.data.address ?? null,
        bio:        parsed.data.bio ?? null,
      })
      .eq("id", profileId);
    if (error) return { status: "error", message: error.message };
  } else {
    // Member: only contact fields
    const parsed = contactSchema.safeParse({
      phone:   formData.get("phone") ?? undefined,
      address: formData.get("address") ?? undefined,
      bio:     formData.get("bio") ?? undefined,
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0].message };
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        phone:   parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        bio:     parsed.data.bio ?? null,
      })
      .eq("id", profileId);
    if (error) return { status: "error", message: error.message };
  }

  revalidatePath(`/people/${profileId}`);
  redirect(`/people/${profileId}`);
}

// ─── Admin: update status ────────────────────────────────────────────────────

const statusValues = ["active", "on_leave", "left"] as const;

export async function updateStatusAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("Not authorised.");
  const status = formData.get("status") as string;
  if (!statusValues.includes(status as (typeof statusValues)[number])) return;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status: status as (typeof statusValues)[number] }).eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/people/${profileId}`);
  revalidatePath("/people");
}

// ─── Admin: update role ──────────────────────────────────────────────────────

const roleValues = ["member", "logistics", "admin"] as const;

export async function updateRoleAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("Not authorised.");
  if (profileId === u.id) throw new Error("Cannot change your own role.");
  const role = formData.get("role") as string;
  if (!roleValues.includes(role as (typeof roleValues)[number])) return;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role: role as (typeof roleValues)[number] }).eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/people/${profileId}`);
  revalidatePath("/people");
}

// ─── Admin: add team membership ──────────────────────────────────────────────
// NOTE: Team membership is now managed via team_member_positions (requires a
// position_id). Direct team-only assignment is handled through the rostering UI.

export async function addTeamAction(
  _profileId: string,
  _formData: FormData,
): Promise<void> {
  // No-op: team assignment now requires a position (see rostering feature).
}

// ─── Admin: remove team membership ──────────────────────────────────────────

export async function removeTeamAction(
  profileId: string,
  formData: FormData,
): Promise<void> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("Not authorised.");
  const teamId = formData.get("teamId") as string;
  if (!teamId) return;

  const supabase = await createClient();
  await supabase
    .from("team_member_positions")
    .delete()
    .eq("profile_id", profileId)
    .eq("team_id", teamId);
  revalidatePath(`/people/${profileId}`);
}

// ─── Admin: remove member (sets status to left) ──────────────────────────────

export async function removeMemberAction(profileId: string): Promise<void> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("Not authorised.");
  if (profileId === u.id) throw new Error("Cannot remove yourself.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status: "left" }).eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/people/${profileId}`);
  revalidatePath("/people");
  redirect("/people");
}
