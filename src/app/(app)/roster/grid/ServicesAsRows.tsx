"use client";

import { useOptimistic, useState } from "react";
import { CellPopover } from "./CellPopover";
import { cellKey } from "@/lib/roster-grid";
import type { GridData } from "./RosterGrid";

type Props = {
  data: GridData;
  visibleTeams: GridData["teams"];
  visiblePositions: GridData["positions"];
  editMode: boolean;
  canEditAll: boolean;
  editableTeamIds: string[];
};

type SlotChange = { key: string; profile_id: string | null };

export function ServicesAsRows({
  data, visibleTeams, visiblePositions, editMode, canEditAll, editableTeamIds,
}: Props) {
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);

  const [optSlots, applySlotChange] = useOptimistic(
    data.slots,
    (current: GridData["slots"], op: SlotChange) => {
      const existing = current[op.key];
      if (!existing) return current;
      return {
        ...current,
        [op.key]: { ...existing, profile_id: op.profile_id },
      };
    },
  );

  const profilesById = new Map(data.profiles.map((p) => [p.id, p]));

  // Group positions by team for the headers
  const positionsByTeam = new Map<string, GridData["positions"]>();
  for (const p of visiblePositions) {
    const arr = positionsByTeam.get(p.team_id) ?? [];
    arr.push(p);
    positionsByTeam.set(p.team_id, arr);
  }

  function canEditTeam(teamId: string) {
    return canEditAll || editableTeamIds.includes(teamId);
  }

  function alreadyServingIds(serviceId: string, currentSlotKey: string): Set<string> {
    const ids = new Set<string>();
    for (const p of data.positions) {
      const k = cellKey(serviceId, p.id);
      if (k === currentSlotKey) continue;
      const pid = optSlots[k]?.profile_id;
      if (pid) ids.add(pid);
    }
    return ids;
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-slate-600 font-medium" rowSpan={2}>
              Service
            </th>
            {visibleTeams.map((t) => {
              const list = positionsByTeam.get(t.id) ?? [];
              if (list.length === 0) return null;
              return (
                <th
                  key={t.id}
                  className="border-b border-l border-slate-200 px-3 py-1 text-white font-medium"
                  colSpan={list.length}
                  style={{ backgroundColor: t.color }}
                >
                  {t.name}
                </th>
              );
            })}
          </tr>
          <tr>
            {visibleTeams.flatMap((t) =>
              (positionsByTeam.get(t.id) ?? []).map((p) => (
                <th
                  key={p.id}
                  className="border-b border-l border-slate-200 px-2 py-1 bg-slate-50 text-slate-600 font-medium whitespace-nowrap"
                >
                  {p.name}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {data.services.map((s) => (
            <tr key={s.id}>
              <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 whitespace-nowrap">
                <div className="text-xs font-medium text-slate-900">
                  {new Date(s.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <div className="text-[10px] text-slate-500 max-w-[140px] truncate">{s.name}</div>
              </td>
              {visibleTeams.flatMap((t) =>
                (positionsByTeam.get(t.id) ?? []).map((p) => {
                  const k = cellKey(s.id, p.id);
                  const slot = optSlots[k];
                  const profile = slot?.profile_id ? profilesById.get(slot.profile_id) : null;
                  const editable = editMode && canEditTeam(t.id) && !!slot;
                  const isOpen = openCellKey === k;
                  return (
                    <td
                      key={p.id}
                      className={`relative border-b border-l border-slate-200 px-2 py-2 text-center ${
                        editable ? "cursor-pointer hover:bg-indigo-50" : ""
                      }`}
                      onClick={() => editable && setOpenCellKey(isOpen ? null : k)}
                    >
                      <span className="text-xs text-slate-700">
                        {profile ? `${profile.first_name} ${profile.last_name.charAt(0)}.` : "—"}
                      </span>
                      {isOpen && slot && (
                        <CellPopover
                          slotId={slot.slot_id}
                          positionName={p.name}
                          serviceName={s.name}
                          serviceDate={s.date}
                          eligible={
                            (data.eligibility[p.id] ?? [])
                              .map((e) => profilesById.get(e.profile_id))
                              .filter((p): p is NonNullable<typeof p> => Boolean(p))
                          }
                          unavailableIds={new Set(data.unavailableByService[s.id] ?? [])}
                          alreadyServingIds={alreadyServingIds(s.id, k)}
                          currentProfileId={slot.profile_id}
                          onClose={() => setOpenCellKey(null)}
                          onLocalChange={(pid) => applySlotChange({ key: k, profile_id: pid })}
                        />
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
