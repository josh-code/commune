// src/app/(app)/roster/new/page.tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServiceAction } from "./actions";

export default async function NewServicePage() {
  await requireAdmin();
  return (
    <div className="max-w-md">
      <Link href="/roster" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        ← Roster
      </Link>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">New service</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <form action={createServiceAction} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="name" className="text-xs font-medium text-slate-600">Service name</label>
            <input id="name" name="name" required placeholder="e.g. Sunday 27 Apr"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <div className="space-y-1">
            <label htmlFor="date" className="text-xs font-medium text-slate-600">Date</label>
            <input id="date" name="date" type="date" required
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
          <button type="submit"
            className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
            Create service
          </button>
        </form>
      </div>
    </div>
  );
}
