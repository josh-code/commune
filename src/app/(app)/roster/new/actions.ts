// src/app/(app)/roster/new/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createServiceAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const date = formData.get("date") as string;
  const type = (formData.get("type") as string) ?? "regular_sunday";

  if (!name || !date) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({ name, date, type: type as "regular_sunday" | "special_event", created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/roster/${data.id}`);
}
