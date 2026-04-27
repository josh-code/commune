"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createTeamAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const name  = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string)?.trim() || "#6366f1";

  if (!name) return;

  const supabase = await createClient();
  const { data: team, error } = await supabase
    .from("teams")
    .insert({ name, color })
    .select("id")
    .single();

  if (error || !team) return;

  redirect(`/admin/teams/${team.id}`);
}
