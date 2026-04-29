"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { assignSlotAction } from "./actions";

type Profile = { id: string; first_name: string; last_name: string };

type Props = {
  slotId: string;
  positionName: string;
  serviceName: string;
  serviceDate: string;
  eligible: Profile[];
  unavailableIds: Set<string>;
  alreadyServingIds: Set<string>;
  currentProfileId: string | null;
  onClose: () => void;
  onLocalChange: (profileId: string | null) => void;
};

export function CellPopover({
  slotId, positionName, serviceName, serviceDate, eligible,
  unavailableIds, alreadyServingIds, currentProfileId,
  onClose, onLocalChange,
}: Props) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ql = q.trim().toLowerCase();
  const filtered = eligible
    .filter((p) => !ql || p.first_name.toLowerCase().includes(ql) || p.last_name.toLowerCase().includes(ql))
    .sort((a, b) =>
      (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name, undefined, { sensitivity: "base" }),
    );

  function pick(profileId: string | null) {
    setError(null);
    if (profileId !== null && unavailableIds.has(profileId)) {
      const ok = confirm("This person is unavailable for this service. Assign anyway?");
      if (!ok) return;
    }
    onLocalChange(profileId);
    startTransition(async () => {
      const res = await assignSlotAction(slotId, profileId);
      if (res?.error) {
        setError(res.error);
        // Revert by re-passing the previous value via parent — for simplicity we
        // just close and rely on next page revalidation.
      } else {
        onClose();
      }
    });
  }

  return (
    <div
      role="dialog"
      className="absolute z-30 bg-white border border-slate-200 rounded-xl shadow-lg w-72 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-700">{positionName}</div>
          <div className="text-[10px] text-slate-500">{serviceName} · {new Date(serviceDate + "T00:00:00").toLocaleDateString()}</div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2 border-b border-slate-100 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input
          autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…"
          className="flex-1 text-sm outline-none bg-transparent"
        />
      </div>

      <ul className="max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-400">No matches.</li>
        ) : filtered.map((p) => {
          const isUnavail = unavailableIds.has(p.id);
          const isServing = alreadyServingIds.has(p.id) && p.id !== currentProfileId;
          const isCurrent = p.id === currentProfileId;
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => pick(p.id)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                  isCurrent ? "bg-indigo-50" : "hover:bg-slate-50"
                } disabled:opacity-50`}
              >
                <span className="flex-1 text-slate-900 truncate">{p.first_name} {p.last_name}</span>
                {isUnavail && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Unavailable</span>}
                {isServing && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Already serving</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {currentProfileId && (
        <div className="px-3 py-2 border-t border-slate-100">
          <button
            type="button" disabled={isPending}
            onClick={() => pick(null)}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            Unassign
          </button>
        </div>
      )}

      {error && <p className="px-3 py-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
