"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { removeRangesAction } from "./actions";

type Range = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function UnavailabilityRangeList({ ranges }: { ranges: Range[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const allSelected = ranges.length > 0 && selected.size === ranges.length;
  const someSelected = selected.size > 0 && selected.size < ranges.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ranges.map(r => r.id)));
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    startTransition(async () => {
      await removeRangesAction([...selected]);
      setSelected(new Set());
    });
  }

  if (ranges.length === 0) return null;

  return (
    <div className="mb-4 border border-slate-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <input
          ref={selectAllRef}
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="rounded border-slate-300 text-indigo-600"
          aria-label="Select all"
        />
        <span className="text-xs text-slate-500 flex-1 select-none">
          {selected.size > 0 ? `${selected.size} of ${ranges.length} selected` : `${ranges.length} date range${ranges.length !== 1 ? "s" : ""}`}
        </span>
        {selected.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={isPending}
            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Deleting…" : `Delete ${selected.size}`}
          </button>
        )}
      </div>

      {/* Rows */}
      {ranges.map(r => (
        <label
          key={r.id}
          className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => toggle(r.id)}
            className="rounded border-slate-300 text-indigo-600 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-800">
              {formatDate(r.start_date)}
              {r.start_date !== r.end_date && ` — ${formatDate(r.end_date)}`}
            </span>
            {r.reason && (
              <span className="text-xs text-slate-400 ml-2 truncate">{r.reason}</span>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
