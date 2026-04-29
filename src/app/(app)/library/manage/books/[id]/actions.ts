"use server";

import { revalidatePath } from "next/cache";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromCoverUrl } from "@/lib/library";

function pathFor(id: string) { return `/library/manage/books/${id}`; }

export async function updateBookAction(id: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();

  const title = (formData.get("title") as string)?.trim();
  const author = (formData.get("author") as string)?.trim();
  const isbn = (formData.get("isbn") as string)?.trim() || null;
  const publisher = (formData.get("publisher") as string)?.trim() || null;
  const yearRaw = (formData.get("year_published") as string)?.trim();
  const year = yearRaw ? parseInt(yearRaw, 10) : null;
  const description = (formData.get("description") as string)?.trim() || null;
  const categoryId = (formData.get("category_id") as string)?.trim();
  const tagsRaw = (formData.get("tags") as string)?.trim() ?? "";
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const newCoverUrl = (formData.get("cover_url") as string)?.trim() || null;
  const oldCoverUrl = (formData.get("old_cover_url") as string)?.trim() || null;

  if (!title || !author || !categoryId) return;

  const supabase = await createClient();

  // Cleanup old cover if replaced
  if (oldCoverUrl && oldCoverUrl !== newCoverUrl) {
    try {
      await supabase.storage.from("book-covers").remove([storagePathFromCoverUrl(oldCoverUrl)]);
    } catch {}
  }

  await supabase
    .from("library_books")
    .update({
      title, author, isbn, publisher,
      year_published: year && !isNaN(year) ? year : null,
      description, category_id: categoryId, tags, cover_url: newCoverUrl,
    })
    .eq("id", id);

  revalidatePath(pathFor(id));
  revalidatePath(`/library/${id}`);
  revalidatePath("/library/manage/books");
}

export async function addCopyAction(bookId: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const condition = (formData.get("condition") as "good" | "damaged" | "poor") ?? "good";
  const location = (formData.get("location") as string)?.trim() || null;

  const supabase = await createClient();
  const { data: max } = await supabase
    .from("library_book_copies")
    .select("copy_number")
    .eq("book_id", bookId)
    .order("copy_number", { ascending: false })
    .limit(1);
  const next = max && max.length > 0 ? max[0].copy_number + 1 : 1;

  await supabase.from("library_book_copies").insert({
    book_id: bookId, copy_number: next, condition, location,
  });
  revalidatePath(pathFor(bookId));
}

export async function updateCopyAction(copyId: string, bookId: string, formData: FormData): Promise<void> {
  await requireLibrarianOrAdmin();
  const condition = (formData.get("condition") as "good" | "damaged" | "poor");
  const conditionNotes = (formData.get("condition_notes") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const status = (formData.get("status") as "available" | "checked_out" | "lost" | "retired");

  const supabase = await createClient();
  await supabase
    .from("library_book_copies")
    .update({ condition, condition_notes: conditionNotes, location, status })
    .eq("id", copyId);
  revalidatePath(pathFor(bookId));
}

export async function deleteCopyAction(copyId: string, bookId: string): Promise<{ error?: string }> {
  await requireLibrarianOrAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("library_loans")
    .select("id", { count: "exact", head: true })
    .eq("copy_id", copyId)
    .is("returned_at", null);
  if (count && count > 0) return { error: "Copy has an active loan." };

  const { error } = await supabase.from("library_book_copies").delete().eq("id", copyId);
  if (error) return { error: error.message };
  revalidatePath(pathFor(bookId));
  return {};
}
