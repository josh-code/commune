"use server";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteToken } from "@/lib/invites";
import type { CsvRow } from "@/lib/csv";

export type ImportResult = {
  created: number;
  skipped: string[];
  results: Array<{ name: string; email: string; inviteUrl: string }>;
  errors: Array<{ email: string; message: string }>;
};

export async function bulkImportAction(formData: FormData): Promise<ImportResult> {
  await requireAdmin();

  const rowsJson = formData.get("rows");
  if (typeof rowsJson !== "string") {
    return { created: 0, skipped: [], results: [], errors: [{ email: "", message: "Invalid request: missing rows data" }] };
  }
  let rows: CsvRow[];
  try {
    rows = JSON.parse(rowsJson);
    if (!Array.isArray(rows)) throw new Error("Not an array");
  } catch {
    return { created: 0, skipped: [], results: [], errors: [{ email: "", message: "Invalid request: malformed rows data" }] };
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const admin = createAdminClient();

  const result: ImportResult = {
    created: 0,
    skipped: [],
    results: [],
    errors: [],
  };

  // Resolve team names → IDs (create missing teams)
  const teamNameCache = new Map<string, string>();
  const allTeamNames = [...new Set(rows.flatMap((r) => r.teams))];
  for (const name of allTeamNames) {
    const { data: existing } = await admin
      .from("teams")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (existing) {
      teamNameCache.set(name, existing.id);
    } else {
      const { data: created, error: createTeamError } = await admin
        .from("teams")
        .insert({ name })
        .select("id")
        .single();
      if (created) {
        teamNameCache.set(name, created.id);
      } else {
        result.errors.push({ email: "", message: `Could not create team "${name}": ${createTeamError?.message ?? "unknown error"}` });
      }
    }
  }

  for (const row of rows) {
    const firstName = row.name.split(" ")[0];
    const lastName  = row.name.split(" ").slice(1).join(" ") || "—";

    // Skip duplicates
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", row.email)
      .maybeSingle();
    if (existing) {
      result.skipped.push(row.email);
      continue;
    }

    // Create auth user
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email:         row.email,
        email_confirm: true,
        user_metadata: { pending_activation: true },
      });
    if (authError || !authData.user) {
      result.errors.push({ email: row.email, message: authError?.message ?? "Auth error" });
      continue;
    }

    const { token, expiresAt } = generateInviteToken();
    const { error: profileError } = await admin.from("profiles").insert({
      id:                authData.user.id,
      first_name:        firstName,
      last_name:         lastName,
      email:             row.email,
      phone:             row.phone || null,
      role:              "member",
      status:            "invited",
      invite_token:      token,
      invite_expires_at: expiresAt.toISOString(),
    });
    if (profileError) {
      result.errors.push({ email: row.email, message: profileError.message });
      continue;
    }

    // Assign teams
    const teamIds = row.teams
      .map((name) => teamNameCache.get(name))
      .filter((id): id is string => id !== undefined);
    if (teamIds.length > 0) {
      const { error: teamsError } = await admin.from("member_teams").insert(
        teamIds.map((teamId) => ({
          profile_id: authData.user.id,
          team_id:    teamId,
        })),
      );
      if (teamsError) {
        // Profile was created but teams failed — log in errors but still count as created
        result.errors.push({ email: row.email, message: `Teams not assigned: ${teamsError.message}` });
      }
    }

    result.created++;
    result.results.push({
      name: row.name,
      email: row.email,
      inviteUrl: `${appUrl}/activate/${token}`,
    });
  }

  return result;
}
