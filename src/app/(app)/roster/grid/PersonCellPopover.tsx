"use client";

import { useTransition } from "react";
import { X, AlertTriangle } from "lucide-react";
import { assignSlotAction } from "./actions";

type EligibleSlot = {
  slot_id: string;
  position_id: string;
  position_name: string;
  team_name: string;
  current_profile_id: string | null;
  current_profile_name: string | null;
};

type Props = {
  personId: string;
  personName: string;
  serviceName: string;
  serviceDate: string;
  eligibleSlots: EligibleSlot[];
  unavailable: boolean;
  onClose: () => void;
  onLocalChange: (slotId: string, profileId: string | null) => void;
};

export function PersonCellPopover({
  personId,
  personName,
  serviceName,
  serviceDate,
  eligibleSlots,
  unavailable,
  onClose,
  onLocalChange,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function assign(slotId: string, positionKey: string) {
    if (unavailable) {
      const ok = confirm(`${personName} is unavailable for this service. Assign anyway?`);
      if (!ok) return;
    }
    onLocalChange(positionKey, personId);
    startTransition(async () => {
      await assignSlotAction(slotId, personId);
    });
  }

  function override(slotId: string, positionKey: string, occupantName: string) {
    const ok = confirm(`This slot is currently assigned to ${occupantName}. Override?`);
    if (!ok) return;
    if (unavailable) {
      const ok2 = confirm(`${personName} is unavailable for this service. Assign anyway?`);
      if (!ok2) return;
    }
    onLocalChange(positionKey, personId);
    startTransition(async () => {
      await assignSlotAction(slotId, personId);
    });
  }

  function remove(slotId: string, positionKey: string) {
    onLocalChange(positionKey, null);
    startTransition(async () => {
      await assignSlotAction(slotId, null);
    });
  }

  return (
    <div
      role="dialog"
      className="absolute z-30 bg-white border border-slate-200 rounded-xl shadow-lg w-72 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-700">{personName}</div>
          <div className="text-[10px] text-slate-500">
            {serviceName} · {new Date(serviceDate + "T00:00:00").toLocaleDateString()}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Unavailable warning */}
      {unavailable && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="text-xs text-red-600">{personName} is marked unavailable for this service.</span>
        </div>
      )}

      {/* Position list */}
      <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
        {eligibleSlots.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-400">No eligible positions for this service.</li>
        ) : (
          eligibleSlots.map((slot) => {
            const isAssigned = slot.current_profile_id === personId;
            const isEmpty = slot.current_profile_id === null;
            const isOccupied = !isEmpty && !isAssigned;

            return (
              <li key={slot.slot_id} className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-800 truncate">{slot.position_name}</div>
                  <div className="text-[10px] text-slate-400">{slot.team_name}</div>
                </div>

                {isAssigned && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => remove(slot.slot_id, slot.position_id)}
                    className="shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}

                {isEmpty && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => assign(slot.slot_id, slot.position_id)}
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    Assign
                  </button>
                )}

                {isOccupied && (
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-[10px] text-slate-400 truncate max-w-[90px]">{slot.current_profile_name}</span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => override(slot.slot_id, slot.position_id, slot.current_profile_name ?? "someone else")}
                      className="text-xs text-amber-600 hover:text-amber-800 disabled:opacity-50"
                    >
                      Override
                    </button>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
