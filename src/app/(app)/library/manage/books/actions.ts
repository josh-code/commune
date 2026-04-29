"use server";

import { revalidatePath } from "next/cache";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromCoverUrl } from "@/lib/library";

const CATALOG_PATH = "/library/manage/books";

export async function createCategoryAction(formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string)?.trim() || "#6366f1";
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("library_categories").insert({ name, color });
  revalidatePath(CATALOG_PATH);
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const name = (formData.get("name") as string)?.trim();
  const color = (formData.get("color") as string)?.trim() || "#6366f1";
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("library_categories").update({ name, color }).eq("id", id);
  revalidatePath(CATALOG_PATH);
}

export async function deleteCategoryAction(id: string): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();
  const { count } = await supabase
    .from("library_books")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (count && count > 0) return { error: "Category has books — move them first." };
  const { error } = await supabase.from("library_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}

export async function deleteBookAction(id: string): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  // Block if any non-returned loan exists on any copy of this book
  const { count: activeLoans } = await supabase
    .from("library_loans")
    .select("id, library_book_copies!inner(book_id)", { count: "exact", head: true })
    .is("returned_at", null)
    .eq("library_book_copies.book_id", id);
  if (activeLoans && activeLoans > 0) return { error: "Active loans on this book — return them first." };

  // Fetch cover URL to delete from storage
  const { data: book } = await supabase.from("library_books").select("cover_url").eq("id", id).single();

  if (book?.cover_url) {
    try {
      await supabase.storage.from("book-covers").remove([storagePathFromCoverUrl(book.cover_url)]);
    } catch {}
  }

  const { error } = await supabase.from("library_books").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(CATALOG_PATH);
  return {};
}
