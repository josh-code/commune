"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  addCopyAction, updateCopyAction, deleteCopyAction,
} from "./actions";

type Copy = {
  id: string;
  copy_number: number;
  condition: "good" | "damaged" | "poor";
  condition_notes: string | null;
  status: "available" | "checked_out" | "lost" | "retired";
  location: string | null;
};

export function CopiesEditor({ bookId, copies }: { bookId: string; copies: Copy[] }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [opt, removeCopy] = useOptimistic(
    copies,
    (cur: Copy[], id: string) => cur.filter((c) => c.id !== id),
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="space-y-2">
        {opt.map((c) => (
          <form
            key={c.id}
            action={updateCopyAction.bind(null, c.id, bookId)}
            className="bg-white rounded-lg border border-slate-200 p-3 grid grid-cols-12 gap-2 items-center"
          >
            <span className="col-span-1 text-sm font-medium text-slate-700">#{c.copy_number}</span>
            <select name="condition" defaultValue={c.condition} className="col-span-2 text-sm border border-slate-200 rounded px-2 py-1 outline-none">
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="poor">Poor</option>
            </select>
            <select name="status" defaultValue={c.status} className="col-span-3 text-sm border border-slate-200 rounded px-2 py-1 outline-none">
              <option value="available">Available</option>
              <option value="checked_out">Checked out</option>
              <option value="lost">Lost</option>
              <option value="retired">Retired</option>
            </select>
            <input
              type="text" name="location" defaultValue={c.location ?? ""} placeholder="Location"
              className="col-span-3 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <input
              type="text" name="condition_notes" defaultValue={c.condition_notes ?? ""} placeholder="Notes"
              className="col-span-2 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <button type="submit" className="col-span-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm(`Delete copy #${c.copy_number}?`)) return;
                setError(null);
                startTransition(async () => {
                  removeCopy(c.id);
                  const res = await deleteCopyAction(c.id, bookId);
                  if (res?.error) setError(res.error);
                });
              }}
              className="col-span-12 sm:col-auto text-xs text-red-400 hover:text-red-700 sm:hidden"
            >
              Delete
            </button>
          </form>
        ))}
      </div>

      <form action={addCopyAction.bind(null, bookId)} className="bg-white border border-dashed border-slate-300 rounded-lg p-3 grid grid-cols-12 gap-2 items-center">
        <span className="col-span-3 text-xs text-slate-500">Add copy</span>
        <select name="condition" defaultValue="good" className="col-span-3 text-sm border border-slate-200 rounded px-2 py-1 outline-none">
          <option value="good">Good</option>
          <option value="damaged">Damaged</option>
          <option value="poor">Poor</option>
        </select>
        <input
          type="text" name="location" placeholder="Location"
          className="col-span-4 text-sm border border-slate-200 rounded px-2 py-1 outline-none"
        />
        <button type="submit" className="col-span-2 text-xs font-medium bg-indigo-600 text-white rounded px-2 py-1.5 hover:bg-indigo-700">
          Add
        </button>
      </form>
    </div>
  );
}
