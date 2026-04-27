"use client";

import { markUnavailableAction, unmarkUnavailableAction } from "./actions";

const UNAVAILABILITY_WARNING =
  "You're already rostered for this service — marking unavailable won't remove your assignment. Contact your admin.";

type Service = { id: string; name: string; date: string; type: string };

export function ServiceUnavailabilityList({
  services,
  unavailableIds,
  rosteredServiceIds,
}: {
  services: Service[];
  unavailableIds: string[];
  rosteredServiceIds: string[];
}) {
  const unavailableSet = new Set(unavailableIds);
  const rosteredSet = new Set(rosteredServiceIds);

  if (services.length === 0) {
    return <p className="text-sm text-slate-400">No upcoming services.</p>;
  }

  return (
    <>
      {services.map(svc => {
        const isUnavailable = unavailableSet.has(svc.id);
        const isRostered = rosteredSet.has(svc.id);
        const toggleAction = isUnavailable
          ? unmarkUnavailableAction.bind(null, svc.id)
          : markUnavailableAction.bind(null, svc.id);

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
                <span className="text-xs text-slate-400 ml-auto">
                  {new Date(svc.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
              </label>
            </form>
            {isRostered && isUnavailable && (
              <p className="text-xs text-amber-600 mt-1 ml-7">{UNAVAILABILITY_WARNING}</p>
            )}
          </div>
        );
      })}
    </>
  );
}
