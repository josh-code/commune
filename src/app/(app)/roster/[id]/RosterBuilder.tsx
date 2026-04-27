// src/app/(app)/roster/[id]/RosterBuilder.tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { findConflictingProfileIds } from "@/lib/rostering";
import { saveDraftAction, publishAction, completeAction, deleteServiceAction, type Assignment } from "./actions";

type TeamPosition = { id: string; name: string; order: number };
type Team = { id: string; name: string; color: string; team_positions: TeamPosition[] };
type SlotData = { position_id: string; profile_id: string | null; status: string };
type EligibleRow = {
  profile_id: string;
  team_id: string;
  position_id: string;
  profiles: { id: string; first_name: string; last_name: string } | null;
};
type Service = { id: string; name: string; date: string; type: string; status: string };

type Props = {
  service: Service;
  teams: Team[];
  slots: SlotData[];
  eligible: EligibleRow[];
  unavailableProfileIds: string[];
};

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-yellow-100 text-yellow-800",
  published: "bg-blue-100 text-blue-800",
  completed: "bg-slate-100 text-slate-600",
};

function initAssignments(slots: SlotData[]): Record<string, string | null> {
  return Object.fromEntries(slots.map(s => [s.position_id, s.profile_id]));
}

function buildAssignmentList(
  assignments: Record<string, string | null>,
  teams: Team[],
): Assignment[] {
  return Object.entries(assignments)
    .filter(([, pid]) => pid !== null)
    .map(([positionId, profileId]) => {
      const team = teams.find(t => t.team_positions.some(p => p.id === positionId));
      return { positionId, teamId: team?.id ?? "", profileId: profileId! };
    });
}

export function RosterBuilder({ service, teams, slots, eligible, unavailableProfileIds }: Props) {
  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => initAssignments(slots),
  );
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unavailableSet = new Set(unavailableProfileIds);
  const conflictIds = findConflictingProfileIds(assignments);

  const assign = (positionId: string, profileId: string) => {
    setAssignments(prev => ({ ...prev, [positionId]: profileId }));
    setOpenDropdown(null);
    setIsDirty(true);
  };

  const unassign = (positionId: string) => {
    setAssignments(prev => ({ ...prev, [positionId]: null }));
    setIsDirty(true);
  };

  const handleSaveDraft = () => {
    startTransition(async () => {
      const result = await saveDraftAction(service.id, buildAssignmentList(assignments, teams));
      if (result.error) setErrorMsg(result.error);
      else { setIsDirty(false); setErrorMsg(null); }
    });
  };

  const handlePublish = () => {
    if (!confirm(`Publish roster for "${service.name}"? Members will see their assignments immediately.`)) return;
    startTransition(async () => {
      const result = await publishAction(service.id, buildAssignmentList(assignments, teams));
      if (result.error) setErrorMsg(result.error);
      else { setIsDirty(false); setErrorMsg(null); }
    });
  };

  const handleComplete = () => {
    if (!confirm("Mark this service as completed?")) return;
    startTransition(async () => {
      const result = await completeAction(service.id);
      if (result.error) setErrorMsg(result.error);
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${service.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteServiceAction(service.id);
    });
  };

  const totalPositions = teams.reduce((sum, t) => sum + t.team_positions.length, 0);
  const filledPositions = Object.values(assignments).filter(Boolean).length;

  const dateStr = new Date(service.date + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
  });

  return (
    <div>
      <Link href="/roster" className="text-sm text-slate-500 hover:text-slate-900">← Roster</Link>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mt-1 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{dateStr}</h1>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", STATUS_STYLES[service.status])}>
              {service.status}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {service.name} · {filledPositions} / {totalPositions} assigned
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {service.status !== "completed" && (
            <button
              onClick={handleSaveDraft}
              disabled={isPending || !isDirty}
              className="text-sm font-medium bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              Save Draft
            </button>
          )}
          {service.status === "draft" && (
            <button
              onClick={handlePublish}
              disabled={isPending}
              className="text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Publish Roster
            </button>
          )}
          {service.status === "published" && (
            <button
              onClick={handleComplete}
              disabled={isPending}
              className="text-sm font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Mark Complete
            </button>
          )}
          {service.status === "draft" && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-sm font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-4 py-2">{errorMsg}</p>
      )}

      {/* Team grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map(team => {
          const tintColor = team.color + "22"; // low-opacity tint
          return (
            <div key={team.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Team card header */}
              <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{ background: tintColor }}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: team.color }} />
                <span className="text-xs font-bold tracking-wider uppercase" style={{ color: team.color }}>
                  {team.name}
                </span>
                <span className="ml-auto text-xs" style={{ color: team.color }}>
                  {team.team_positions.filter(p => assignments[p.id]).length}/{team.team_positions.length}
                </span>
              </div>

              {/* Positions */}
              <div className="p-3 space-y-2">
                {team.team_positions.map(pos => {
                  const assignedProfileId = assignments[pos.id] ?? null;
                  const isOpen = openDropdown === pos.id;
                  const eligibleForPos = eligible.filter(e => e.position_id === pos.id);

                  // Find assigned member info
                  const assignedMember = assignedProfileId
                    ? eligibleForPos.find(e => e.profile_id === assignedProfileId)?.profiles
                    : null;

                  const isConflict = assignedProfileId && conflictIds.has(assignedProfileId);

                  return (
                    <div key={pos.id}>
                      <div className="text-xs text-slate-400 mb-1">{pos.name}</div>
                      {assignedProfileId && assignedMember ? (
                        <div className="flex flex-col">
                          <div
                            className={cn(
                              "flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-1.5",
                              isConflict && "border-amber-300 bg-amber-50",
                            )}
                          >
                            <span className="text-xs font-medium text-slate-800">
                              {assignedMember.first_name} {assignedMember.last_name[0]}.
                            </span>
                            <button
                              onClick={() => unassign(pos.id)}
                              className="text-slate-400 hover:text-slate-700 text-base leading-none ml-2"
                            >
                              ×
                            </button>
                          </div>
                          {isConflict && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              Already assigned to another position
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <button
                            onClick={() => setOpenDropdown(isOpen ? null : pos.id)}
                            className="w-full text-left text-xs text-slate-400 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                          >
                            + Assign
                          </button>
                          {isOpen && (
                            <div className="mt-1 bg-white border border-indigo-300 rounded-lg shadow-sm overflow-hidden">
                              <div className="px-3 py-1.5 bg-indigo-50 text-xs font-semibold text-indigo-700">
                                Assign — {pos.name}
                              </div>
                              {eligibleForPos.length === 0 && (
                                <p className="text-xs text-slate-400 px-3 py-2">No members assigned to this position.</p>
                              )}
                              {eligibleForPos.map(e => {
                                const isUnavailable = unavailableSet.has(e.profile_id);
                                const profile = e.profiles;
                                if (!profile) return null;
                                return (
                                  <button
                                    key={e.profile_id}
                                    onClick={() => assign(pos.id, e.profile_id)}
                                    className={cn(
                                      "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors",
                                      isUnavailable && "opacity-70",
                                    )}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ background: isUnavailable ? "#ef4444" : "#10b981" }}
                                    />
                                    <span className={isUnavailable ? "line-through text-slate-400" : "text-slate-800"}>
                                      {profile.first_name} {profile.last_name}
                                    </span>
                                    {isUnavailable && (
                                      <span className="text-red-400 text-xs">unavailable</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {isDirty && (
        <p className="mt-4 text-xs text-amber-600 font-medium">● Unsaved changes</p>
      )}
    </div>
  );
}
