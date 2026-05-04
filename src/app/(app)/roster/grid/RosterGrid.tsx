"use client";

import { useEffect, useOptimistic, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Eye } from "lucide-react";
import { ServicesAsRows } from "./ServicesAsRows";
import { PeopleAsRows } from "./PeopleAsRows";

export type GridData = {
  services: { id: string; name: string; date: string; status: "draft" | "published" | "completed"; type: "regular_sunday" | "special_event" }[];
  teams: { id: string; name: string; color: string }[];
  positions: { id: string; team_id: string; name: string; order: number }[];
  slots: Record<string, { slot_id: string; profile_id: string | null; status: "unassigned" | "pending" | "confirmed" | "declined" }>;
  profiles: { id: string; first_name: string; last_name: string }[];
  eligibility: Record<string, Array<{ profile_id: string; team_role: "leader" | "member" }>>;
  unavailableByService: Record<string, string[]>;
};

type Orientation = "services" | "people";

type Props = {
  data: GridData;
  range: { start: string; end: string };
  canEditAll: boolean;
  editableTeamIds: string[];
};

const ORIENTATION_KEY = "roster-grid-orientation";

export function RosterGrid({ data, range, canEditAll, editableTeamIds }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orientation, setOrientation] = useState<Orientation>("services");
  const [editMode, setEditMode] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set(data.teams.map((t) => t.id)),
  );
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);

  const [optSlots, applySlotChange] = useOptimistic(
    data.slots,
    (current: GridData["slots"], op: { key: string; profile_id: string | null }) => {
      const existing = current[op.key];
      if (!existing) return current;
      return { ...current, [op.key]: { ...existing, profile_id: op.profile_id } };
    },
  );

  // Read orientation from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(ORIENTATION_KEY);
    if (stored === "services" || stored === "people") setOrientation(stored);
  }, []);

  function pickOrientation(o: Orientation) {
    setOrientation(o);
    localStorage.setItem(ORIENTATION_KEY, o);
  }

  function applyRange() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("start", start);
    sp.set("end", end);
    router.push(`/roster/grid?${sp.toString()}`);
  }

  function toggleTeam(id: string) {
    const next = new Set(selectedTeamIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTeamIds(next);
  }

  const visibleTeams = data.teams.filter((t) => selectedTeamIds.has(t.id));
  const visiblePositions = data.positions.filter((p) => selectedTeamIds.has(p.team_id));

  // Hide edit toggle if user has no editable cells
  const canShowEditToggle = canEditAll || editableTeamIds.length > 0;

  return (
    <div className="full-bleed-page p-6">
      {/* ── Mobile guard ─────────────────────────────────── */}
      <div className="md:hidden text-center py-12 text-slate-400">
        <p className="text-sm">Open on a larger screen to use the roster grid.</p>
      </div>

      <div className="hidden md:block space-y-4">
        {/* ── Header bar ─────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">From</label>
            <input
              type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <label className="text-xs font-medium text-slate-600">To</label>
            <input
              type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="text-sm border border-slate-200 rounded px-2 py-1 outline-none"
            />
            <button
              type="button" onClick={applyRange}
              className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="text-xs flex bg-slate-100 rounded-lg p-0.5">
              <button
                type="button" onClick={() => pickOrientation("services")}
                className={`px-3 py-1 rounded ${orientation === "services" ? "bg-white shadow-sm font-medium" : ""}`}
              >
                Services as rows
              </button>
              <button
                type="button" onClick={() => pickOrientation("people")}
                className={`px-3 py-1 rounded ${orientation === "people" ? "bg-white shadow-sm font-medium" : ""}`}
              >
                People as rows
              </button>
            </div>

            {canShowEditToggle && (
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                  editMode
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {editMode ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {editMode ? "Editing" : "View only"}
              </button>
            )}
          </div>
        </div>

        {/* ── Team filter chips ──────────────────────────── */}
        <div className="flex flex-wrap gap-1.5">
          {data.teams.map((t) => {
            const on = selectedTeamIds.has(t.id);
            return (
              <button
                key={t.id} type="button" onClick={() => toggleTeam(t.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  on ? "border-transparent text-white" : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
                style={on ? { backgroundColor: t.color } : undefined}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        {/* ── Grid ──────────────────────────────────────── */}
        {data.services.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">No services in this date range.</p>
        ) : orientation === "services" ? (
          <ServicesAsRows
            data={data}
            visibleTeams={visibleTeams}
            visiblePositions={visiblePositions}
            editMode={editMode}
            canEditAll={canEditAll}
            editableTeamIds={editableTeamIds}
            optSlots={optSlots}
            applySlotChange={applySlotChange}
          />
        ) : (
          <PeopleAsRows
            data={data}
            visibleTeams={visibleTeams}
            visiblePositions={visiblePositions}
            editMode={editMode}
            canEditAll={canEditAll}
            editableTeamIds={editableTeamIds}
            optSlots={optSlots}
            applySlotChange={applySlotChange}
          />
        )}
      </div>
    </div>
  );
}
