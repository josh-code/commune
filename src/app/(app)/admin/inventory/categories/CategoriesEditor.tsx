"use client";

import { useOptimistic, useState, useTransition } from "react";
import { deleteCategoryAction, updateCategoryAction } from "./actions";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#f43f5e", "#a855f7"];

type Category = { id: string; name: string; color: string; is_public: boolean; order: number };

export function CategoriesEditor({ categories }: { categories: Category[] }) {
  const [optimistic, setOptimistic] = useOptimistic(
    categories,
    (current: Category[], removedId: string) => current.filter(c => c.id !== removedId),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (optimistic.length === 0) {
    return <p className="text-sm text-slate-400">No categories yet — add one below.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {optimistic.map(c => (
        <form
          key={c.id}
          action={updateCategoryAction.bind(null, c.id)}
          className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
        >
          <input type="color" name="color" defaultValue={c.color} className="w-8 h-8 rounded cursor-pointer flex-shrink-0" list={`presets-${c.id}`} />
          <datalist id={`presets-${c.id}`}>
            {PRESET_COLORS.map(p => <option key={p} value={p} />)}
          </datalist>
          <input
            type="text"
            name="name"
            defaultValue={c.name}
            required
            className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" name="is_public" defaultChecked={c.is_public} className="rounded border-slate-300 text-indigo-600" />
            Public
          </label>
          <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">Save</button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm(`Delete "${c.name}"?`)) return;
              setError(null);
              startTransition(async () => {
                setOptimistic(c.id);
                const res = await deleteCategoryAction(c.id);
                if (res && "error" in res && res.error) setError(res.error);
              });
            }}
            className="text-xs text-red-400 hover:text-red-700 px-2 py-1 disabled:opacity-50"
          >
            Delete
          </button>
        </form>
      ))}
    </div>
  );
}
