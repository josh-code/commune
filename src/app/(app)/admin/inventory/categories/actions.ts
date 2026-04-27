"use server";

import { revalidatePath } from "next/cache";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

export async function createCategoryAction(formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();
  const name  = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string) || PRESET_COLORS[0];
  const isPublic = formData.get("is_public") === "on";
  if (!name) return;

  const supabase = await createClient();
  const { data: maxOrder } = await supabase
    .from("inventory_categories")
    .select('"order"')
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("inventory_categories").insert({
    name,
    color,
    is_public: isPublic,
    order: (maxOrder?.order ?? 0) + 1,
  });

  revalidatePath("/admin/inventory/categories");
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();
  const name  = (formData.get("name") as string)?.trim();
  const color = formData.get("color") as string;
  const isPublic = formData.get("is_public") === "on";
  if (!name || !color) return;

  const supabase = await createClient();
  await supabase
    .from("inventory_categories")
    .update({ name, color, is_public: isPublic })
    .eq("id", id);

  revalidatePath("/admin/inventory/categories");
}

export async function deleteCategoryAction(id: string): Promise<{ error?: string } | void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (count && count > 0) {
    return { error: `Category has ${count} item(s). Move or delete them first.` };
  }

  await supabase.from("inventory_categories").delete().eq("id", id);
  revalidatePath("/admin/inventory/categories");
}
