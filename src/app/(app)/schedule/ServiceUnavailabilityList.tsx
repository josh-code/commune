"use client";

import { markUnavailableAction, unmarkUnavailableAction } from "./actions";

const ROSTERED_WARNING =
  "You're already rostered — contact your admin to change this.";

type Service = { id: string; name: string; date: string; type: string };

export function ServiceUnavailabilityList({
  services,
  unavailableIds,
  multiRangeCoveredIds,
  rosteredServiceIds,
}: {
  services: Service[];
  unavailableIds: string[];
  multiRangeCoveredIds: string[];
  rosteredServiceIds: string[];
}) {
  const unavailableSet = new Set(unavailableIds);
  const multiRangeSet = new Set(multiRangeCoveredIds);
  const rosteredSet = new Set(rosteredServiceIds);

  if (services.length === 0) {
    return <p className="text-sm text-slate-400">No upcoming services.</p>;
  }

  return (
    <>
      {services.map(svc => {
        const isUnavailable = unavailableSet.has(svc.id);
        const isCoveredByMultiRange = multiRangeSet.has(svc.id);
        const isRostered = rosteredSet.has(svc.id);
        const dateLabel = new Date(svc.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });

        if (isCoveredByMultiRange) {
          return (
            <div key={svc.id} className="py-2 border-b border-slate-100 last:border-0">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked readOnly className="rounded border-slate-300 text-indigo-600 opacity-40" />
                <span className="text-sm text-slate-400">{svc.name}</span>
                <span className="text-xs text-slate-400 ml-auto">{dateLabel}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 ml-7">Covered by a date range below</p>
            </div>
          );
        }

        const toggleAction = isUnavailable
          ? unmarkUnavailableAction.bind(null, svc.date)
          : markUnavailableAction.bind(null, svc.date);

        return (
          <div key={svc.id} className="py-2 border-b border-slate-100 last:border-0">
            <form action={toggleAction}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={isUnavailable}
                  onChange={e => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm text-slate-800">{svc.name}</span>
                <span className="text-xs text-slate-400 ml-auto">{dateLabel}</span>
              </label>
            </form>
            {isRostered && isUnavailable && (
              <p className="text-xs text-amber-600 mt-0.5 ml-7">{ROSTERED_WARNING}</p>
            )}
          </div>
        );
      })}
    </>
  );
}
