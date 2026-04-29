"use client";

import { useState } from "react";
import { CoverUpload } from "@/components/library/CoverUpload";
import { createBookAction } from "./actions";

type Category = { id: string; name: string };

export function NewBookForm({ categories }: { categories: Category[] }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  // crypto.randomUUID is used pre-create as a temp dir name in the bucket.
  // Once the book is created, future uploads will use the real book id.
  const tempBookId = useState(() => crypto.randomUUID())[0];

  return (
    <form
      action={async (formData) => {
        if (coverUrl) formData.set("cover_url", coverUrl);
        await createBookAction(formData);
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Title</label>
          <input type="text" name="title" required autoFocus className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Author</label>
          <input type="text" name="author" required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">ISBN (optional)</label>
          <input type="text" name="isbn" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Year (optional)</label>
          <input type="number" name="year_published" min="1" max="2100" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Publisher (optional)</label>
          <input type="text" name="publisher" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-medium text-slate-600">Description (optional)</label>
          <textarea name="description" rows={3} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select name="category_id" required className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Tags (comma-separated)</label>
          <input type="text" name="tags" placeholder="e.g. theology, history" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Cover (optional)</label>
        <CoverUpload bookId={tempBookId} onUpload={setCoverUrl} />
      </div>

      <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">First copy condition</label>
          <select name="condition" defaultValue="good" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none">
            <option value="good">Good</option>
            <option value="damaged">Damaged</option>
            <option value="poor">Poor</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Location (optional)</label>
          <input type="text" name="location" placeholder="e.g. Shelf A3" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
        </div>
      </div>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
        Add book
      </button>
    </form>
  );
}
