"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Send, Trash2, Check } from "lucide-react";
import { STATUS_LABELS, type HospitalityNeedStatus } from "@/lib/hospitality";
import {
  addNeedAction, deleteNeedAction, markFulfilledAction, requestOrderAction,
} from "./actions";

type CatalogItem = {
  id: string;
  name: string;
  category: { id: string; name: string };
};

type Need = {
  id: string;
  item_id: string;
  item_name: string;
  category_name: string;
  quantity: string;
  notes: string | null;
  status: HospitalityNeedStatus;
  fulfilled_by_name: string | null;
};

type Props = {
  serviceId: string;
  initialNeeds: Need[];
  catalogItems: CatalogItem[];
};

export function NeedsListEditor({ serviceId, initialNeeds, catalogItems }: Props) {
  const [optimistic, applyOp] = useOptimistic(
    initialNeeds,
    (current: Need[], op: { type: "remove"; id: string } | { type: "fulfill"; id: string }) => {
      if (op.type === "remove") return current.filter((n) => n.id !== op.id);
      return current.map((n) => (n.id === op.id ? { ...n, status: "fulfilled" as const } : n));
    },
  );
  const [, startTransition] = useTransition();
  const [requestMsg, setRequestMsg] = useState<string | null>(null);

  const grouped: Record<HospitalityNeedStatus, Need[]> = {
    needed: [],
    requested: [],
    fulfilled: [],
  };
  for (const n of optimistic) grouped[n.status].push(n);

  const needsCount = grouped.needed.length;

  const itemsByCategory = new Map<string, CatalogItem[]>();
  for (const it of catalogItems) {
    const arr = itemsByCategory.get(it.category.name) ?? [];
    arr.push(it);
    itemsByCategory.set(it.category.name, arr);
  }
  const categoryNames = [...itemsByCategory.keys()].sort();

  function handleRequest() {
    if (needsCount === 0) return;
    if (!confirm(`Request ${needsCount} item${needsCount === 1 ? "" : "s"} for ordering?`)) return;
    setRequestMsg(null);
    startTransition(async () => {
      const res = await requestOrderAction(serviceId);
      setRequestMsg(`Sent — ${res.count} item${res.count === 1 ? "" : "s"} requested.`);
    });
  }

  return (
    <div className="space-y-8">
      {requestMsg && (
        <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{requestMsg}</p>
      )}

      {/* ── Add item ─────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add item</h2>
        {catalogItems.length === 0 ? (
          <p className="text-sm text-slate-400">
            No items in the catalog yet. Add some on the <a href="/hospitality/items" className="text-indigo-600 underline">Catalog</a> page.
          </p>
        ) : (
          <form action={addNeedAction.bind(null, serviceId)} className="space-y-3">
            <select
              name="item_id" required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Choose item…</option>
              {categoryNames.map((catName) => (
                <optgroup key={catName} label={catName}>
                  {itemsByCategory.get(catName)!.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              type="text" name="quantity" placeholder='Quantity (e.g. "2 litres", "100")' required
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <input
              type="text" name="notes" placeholder="Notes (optional)"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="submit"
              className="w-full text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Add to needs list
            </button>
          </form>
        )}
      </section>

      {/* ── Request to order ─────────────────────────────────── */}
      <button
        type="button"
        onClick={handleRequest}
        disabled={needsCount === 0}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-amber-500 text-white px-4 py-3 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4" />
        Request to order ({needsCount} item{needsCount === 1 ? "" : "s"})
      </button>

      {/* ── Status groups ────────────────────────────────────── */}
      {(["needed", "requested", "fulfilled"] as const).map((status) => {
        const list = grouped[status];
        if (list.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              {STATUS_LABELS[status]} <span className="text-slate-400 font-normal">({list.length})</span>
            </h2>
            <ul className="space-y-2">
              {list.map((n) => (
                <li
                  key={n.id}
                  className={`bg-white border rounded-lg p-3 flex items-center gap-3 ${
                    n.status === "fulfilled" ? "border-slate-100 opacity-60" : "border-slate-200"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {n.item_name} <span className="text-slate-500 font-normal">· {n.quantity}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {n.category_name}
                      {n.notes && <> · {n.notes}</>}
                      {n.status === "fulfilled" && n.fulfilled_by_name && (
                        <> · by {n.fulfilled_by_name}</>
                      )}
                    </div>
                  </div>
                  {n.status !== "fulfilled" && (
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(async () => {
                          applyOp({ type: "fulfill", id: n.id });
                          await markFulfilledAction(n.id, serviceId);
                        });
                      }}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Fulfilled
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Remove "${n.item_name}"?`)) return;
                      startTransition(async () => {
                        applyOp({ type: "remove", id: n.id });
                        await deleteNeedAction(n.id, serviceId);
                      });
                    }}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {optimistic.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">No items yet — add your first one above.</p>
      )}
    </div>
  );
}
