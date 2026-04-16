"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInviteExpired } from "@/lib/invites";

const schema = z.object({
  token: z.string().uuid("Invalid activation token"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

export type ActivationState = {
  status: "idle" | "success" | "error";
  message?: string;
  email?: string;
};

export async function activateAction(
  _prev: ActivationState,
  formData: FormData,
): Promise<ActivationState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();

  const { data: profile, error: lookupError } = await admin
    .from("profiles")
    .select("id, email, invite_expires_at, status")
    .eq("invite_token", parsed.data.token)
    .maybeSingle();

  if (lookupError || !profile) {
    return { status: "error", message: "Invite not found or already used." };
  }
  if (profile.status === "active") {
    return { status: "error", message: "This invite has already been used." };
  }
  if (isInviteExpired(profile.invite_expires_at)) {
    return { status: "error", message: "This invite has expired." };
  }

  // Set password on the existing auth user
  const { error: pwError } = await admin.auth.admin.updateUserById(
    profile.id,
    { password: parsed.data.password },
  );
  if (pwError) {
    return { status: "error", message: pwError.message };
  }

  // Consume invite: null token, activate status
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      invite_token: null,
      invite_expires_at: null,
      status: "active",
    })
    .eq("id", profile.id);

  if (updateError) {
    return { status: "error", message: updateError.message };
  }

  return { status: "success", email: profile.email };
}
