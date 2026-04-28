"use client";

import Link from "next/link";
import { useState } from "react";

type Category = { id: string; name: string; color: string };
type Item = {
  id: string;
  name: string;
  category_id: string;
  tracked_individually: boolean;
  total_quantity: number;
  condition: "good" | "needs_repair" | "out_of_service";
  is_public: boolean;
};

const CONDITION_BADGE: Record<Item["condition"], string> = {
  good: "bg-green-100 text-green-700",
  needs_repair: "bg-amber-100 text-amber-700",
  out_of_service: "bg-red-100 text-red-700",
};

export function ItemsList({ items, categories }: { items: Item[]; categories: Category[] }) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);

  const catById = new Map(categories.map(c => [c.id, c]));

  const filtered = items.filter(i => {
    if (categoryId && i.category_id !== categoryId) return false;
    if (showHiddenOnly && i.is_public) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          className="flex-1 min-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showHiddenOnly} onChange={e => setShowHiddenOnly(e.target.checked)} className="rounded border-slate-300 text-indigo-600" />
          Hidden only
        </label>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-400">No items match.</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filtered.map(i => {
          const c = catById.get(i.category_id);
          return (
            <Link key={i.id} href={`/inventory/manage/items/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
              {c && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />}
              <span className="flex-1 text-sm font-medium text-slate-900">{i.name}</span>
              {!i.is_public && <span className="text-xs text-slate-400">hidden</span>}
              <span className="text-xs text-slate-500">
                {i.tracked_individually ? "1 unit" : `${i.total_quantity} avail.`}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${CONDITION_BADGE[i.condition]}`}>
                {i.condition.replace("_", " ")}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
