// src/app/(app)/roster/page.tsx
import Link from "next/link";
import { Repeat } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-yellow-100 text-yellow-700",
  published: "bg-blue-100 text-blue-700",
  completed: "bg-slate-100 text-slate-600",
};
const TYPE_LABELS: Record<string, string> = {
  regular_sunday: "Regular Sunday",
  special_event:  "Special Event",
};

type ServiceRow = {
  id: string; name: string; date: string; type: string; status: string;
  roster_slots: { id: string; profile_id: string | null }[];
};

function ServiceCard({ s }: { s: ServiceRow }) {
  const filledCount = s.roster_slots.filter(r => r.profile_id !== null).length;
  const totalCount  = s.roster_slots.length;
  return (
    <Link
      href={`/roster/${s.id}`}
      className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
    >
      <span className="text-sm font-medium text-slate-900 w-28 flex-shrink-0">
        {new Date(s.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
      </span>
      <span className="flex-1 text-sm text-slate-700">{s.name}</span>
      <span className="text-xs text-slate-400">{TYPE_LABELS[s.type]}</span>
      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", STATUS_STYLES[s.status])}>
        {s.status}
      </span>
      <span className="text-xs text-slate-400 w-14 text-right">
        {filledCount} / {totalCount}
      </span>
    </Link>
  );
}

export default async function RosterPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("services")
    .select("id, name, date, type, status, roster_slots(id, profile_id)")
    .order("date");

  const upcoming = (services as ServiceRow[] ?? []).filter(s => s.status !== "completed");
  const past = (services as ServiceRow[] ?? []).filter(s => s.status === "completed").reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Roster</h1>
        <Link href="/roster/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
          + New service
        </Link>
      </div>

      {/* Templates shortcut */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 mb-6 flex items-center gap-3">
        <Repeat className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <span className="text-sm text-indigo-800 flex-1">Manage recurring service templates</span>
        <Link href="/roster/templates" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          View templates →
        </Link>
      </div>

      {upcoming.length === 0 && (
        <p className="text-sm text-slate-400">No upcoming services. <Link href="/roster/new" className="text-indigo-600 hover:text-indigo-800">Create one →</Link></p>
      )}
      {upcoming.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
          {upcoming.map(s => <ServiceCard key={s.id} s={s} />)}
        </div>
      )}

      {past.length > 0 && (
        <details>
          <summary className="text-sm font-medium text-slate-500 cursor-pointer mb-2 select-none">
            Past services ({past.length})
          </summary>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {past.map(s => <ServiceCard key={s.id} s={s} />)}
          </div>
        </details>
      )}
    </div>
  );
}
