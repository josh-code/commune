"use client";

import { useState } from "react";
import { CoverUpload } from "@/components/library/CoverUpload";
import { updateBookAction } from "./actions";

type Category = { id: string; name: string };

type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  year_published: number | null;
  description: string | null;
  category_id: string;
  tags: string[];
  cover_url: string | null;
};

export function EditBookForm({ book, categories }: { book: Book; categories: Category[] }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(book.cover_url);

  return (
    <form
      action={async (formData) => {
        if (coverUrl !== null) formData.set("cover_url", coverUrl);
        else formData.set("cover_url", "");
        formData.set("old_cover_url", book.cover_url ?? "");
        await updateBookAction(book.id, formData);
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Title</label>
          <input type="text" name="title" defaultValue={book.title} required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Author</label>
          <input type="text" name="author" defaultValue={book.author} required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">ISBN</label>
          <input type="text" name="isbn" defaultValue={book.isbn ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Year</label>
          <input type="number" name="year_published" defaultValue={book.year_published ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Publisher</label>
          <input type="text" name="publisher" defaultValue={book.publisher ?? ""} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Description</label>
          <textarea name="description" defaultValue={book.description ?? ""} rows={3} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" defaultValue={book.category_id} required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Tags</label>
          <input type="text" name="tags" defaultValue={book.tags.join(", ")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Cover</label>
        <CoverUpload bookId={book.id} initialUrl={book.cover_url} onUpload={setCoverUrl} />
      </div>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
        Save
      </button>
    </form>
  );
}
