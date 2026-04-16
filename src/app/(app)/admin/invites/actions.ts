"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteToken } from "@/lib/invites";

const schema = z.object({
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  email: z.string().email("Invalid email"),
});

export type InviteFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  inviteUrl?: string;
};

export async function sendInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const { token, expiresAt } = generateInviteToken();
  const admin = createAdminClient();

  // Check for existing profile with this email
  const { data: existing } = await admin
    .from("profiles")
    .select("id, status")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (existing && existing.status === "active") {
    return { status: "error", message: "This email already has an active account." };
  }

  if (existing) {
    // Re-invite: refresh token
    const { error } = await admin
      .from("profiles")
      .update({
        invite_token: token,
        invite_expires_at: expiresAt.toISOString(),
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        status: "invited",
      })
      .eq("id", existing.id);
    if (error) return { status: "error", message: error.message };
  } else {
    // Create placeholder auth user
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: parsed.data.email,
        email_confirm: true,
        user_metadata: { pending_activation: true },
      });
    if (authError || !authData.user) {
      return {
        status: "error",
        message: authError?.message ?? "Failed to reserve auth user",
      };
    }

    const { error } = await admin.from("profiles").insert({
      id: authData.user.id,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      role: "member",
      status: "invited",
      invite_token: token,
      invite_expires_at: expiresAt.toISOString(),
    });
    if (error) return { status: "error", message: error.message };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/activate/${token}`;

  revalidatePath("/admin/invites");
  return { status: "success", inviteUrl };
}
