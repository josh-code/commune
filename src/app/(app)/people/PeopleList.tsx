"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string; color: string };

export type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "admin" | "member" | "logistics";
  status: "invited" | "active" | "on_leave" | "left";
  teams: Team[];
};

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-orange-500",
];

function avatarColor(id: string): string {
  const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  invited:  "bg-blue-100 text-blue-700",
  on_leave: "bg-yellow-100 text-yellow-700",
  left:     "bg-slate-100 text-slate-500",
};

const STATUS_LABELS: Record<string, string> = {
  active:   "Active",
  invited:  "Invited",
  on_leave: "On leave",
  left:     "Left",
};

type Filter = "all" | "active" | "on_leave" | "invited";

type PeopleListProps = {
  members: MemberRow[];
  teams: Team[];
};

export function PeopleList({ members, teams }: PeopleListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
      if (search && !fullName.includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (teamFilter !== "all" && !m.teams.some((t) => t.id === teamFilter))
        return false;
      return true;
    });
  }, [members, search, statusFilter, teamFilter]);

  return (
    <div>
      {/* Search + filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "on_leave", "invited"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                statusFilter === f
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
              )}
            >
              {f === "all" ? "All" : f === "on_leave" ? "On leave" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        >
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500 mb-3">
        {filtered.length} member{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 p-6 text-center">
            No members match your filters.
          </p>
        )}
        {filtered.map((m) => (
          <Link
            key={m.id}
            href={`/people/${m.id}`}
            className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0",
                avatarColor(m.id),
              )}
            >
              {m.first_name?.[0] ?? "?"}{m.last_name?.[0] ?? ""}
            </div>

            {/* Name + subtitle */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">
                {m.first_name} {m.last_name}
              </div>
              <div className="text-xs text-slate-500 capitalize truncate">
                {m.role}
                {m.teams.length > 0 && ` · ${m.teams.map((t) => t.name).join(", ")}`}
              </div>
            </div>

            {/* Status badge */}
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                STATUS_STYLES[m.status],
              )}
            >
              {STATUS_LABELS[m.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
