// src/app/(app)/roster/templates/new/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateDates, toDateString, generateServiceName, type TemplateConfig } from "@/lib/recurring";

export async function createTemplateAction(formData: FormData): Promise<{ error?: string }> {
  const user = await requireAdmin();

  const name        = (formData.get("name") as string)?.trim();
  const type        = (formData.get("type") as string) ?? "regular_sunday";
  const frequency   = formData.get("frequency") as string;
  const dayOfWeek   = formData.get("day_of_week")   ? Number(formData.get("day_of_week"))   : null;
  const dayOfMonth  = formData.get("day_of_month")  ? Number(formData.get("day_of_month"))  : null;
  const monthOfYear = formData.get("month_of_year") ? Number(formData.get("month_of_year")) : null;
  const count       = Number(formData.get("count") ?? "8");

  if (!name || !frequency) return { error: "Name and frequency are required." };
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
    return { error: "Invalid frequency." };
  }

  const supabase = await createClient();

  const { data: template, error: tmplError } = await supabase
    .from("service_templates")
    .insert({
      name,
      type: type as "regular_sunday" | "special_event",
      frequency: frequency as "daily" | "weekly" | "monthly" | "yearly",
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      month_of_year: monthOfYear,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (tmplError || !template) return { error: tmplError?.message ?? "Failed to create template." };

  const config: TemplateConfig = {
    frequency: frequency as TemplateConfig["frequency"],
    day_of_week: dayOfWeek,
    day_of_month: dayOfMonth,
    month_of_year: monthOfYear,
  };

  const dates = generateDates(config, new Date(), count);
  const rows = dates.map(date => ({
    name: generateServiceName(name, date),
    date: toDateString(date),
    type: type as "regular_sunday" | "special_event",
    status: "draft" as const,
    created_by: user.id,
    template_id: template.id,
  }));

  const { error: svcError } = await supabase.from("services").insert(rows);
  if (svcError) return { error: svcError.message };

  redirect("/roster/templates");
}

export async function generateMoreAction(templateId: string): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("service_templates")
    .select("name, type, frequency, day_of_week, day_of_month, month_of_year")
    .eq("id", templateId)
    .single();

  if (!template) return;

  // Find the latest existing service for this template
  const { data: latest } = await supabase
    .from("services")
    .select("date")
    .eq("template_id", templateId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fromDate = latest ? new Date(latest.date + "T00:00:00") : new Date();

  const config: TemplateConfig = {
    frequency: template.frequency as TemplateConfig["frequency"],
    day_of_week: template.day_of_week,
    day_of_month: template.day_of_month,
    month_of_year: template.month_of_year,
  };

  const dates = generateDates(config, fromDate, 8);
  const rows = dates.map(date => ({
    name: generateServiceName(template.name, date),
    date: toDateString(date),
    type: template.type as "regular_sunday" | "special_event",
    status: "draft" as const,
    created_by: user.id,
    template_id: templateId,
  }));

  await supabase.from("services").insert(rows);
  revalidatePath("/roster/templates");
}
