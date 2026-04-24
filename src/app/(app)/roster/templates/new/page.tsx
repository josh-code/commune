"use client";

import Link from "next/link";
import { useState } from "react";
import { createTemplateAction } from "./actions";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function NewTemplatePage() {
  const [frequency, setFrequency] = useState("weekly");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await createTemplateAction(fd);
    if (result?.error) {
      setError(result.error);
      setIsPending(false);
    }
    // On success: server redirects to /roster/templates
  };

  return (
    <div className="max-w-md">
      <Link href="/roster/templates" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        ← Templates
      </Link>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">New recurring service</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="space-y-1">
            <label htmlFor="name" className="text-xs font-medium text-slate-600">Service name</label>
            <input id="name" name="name" required placeholder="e.g. Sunday Service"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>

          <div className="space-y-1">
            <label htmlFor="type" className="text-xs font-medium text-slate-600">Type</label>
            <select id="type" name="type"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="regular_sunday">Regular Sunday</option>
              <option value="special_event">Special Event</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="frequency" className="text-xs font-medium text-slate-600">Repeats</label>
            <select id="frequency" name="frequency" value={frequency}
              onChange={e => setFrequency(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          {frequency === "weekly" && (
            <div className="space-y-1">
              <label htmlFor="day_of_week" className="text-xs font-medium text-slate-600">Day of week</label>
              <select id="day_of_week" name="day_of_week" defaultValue="0"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
                {DAY_NAMES.map((day, i) => (
                  <option key={i} value={i}>{day}</option>
                ))}
              </select>
            </div>
          )}

          {(frequency === "monthly" || frequency === "yearly") && (
            <div className="space-y-1">
              <label htmlFor="day_of_month" className="text-xs font-medium text-slate-600">Day of month</label>
              <input id="day_of_month" name="day_of_month" type="number" min="1" max="31"
                defaultValue="1" required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          )}

          {frequency === "yearly" && (
            <div className="space-y-1">
              <label htmlFor="month_of_year" className="text-xs font-medium text-slate-600">Month</label>
              <select id="month_of_year" name="month_of_year" defaultValue="1"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20">
                {MONTH_NAMES.map((month, i) => (
                  <option key={i} value={i + 1}>{month}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="count" className="text-xs font-medium text-slate-600">Generate ahead (services)</label>
            <input id="count" name="count" type="number" min="1" max="52"
              defaultValue="8"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
            <p className="text-xs text-slate-400">How many upcoming services to create now.</p>
          </div>

          <button type="submit" disabled={isPending}
            className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? "Creating…" : "Create template"}
          </button>
        </form>
      </div>
    </div>
  );
}
