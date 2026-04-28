"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { cancelOwnReservationAction, markReturnedSelfAction } from "./actions";

type Reservation = {
  id: string;
  status: "pending" | "approved" | "rejected" | "checked_out" | "returned" | "cancelled";
  start_date: string;
  end_date: string;
  quantity: number;
  notes: string | null;
  rejection_reason: string | null;
  inventory_items: { id: string; name: string } | null;
};

const STATUS_BADGE: Record<Reservation["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-slate-100 text-slate-500",
  checked_out: "bg-indigo-100 text-indigo-700",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function MyReservationsList({ reservations }: { reservations: Reservation[] }) {
  const [optimistic, cancelOptimistic] = useOptimistic(
    reservations,
    (current: Reservation[], cancelledId: string) =>
      current.map(r => r.id === cancelledId ? { ...r, status: "cancelled" as const } : r),
  );
  const [isPending, startTransition] = useTransition();

  const pending = optimistic.filter(r => r.status === "pending" || r.status === "approved");
  const active  = optimistic.filter(r => r.status === "checked_out");
  const past    = optimistic.filter(r => r.status === "returned" || r.status === "rejected" || r.status === "cancelled");

  const Card = ({ r, showCancel, showReturn }: { r: Reservation; showCancel: boolean; showReturn: boolean }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link href={r.inventory_items ? `/inventory/${r.inventory_items.id}` : "#"} className="text-sm font-medium text-slate-900 hover:text-indigo-600">
            {r.inventory_items?.name ?? "—"}
          </Link>
          <div className="text-xs text-slate-500 mt-0.5">
            {formatDate(r.start_date)} → {formatDate(r.end_date)}
            {r.quantity > 1 && ` · qty ${r.quantity}`}
          </div>
          {r.notes && <div className="text-xs text-slate-400 mt-0.5">{r.notes}</div>}
          {r.rejection_reason && <div className="text-xs text-red-500 mt-0.5">Rejected: {r.rejection_reason}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${STATUS_BADGE[r.status]}`}>
          {r.status.replace("_", " ")}
        </span>
      </div>

      {showCancel && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              cancelOptimistic(r.id);
              await cancelOwnReservationAction(r.id);
            });
          }}
          className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          Cancel
        </button>
      )}

      {showReturn && (
        <form action={markReturnedSelfAction.bind(null, r.id)} className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <select name="return_condition" defaultValue="good" className="text-xs border border-slate-200 rounded px-2 py-1">
            <option value="good">Good</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
          </select>
          <input type="text" name="return_notes" placeholder="Notes (optional)" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 min-w-0" />
          <button type="submit" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Mark returned</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Pending & approved</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">None.</p>
        ) : (
          <div className="space-y-2">
            {pending.map(r => <Card key={r.id} r={r} showCancel showReturn={false} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Currently checked out</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">None.</p>
        ) : (
          <div className="space-y-2">
            {active.map(r => <Card key={r.id} r={r} showCancel={false} showReturn />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Past</h2>
          <div className="space-y-2">
            {past.map(r => <Card key={r.id} r={r} showCancel={false} showReturn={false} />)}
          </div>
        </section>
      )}
    </div>
  );
}
