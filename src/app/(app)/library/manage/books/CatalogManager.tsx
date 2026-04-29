"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import {
  createCategoryAction, updateCategoryAction, deleteCategoryAction,
  deleteBookAction,
} from "./actions";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

type Category = { id: string; name: string; color: string };
type Book = { id: string; title: string; author: string; category_id: string };

export function CatalogManager({ categories, books }: { categories: Category[]; books: Book[] }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optCats, removeCat] = useOptimistic(
    categories,
    (cur: Category[], id: string) => cur.filter((c) => c.id !== id),
  );
  const [optBooks, removeBook] = useOptimistic(
    books,
    (cur: Book[], id: string) => cur.filter((b) => b.id !== id),
  );

  const booksByCat = new Map<string, Book[]>();
  for (const b of optBooks) {
    const arr = booksByCat.get(b.category_id) ?? [];
    arr.push(b);
    booksByCat.set(b.category_id, arr);
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Categories</h2>
        <div className="space-y-2">
          {optCats.map((c) => (
            <form
              key={c.id}
              action={updateCategoryAction.bind(null, c.id)}
              className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
            >
              <input
                type="color" name="color" defaultValue={c.color}
                className="w-8 h-8 rounded cursor-pointer flex-shrink-0"
                list={`presets-${c.id}`}
              />
              <datalist id={`presets-${c.id}`}>
                {PRESET_COLORS.map((p) => <option key={p} value={p} />)}
              </datalist>
              <input
                type="text" name="name" defaultValue={c.name} required
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
              />
              <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">Save</button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Delete "${c.name}"?`)) return;
                  setError(null);
                  startTransition(async () => {
                    removeCat(c.id);
                    const res = await deleteCategoryAction(c.id);
                    if (res?.error) setError(res.error);
                  });
                }}
                className="text-xs text-red-400 hover:text-red-700 px-2 py-1"
              >
                Delete
              </button>
            </form>
          ))}
        </div>
        <form action={createCategoryAction} className="mt-3 flex items-center gap-2">
          <input
            type="color" name="color" defaultValue="#6366f1"
            className="w-8 h-8 rounded cursor-pointer flex-shrink-0"
          />
          <input
            type="text" name="name" placeholder="New category name" required
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
          />
          <button
            type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700"
          >
            Add category
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Books</h2>
          <Link
            href="/library/manage/books/new"
            className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            + New book
          </Link>
        </div>

        {optCats.length === 0 ? (
          <p className="text-sm text-slate-400">Add a category first.</p>
        ) : (
          <div className="space-y-6">
            {optCats.map((c) => {
              const list = booksByCat.get(c.id) ?? [];
              return (
                <div key={c.id}>
                  <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{c.name}</h3>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400">No books in this category.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((b) => (
                        <li key={b.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
                          <Link href={`/library/manage/books/${b.id}`} className="flex-1 text-sm text-slate-900 hover:text-indigo-600 truncate">
                            {b.title} <span className="text-xs text-slate-500">— {b.author}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm(`Delete "${b.title}"?`)) return;
                              setError(null);
                              startTransition(async () => {
                                removeBook(b.id);
                                const res = await deleteBookAction(b.id);
                                if (res?.error) setError(res.error);
                              });
                            }}
                            className="text-xs text-red-400 hover:text-red-700 px-2"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
