"use server";

import { redirect } from "next/navigation";
import { requireLibrarianOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createBookAction(formData: FormData): Promise<void> {
  const user = await requireLibrarianOrAdmin();

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
  const coverUrl = (formData.get("cover_url") as string)?.trim() || null;

  const condition = (formData.get("condition") as "good" | "damaged" | "poor") ?? "good";
  const location = (formData.get("location") as string)?.trim() || null;

  if (!title || !author || !categoryId) return;

  const supabase = await createClient();

  const { data: book, error } = await supabase
    .from("library_books")
    .insert({
      title, author, isbn, publisher,
      year_published: year && !isNaN(year) ? year : null,
      description, category_id: categoryId, tags,
      cover_url: coverUrl, created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !book) return;

  await supabase.from("library_book_copies").insert({
    book_id: book.id, copy_number: 1, condition, location,
  });

  redirect(`/library/manage/books/${book.id}`);
}
