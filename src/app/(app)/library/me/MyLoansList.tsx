"use client";

import { useState, useTransition, useOptimistic } from "react";
import { computeOverdueDays } from "@/lib/library";
import { requestExtensionAction, cancelReservationAction } from "./actions";

type Loan = {
  id: string;
  copy_number: number;
  book_title: string;
  due_at: string;
  pending_extension: { id: string; requested_until: string } | null;
};

type Reservation = {
  id: string;
  book_id: string;
  book_title: string;
  position: number;
  notified_at: string | null;
};

type Props = {
  active: Loan[];
  reservations: Reservation[];
  history: { id: string; book_title: string; copy_number: number; checked_out_at: string; returned_at: string }[];
};

export function MyLoansList({ active, reservations, history }: Props) {
  const [extendOpen, setExtendOpen] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [optimisticRes, removeRes] = useOptimistic(
    reservations,
    (current: Reservation[], removedId: string) => current.filter((r) => r.id !== removedId),
  );

  return (
    <div className="space-y-8">
      {/* ── Active ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Active loans</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">No active loans.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((l) => {
              const overdue = computeOverdueDays(l.due_at);
              return (
                <li key={l.id} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{l.book_title}</div>
                      <div className="text-xs text-slate-500">Copy #{l.copy_number} · Due {new Date(l.due_at).toLocaleDateString()}</div>
                      {overdue > 0 && (
                        <div className="text-xs text-red-600 mt-0.5">{overdue} day{overdue === 1 ? "" : "s"} late</div>
                      )}
                      {l.pending_extension && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          Extension requested until {new Date(l.pending_extension.requested_until).toLocaleDateString()} (pending)
                        </div>
                      )}
                    </div>
                    {!l.pending_extension && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setExtendOpen(extendOpen === l.id ? null : l.id);
                          setUntil("");
                          setReason("");
                        }}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                      >
                        Request extension
                      </button>
                    )}
                  </div>

                  {extendOpen === l.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      <input
                        type="date"
                        min={new Date(new Date(l.due_at).getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)}
                        value={until}
                        onChange={(e) => setUntil(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
                      />
                      <input
                        type="text" placeholder="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!until) { setError("Pick a date."); return; }
                            const iso = new Date(until + "T23:59:59").toISOString();
                            setError(null);
                            startTransition(async () => {
                              const res = await requestExtensionAction(l.id, iso, reason || null);
                              if (res.error) setError(res.error);
                              else setExtendOpen(null);
                            });
                          }}
                          className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
                        >
                          Submit
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtendOpen(null)}
                          className="text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                      {error && <p className="text-xs text-red-500">{error}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Reservations ───────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Reservations</h2>
        {optimisticRes.length === 0 ? (
          <p className="text-sm text-slate-400">No active reservations.</p>
        ) : (
          <ul className="space-y-2">
            {optimisticRes.map((r) => (
              <li key={r.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">{r.book_title}</div>
                  <div className="text-xs text-slate-500">
                    {r.notified_at ? "Ready to pick up — see librarian" : `#${r.position} in queue`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      removeRes(r.id);
                      await cancelReservationAction(r.id);
                    });
                  }}
                  className="text-xs text-slate-500 hover:text-red-600"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── History ────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No past loans.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-slate-500 flex justify-between">
                <span>{h.book_title} · #{h.copy_number}</span>
                <span>{new Date(h.checked_out_at).toLocaleDateString()} → {new Date(h.returned_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
