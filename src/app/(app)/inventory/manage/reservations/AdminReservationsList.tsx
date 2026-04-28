"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  approveReservationAction,
  rejectReservationAction,
  checkoutReservationAction,
  returnReservationAction,
} from "./actions";

type Reservation = {
  id: string;
  status: "pending" | "approved" | "rejected" | "checked_out" | "returned" | "cancelled";
  start_date: string;
  end_date: string;
  quantity: number;
  notes: string | null;
  rejection_reason: string | null;
  inventory_items: { id: string; name: string } | null;
  profiles: { first_name: string; last_name: string } | null;
};

const STATUS_BADGE: Record<Reservation["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-slate-100 text-slate-500",
  checked_out: "bg-indigo-100 text-indigo-700",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function AdminReservationsList({ reservations }: { reservations: Reservation[] }) {
  const [optimistic, updateOptimistic] = useOptimistic(
    reservations,
    (current: Reservation[], update: { id: string; status: Reservation["status"] }) =>
      current.map(r => r.id === update.id ? { ...r, status: update.status } : r),
  );
  const [isPending, startTransition] = useTransition();
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const pending  = optimistic.filter(r => r.status === "pending");
  const upcoming = optimistic.filter(r => r.status === "approved");
  const active   = optimistic.filter(r => r.status === "checked_out" && r.end_date >= today);
  const overdue  = optimistic.filter(r => r.status === "checked_out" && r.end_date < today);
  const recent   = optimistic.filter(r => ["returned", "rejected", "cancelled"].includes(r.status)).slice(0, 20);

  const Card = ({ r, action }: { r: Reservation; action: "approve" | "checkout" | "return" | "none" }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900">{r.inventory_items?.name ?? "—"}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "—"} · {formatDate(r.start_date)} → {formatDate(r.end_date)}
            {r.quantity > 1 && ` · qty ${r.quantity}`}
          </div>
          {r.notes && <div className="text-xs text-slate-400 mt-0.5">{r.notes}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${STATUS_BADGE[r.status]}`}>
          {r.status.replace("_", " ")}
        </span>
      </div>

      {action === "approve" && (
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              updateOptimistic({ id: r.id, status: "approved" });
              await approveReservationAction(r.id);
            })}
            className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-lg disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setShowRejectFor(r.id)}
            className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg"
          >
            Reject
          </button>
        </div>
      )}

      {showRejectFor === r.id && (
        <form
          action={async (fd: FormData) => {
            startTransition(async () => {
              updateOptimistic({ id: r.id, status: "rejected" });
              await rejectReservationAction(r.id, fd);
              setShowRejectFor(null);
            });
          }}
          className="flex items-center gap-2 pt-2 border-t border-slate-100"
        >
          <input type="text" name="rejection_reason" placeholder="Reason (optional)" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1" />
          <button type="submit" className="text-xs font-medium text-red-700">Confirm reject</button>
          <button type="button" onClick={() => setShowRejectFor(null)} className="text-xs text-slate-500">Cancel</button>
        </form>
      )}

      {action === "checkout" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            updateOptimistic({ id: r.id, status: "checked_out" });
            await checkoutReservationAction(r.id);
          })}
          className="text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg disabled:opacity-50"
        >
          Mark checked out
        </button>
      )}

      {action === "return" && (
        <form action={returnReservationAction.bind(null, r.id)} className="flex items-center gap-2 pt-2 border-t border-slate-100">
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

  function Section({ title, rs, action }: { title: string; rs: Reservation[]; action: "approve" | "checkout" | "return" | "none" }) {
    if (rs.length === 0) return (
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">{title}</h2>
        <p className="text-sm text-slate-400">None.</p>
      </section>
    );
    return (
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">{title}</h2>
        <div className="space-y-2">
          {rs.map(r => <Card key={r.id} r={r} action={action} />)}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Pending approval" rs={pending} action="approve" />
      <Section title="Upcoming (approved)" rs={upcoming} action="checkout" />
      <Section title="Currently checked out" rs={active} action="return" />
      {overdue.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-700 mb-2">Overdue</h2>
          <div className="space-y-2">
            {overdue.map(r => <Card key={r.id} r={r} action="return" />)}
          </div>
        </section>
      )}
      <Section title="Recent activity" rs={recent} action="none" />
    </div>
  );
}
