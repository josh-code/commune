"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  createCategoryAction, updateCategoryAction, deleteCategoryAction,
  createItemAction, updateItemAction, deleteItemAction,
} from "./actions";

type Category = { id: string; name: string };
type Item = { id: string; name: string; category_id: string };

export function CatalogEditor({
  categories,
  items,
}: {
  categories: Category[];
  items: Item[];
}) {
  const [optimisticCats, removeCat] = useOptimistic(
    categories,
    (current: Category[], removedId: string) => current.filter((c) => c.id !== removedId),
  );
  const [optimisticItems, removeItem] = useOptimistic(
    items,
    (current: Item[], removedId: string) => current.filter((i) => i.id !== removedId),
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const itemsByCategory = new Map<string, Item[]>();
  for (const it of optimisticItems) {
    const arr = itemsByCategory.get(it.category_id) ?? [];
    arr.push(it);
    itemsByCategory.set(it.category_id, arr);
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* ── Categories ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Categories</h2>

        <div className="space-y-2">
          {optimisticCats.map((c) => (
            <form
              key={c.id}
              action={updateCategoryAction.bind(null, c.id)}
              className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
            >
              <input
                type="text" name="name" defaultValue={c.name} required
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">
                Save
              </button>
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
            type="text" name="name" placeholder="New category name" required
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Add category
          </button>
        </form>
      </section>

      {/* ── Items grouped by category ────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Items</h2>

        {optimisticCats.length === 0 ? (
          <p className="text-sm text-slate-400">Add a category first.</p>
        ) : (
          <div className="space-y-6">
            {optimisticCats.map((c) => {
              const itemsInCat = itemsByCategory.get(c.id) ?? [];
              return (
                <div key={c.id}>
                  <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{c.name}</h3>
                  <div className="space-y-2">
                    {itemsInCat.map((it) => (
                      <form
                        key={it.id}
                        action={updateItemAction.bind(null, it.id)}
                        className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
                      >
                        <input
                          type="text" name="name" defaultValue={it.name} required
                          className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <select
                          name="category_id" defaultValue={it.category_id}
                          className="text-sm border border-slate-200 rounded px-2 py-1 outline-none"
                        >
                          {optimisticCats.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                          ))}
                        </select>
                        <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`Delete "${it.name}"?`)) return;
                            setError(null);
                            startTransition(async () => {
                              removeItem(it.id);
                              const res = await deleteItemAction(it.id);
                              if (res?.error) setError(res.error);
                            });
                          }}
                          className="text-xs text-red-400 hover:text-red-700 px-2 py-1"
                        >
                          Delete
                        </button>
                      </form>
                    ))}

                    <form action={createItemAction} className="flex items-center gap-2">
                      <input
                        type="text" name="name" placeholder={`Add item to ${c.name}`} required
                        className="flex-1 text-sm border border-dashed border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-solid focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <input type="hidden" name="category_id" value={c.id} />
                      <button
                        type="submit"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 px-2"
                      >
                        +
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
