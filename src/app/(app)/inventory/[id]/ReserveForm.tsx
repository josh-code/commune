"use client";

import { useState } from "react";
import { createReservationAction } from "./actions";

type Props = {
  itemId: string;
  trackedIndividually: boolean;
  maxQuantity: number;
  approvalRequired: boolean;
};

export function ReserveForm({ itemId, trackedIndividually, maxQuantity, approvalRequired }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  return (
    <form action={createReservationAction.bind(null, itemId)} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input
            type="date"
            name="start_date"
            required
            min={today}
            value={start}
            onChange={e => {
              setStart(e.target.value);
              if (end < e.target.value) setEnd(e.target.value);
            }}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input
            type="date"
            name="end_date"
            required
            min={start}
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {!trackedIndividually && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Quantity (max {maxQuantity})</label>
          <input
            type="number"
            name="quantity"
            min="1"
            max={maxQuantity}
            defaultValue="1"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Reason (optional)</label>
        <input
          type="text"
          name="notes"
          placeholder="e.g. Youth meeting"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
        {approvalRequired ? "Request" : "Reserve"}
      </button>
      {approvalRequired && (
        <p className="text-xs text-slate-500 text-center">Logistics will review and confirm.</p>
      )}
    </form>
  );
}
