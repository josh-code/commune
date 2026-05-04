"use client";

import { Fragment, useMemo, useState } from "react";
import { cellKey } from "@/lib/roster-grid";
import { PersonCellPopover } from "./PersonCellPopover";
import type { GridData } from "./RosterGrid";

type SlotChange = { key: string; profile_id: string | null };

type Props = {
  data: GridData;
  visibleTeams: GridData["teams"];
  visiblePositions: GridData["positions"];
  editMode: boolean;
  canEditAll: boolean;
  editableTeamIds: string[];
  optSlots: GridData["slots"];
  applySlotChange: (op: SlotChange) => void;
};

export function PeopleAsRows({
  data,
  visibleTeams,
  visiblePositions,
  editMode,
  canEditAll,
  editableTeamIds,
  optSlots,
  applySlotChange,
}: Props) {
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);

  const profilesById = useMemo(
    () => new Map(data.profiles.map((p) => [p.id, p])),
    [data.profiles],
  );

  // Positions visible, grouped by team_id
  const positionsByTeam = useMemo(() => {
    const map = new Map<string, GridData["positions"]>();
    for (const p of visiblePositions) {
      const arr = map.get(p.team_id) ?? [];
      arr.push(p);
      map.set(p.team_id, arr);
    }
    return map;
  }, [visiblePositions]);

  // For each team, find all eligible profiles (eligible = has an entry in data.eligibility for
  // any position belonging to that team).
  // eligibility is: Record<positionId, Array<{ profile_id, team_role }>>
  const eligibleProfilesByTeam = useMemo(() => {
    const map = new Map<string, GridData["profiles"]>();
    for (const team of visibleTeams) {
      const teamPositions = positionsByTeam.get(team.id) ?? [];
      const profileIdSet = new Set<string>();
      for (const pos of teamPositions) {
        for (const e of data.eligibility[pos.id] ?? []) {
          profileIdSet.add(e.profile_id);
        }
      }
      const profiles = [...profileIdSet]
        .map((id) => profilesById.get(id))
        .filter((p): p is GridData["profiles"][number] => Boolean(p))
        .sort((a, b) =>
          (a.first_name + a.last_name).localeCompare(
            b.first_name + b.last_name,
            undefined,
            { sensitivity: "base" },
          ),
        );
      map.set(team.id, profiles);
    }
    return map;
  }, [visibleTeams, positionsByTeam, data.eligibility, profilesById]);

  function canEditTeam(teamId: string) {
    return canEditAll || editableTeamIds.includes(teamId);
  }

  // Build the eligible slots for PersonCellPopover
  function buildEligibleSlots(profileId: string, serviceId: string, teamId: string) {
    const teamPositions = positionsByTeam.get(teamId) ?? [];
    // only positions this person is eligible for
    const eligiblePositionIds = new Set(
      (data.eligibility
        ? Object.entries(data.eligibility)
            .filter(([, entries]) => entries.some((e) => e.profile_id === profileId))
            .map(([posId]) => posId)
        : []),
    );

    return teamPositions
      .filter((pos) => eligiblePositionIds.has(pos.id))
      .map((pos) => {
        const k = cellKey(serviceId, pos.id);
        const slot = optSlots[k];
        if (!slot) return null;
        const currentProfile = slot.profile_id ? profilesById.get(slot.profile_id) : null;
        return {
          slot_id: slot.slot_id,
          position_id: pos.id,
          position_name: pos.name,
          team_name: data.teams.find((t) => t.id === teamId)?.name ?? "",
          current_profile_id: slot.profile_id,
          current_profile_name: currentProfile
            ? `${currentProfile.first_name} ${currentProfile.last_name}`
            : null,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }

  // Build a map for display: profileId:serviceId → list of position names they are serving in
  // (read from optSlots, scoped to visiblePositions of each team)
  // For the "person row" we show all positions across all visible teams
  const allVisiblePositionIds = useMemo(
    () => new Set(visiblePositions.map((p) => p.id)),
    [visiblePositions],
  );

  function getAssignedPositionNames(profileId: string, serviceId: string): string[] {
    const names: string[] = [];
    for (const pos of visiblePositions) {
      const k = cellKey(serviceId, pos.id);
      const slot = optSlots[k];
      if (slot?.profile_id === profileId) names.push(pos.name);
    }
    return names;
  }

  // Check if any visible team has eligible members
  const hasAnyEligible = visibleTeams.some(
    (t) => (eligibleProfilesByTeam.get(t.id) ?? []).length > 0,
  );

  if (!hasAnyEligible) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        No eligible team members in this view.
      </p>
    );
  }

  // Suppress unused variable warning
  void allVisiblePositionIds;

  return (
    <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-slate-600 font-medium">
              Person
            </th>
            {data.services.map((s) => (
              <th
                key={s.id}
                className="border-b border-l border-slate-200 px-3 py-2 bg-slate-50 text-slate-600 font-medium whitespace-nowrap"
              >
                <div>
                  {new Date(s.date + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="text-[10px] text-slate-400 font-normal max-w-[110px] truncate">
                  {s.name}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleTeams.map((team) => {
            const members = eligibleProfilesByTeam.get(team.id) ?? [];
            if (members.length === 0) return null;
            const editable = editMode && canEditTeam(team.id);

            return (
              <Fragment key={team.id}>
                {/* Team header row */}
                <tr>
                  <td
                    colSpan={data.services.length + 1}
                    className="sticky left-0 px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: team.color }}
                  >
                    {team.name}
                  </td>
                </tr>

                {/* Member rows */}
                {members.map((person) => (
                  <tr key={`${team.id}:${person.id}`}>
                    <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 whitespace-nowrap">
                      <div className="text-xs font-medium text-slate-900">
                        {person.first_name} {person.last_name}
                      </div>
                    </td>
                    {data.services.map((service) => {
                      const names = getAssignedPositionNames(person.id, service.id);
                      const popoverKey = `${team.id}:${person.id}:${service.id}`;
                      const isOpen = openCellKey === popoverKey;
                      const isUnavailable = (
                        data.unavailableByService[service.id] ?? []
                      ).includes(person.id);

                      return (
                        <td
                          key={service.id}
                          className={`relative border-b border-l border-slate-200 px-2 py-2 text-center text-slate-700 ${
                            editable ? "cursor-pointer hover:bg-indigo-50" : ""
                          }`}
                          onClick={() => {
                            if (!editable) return;
                            setOpenCellKey(isOpen ? null : popoverKey);
                          }}
                        >
                          {names.length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className="text-xs">{names.join(", ")}</span>
                          )}

                          {isOpen && editable && (
                            <PersonCellPopover
                              personId={person.id}
                              personName={`${person.first_name} ${person.last_name}`}
                              serviceName={service.name}
                              serviceDate={service.date}
                              eligibleSlots={buildEligibleSlots(person.id, service.id, team.id)}
                              unavailable={isUnavailable}
                              onClose={() => setOpenCellKey(null)}
                              onLocalChange={(positionId, profileId) =>
                                applySlotChange({
                                  key: cellKey(service.id, positionId),
                                  profile_id: profileId,
                                })
                              }
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
