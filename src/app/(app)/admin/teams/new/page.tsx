import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createTeamAction } from "./actions";

const PRESET_COLORS = [
  { label: "Indigo",  value: "#6366f1" },
  { label: "Blue",   value: "#3b82f6" },
  { label: "Teal",   value: "#14b8a6" },
  { label: "Green",  value: "#22c55e" },
  { label: "Amber",  value: "#f59e0b" },
  { label: "Orange", value: "#f97316" },
  { label: "Rose",   value: "#f43f5e" },
  { label: "Purple", value: "#a855f7" },
];

export default async function NewTeamPage() {
  await requireAdmin();

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <Link href="/admin/teams" className="text-sm text-slate-500 hover:text-slate-900">
          ← Teams
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">New team</h1>
      </div>

      <form action={createTeamAction} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Team name</label>
          <input
            type="text"
            name="name"
            required
            autoFocus
            placeholder="e.g. Worship, Tech, Welcome"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Colour</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c, i) => (
              <label key={c.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={c.value}
                  defaultChecked={i === 0}
                  className="sr-only peer"
                />
                <span
                  className="block w-7 h-7 rounded-full ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-slate-400 transition-all"
                  style={{ background: c.value }}
                  title={c.label}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Create team
          </button>
          <Link
            href="/admin/teams"
            className="text-sm font-medium text-slate-500 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
