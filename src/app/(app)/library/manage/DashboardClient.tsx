"use client";

import { useState, useTransition } from "react";
import {
  returnLoanAction, decideExtensionAction, sendManualReminderAction,
} from "./actions";
import { computeOverdueDays } from "@/lib/library";

type ActiveLoan = {
  id: string;
  borrower_name: string;
  book_title: string;
  copy_number: number;
  due_at: string;
  last_reminder_at: string | null;
};

type Extension = {
  id: string;
  loan_id: string;
  borrower_name: string;
  book_title: string;
  current_due_at: string;
  requested_until: string;
  reason: string | null;
};

type Props = {
  overdue: ActiveLoan[];
  active: ActiveLoan[];
  extensions: Extension[];
};

export function DashboardClient({ overdue, active, extensions }: Props) {
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState<"good" | "damaged" | "poor">("good");
  const [returnNotes, setReturnNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function renderLoan(l: ActiveLoan, isOverdue: boolean) {
    const days = computeOverdueDays(l.due_at);
    return (
      <li key={l.id} className={`bg-white border rounded-xl p-3 ${isOverdue ? "border-red-300" : "border-slate-200"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{l.book_title}</div>
            <div className="text-xs text-slate-500">{l.borrower_name} · Copy #{l.copy_number} · Due {new Date(l.due_at).toLocaleDateString()}</div>
            {isOverdue && (
              <div className="text-xs text-red-600 mt-0.5">
                {days} day{days === 1 ? "" : "s"} late
                {l.last_reminder_at && <> · Last reminded {new Date(l.last_reminder_at).toLocaleDateString()}</>}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {isOverdue && (
              <button
                type="button"
                onClick={() => startTransition(() => sendManualReminderAction(l.id))}
                className="text-xs text-amber-600 hover:text-amber-800"
              >
                Send reminder
              </button>
            )}
            <button
              type="button"
              onClick={() => { setReturnFor(l.id); setReturnCondition("good"); setReturnNotes(""); setError(null); }}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-800"
            >
              Mark returned
            </button>
          </div>
        </div>

        {returnFor === l.id && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <select value={returnCondition} onChange={(e) => setReturnCondition(e.target.value as any)} className="text-sm border border-slate-200 rounded px-2 py-1.5 outline-none">
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="poor">Poor</option>
            </select>
            <input
              type="text" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    const res = await returnLoanAction(l.id, returnCondition, returnNotes || null);
                    if (res?.error) setError(res.error);
                    else setReturnFor(null);
                  });
                }}
                className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setReturnFor(null)}
                className="text-xs text-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold text-red-700 mb-3">Overdue ({overdue.length})</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-slate-400">No overdue loans.</p>
        ) : (
          <ul className="space-y-2">{overdue.map((l) => renderLoan(l, true))}</ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Pending extensions ({extensions.length})</h2>
        {extensions.length === 0 ? (
          <p className="text-sm text-slate-400">No pending extension requests.</p>
        ) : (
          <ul className="space-y-2">
            {extensions.map((e) => (
              <li key={e.id} className="bg-white border border-amber-300 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{e.book_title}</div>
                    <div className="text-xs text-slate-500">
                      {e.borrower_name} · Current: {new Date(e.current_due_at).toLocaleDateString()} → Requested: {new Date(e.requested_until).toLocaleDateString()}
                    </div>
                    {e.reason && <div className="text-xs text-slate-600 mt-1">"{e.reason}"</div>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startTransition(async () => { await decideExtensionAction(e.id, "approved", null); })}
                      className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = prompt("Reason for rejection (optional)?") ?? null;
                        startTransition(async () => { await decideExtensionAction(e.id, "rejected", reason || null); });
                      }}
                      className="text-xs font-medium border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Active loans ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">No active loans.</p>
        ) : (
          <ul className="space-y-2">{active.map((l) => renderLoan(l, false))}</ul>
        )}
      </section>
    </div>
  );
}
