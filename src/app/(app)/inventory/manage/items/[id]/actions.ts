"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireLogisticsOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromUrl } from "@/lib/storage";

const PHOTO_BUCKET = "item-photos";

export async function updateItemAction(id: string, formData: FormData): Promise<void> {
  await requireLogisticsOrAdmin();

  const name              = (formData.get("name") as string)?.trim();
  const description       = (formData.get("description") as string)?.trim() || null;
  const categoryId        = formData.get("category_id") as string;
  const trackedIndividually = formData.get("tracked_individually") === "on";
  const totalQuantity     = trackedIndividually ? 1 : Math.max(1, Number(formData.get("total_quantity") ?? "1"));
  const serialNumber      = (formData.get("serial_number") as string)?.trim() || null;
  const condition         = (formData.get("condition") as "good" | "needs_repair" | "out_of_service") ?? "good";
  const conditionNotes    = (formData.get("condition_notes") as string)?.trim() || null;
  const approvalRequired  = formData.get("approval_required") === "on";
  const location          = (formData.get("location") as string)?.trim() || null;
  const isPublic          = formData.get("is_public") === "on";
  const photoUrl          = (formData.get("photo_url") as string)?.trim() || null;
  const oldPhotoUrl       = (formData.get("old_photo_url") as string)?.trim() || null;

  if (!name || !categoryId) return;

  const supabase = await createClient();
  await supabase
    .from("inventory_items")
    .update({
      name,
      description,
      category_id: categoryId,
      tracked_individually: trackedIndividually,
      total_quantity: totalQuantity,
      serial_number: serialNumber,
      condition,
      condition_notes: conditionNotes,
      approval_required: approvalRequired,
      location,
      is_public: isPublic,
      photo_url: photoUrl,
    })
    .eq("id", id);

  if (oldPhotoUrl && oldPhotoUrl !== photoUrl) {
    const oldPath = storagePathFromUrl(oldPhotoUrl, PHOTO_BUCKET);
    if (oldPath) {
      await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    }
  }

  revalidatePath(`/inventory/manage/items/${id}`);
  revalidatePath("/inventory/manage/items");
}

export async function deleteItemAction(id: string): Promise<void> {
  await requireLogisticsOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("inventory_reservations")
    .select("id", { count: "exact", head: true })
    .eq("item_id", id)
    .in("status", ["pending", "approved", "checked_out"]);

  if (count && count > 0) return;

  const { data: item } = await supabase
    .from("inventory_items")
    .select("photo_url")
    .eq("id", id)
    .single();

  await supabase.from("inventory_items").delete().eq("id", id);

  if (item?.photo_url) {
    const path = storagePathFromUrl(item.photo_url, PHOTO_BUCKET);
    if (path) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    }
  }

  redirect("/inventory/manage/items");
}
