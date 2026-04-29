"use server";

import { revalidatePath } from "next/cache";
import { requireHospitalityOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const CATALOG_PATH = "/hospitality/items";

export async function createCategoryAction(formData: FormData): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("hospitality_categories").insert({ name, created_by: user.id });
  revalidatePath(CATALOG_PATH);
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("hospitality_categories").update({ name }).eq("id", id);
  revalidatePath(CATALOG_PATH);
}

export async function deleteCategoryAction(id: string): Promise<{ error?: string }> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("hospitality_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (count && count > 0) {
    return { error: "Category is in use — remove its items first." };
  }

  const { error } = await supabase.from("hospitality_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}

export async function createItemAction(formData: FormData): Promise<void> {
  const user = await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const categoryId = (formData.get("category_id") as string)?.trim();
  if (!name || !categoryId) return;

  const supabase = await createClient();
  await supabase.from("hospitality_items").insert({
    name, category_id: categoryId, created_by: user.id,
  });
  revalidatePath(CATALOG_PATH);
}

export async function updateItemAction(id: string, formData: FormData): Promise<void> {
  await requireHospitalityOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const categoryId = (formData.get("category_id") as string)?.trim();
  if (!name || !categoryId) return;

  const supabase = await createClient();
  await supabase
    .from("hospitality_items")
    .update({ name, category_id: categoryId })
    .eq("id", id);
  revalidatePath(CATALOG_PATH);
}

export async function deleteItemAction(id: string): Promise<{ error?: string }> {
  await requireHospitalityOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("hospitality_needs")
    .select("id", { count: "exact", head: true })
    .eq("item_id", id);

  if (count && count > 0) {
    return { error: "Item is in use on a service's needs list — remove those entries first." };
  }

  const { error } = await supabase.from("hospitality_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}
