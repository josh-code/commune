"use client";

import { useMemo } from "react";
import type { GridData } from "./RosterGrid";

type Props = {
  data: GridData;
  visibleTeams: GridData["teams"];
  visiblePositions: GridData["positions"];
};

export function PeopleAsRows({ data, visibleTeams, visiblePositions }: Props) {
  const visiblePositionIds = useMemo(() => new Set(visiblePositions.map((p) => p.id)), [visiblePositions]);
  const positionById = useMemo(() => new Map(data.positions.map((p) => [p.id, p])), [data.positions]);
  const teamById = useMemo(() => new Map(data.teams.map((t) => [t.id, t])), [data.teams]);
  const profileById = useMemo(() => new Map(data.profiles.map((p) => [p.id, p])), [data.profiles]);

  // Build: profile_id → service_id → position names
  const matrix = useMemo(() => {
    const out = new Map<string, Map<string, string[]>>();
    for (const [key, slot] of Object.entries(data.slots)) {
      if (!slot.profile_id) continue;
      const [serviceId, positionId] = key.split(":");
      if (!visiblePositionIds.has(positionId)) continue;
      const pos = positionById.get(positionId);
      if (!pos) continue;
      const byProfile = out.get(slot.profile_id) ?? new Map<string, string[]>();
      const list = byProfile.get(serviceId) ?? [];
      list.push(pos.name);
      byProfile.set(serviceId, list);
      out.set(slot.profile_id, byProfile);
    }
    return out;
  }, [data.slots, visiblePositionIds, positionById]);

  // Only show profiles who have at least one assignment in the visible window
  const visibleProfiles = data.profiles
    .filter((p) => matrix.has(p.id))
    .sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name, undefined, { sensitivity: "base" }));

  if (visibleProfiles.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">No assignments in this date range.</p>;
  }

  // Profile → set of team IDs they're assigned to (for badges)
  const teamsByProfile = new Map<string, Set<string>>();
  for (const [profileId, perService] of matrix) {
    const teams = new Set<string>();
    for (const [, names] of perService) {
      for (const name of names) {
        const pos = data.positions.find((p) => p.name === name);
        if (pos) teams.add(pos.team_id);
      }
    }
    teamsByProfile.set(profileId, teams);
  }

  // Suppress unused variable warnings — visibleTeams and profileById are part of the API
  void visibleTeams;
  void profileById;

  return (
    <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-slate-600 font-medium">
              Person
            </th>
            {data.services.map((s) => (
              <th key={s.id} className="border-b border-l border-slate-200 px-3 py-2 bg-slate-50 text-slate-600 font-medium whitespace-nowrap">
                <div>{new Date(s.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                <div className="text-[10px] text-slate-400 font-normal max-w-[110px] truncate">{s.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleProfiles.map((p) => {
            const personMatrix = matrix.get(p.id);
            const teams = [...(teamsByProfile.get(p.id) ?? [])]
              .map((tid) => teamById.get(tid))
              .filter((t): t is GridData["teams"][number] => Boolean(t));
            return (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 whitespace-nowrap">
                  <div className="text-xs font-medium text-slate-900">{p.first_name} {p.last_name}</div>
                  <div className="flex gap-1 mt-0.5">
                    {teams.map((t) => (
                      <span key={t.id}
                        className="text-[9px] px-1 py-0.5 rounded text-white"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </td>
                {data.services.map((s) => {
                  const names = personMatrix?.get(s.id) ?? [];
                  return (
                    <td key={s.id} className="border-b border-l border-slate-200 px-2 py-2 text-center text-slate-700">
                      {names.length === 0 ? <span className="text-slate-300">—</span> : names.join(", ")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
