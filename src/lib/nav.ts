import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, Calendar, Boxes, Wrench,
  Library, BookOpen, Music, UtensilsCrossed,
  ClipboardList, Grid3x3, FileText, Settings,
} from "lucide-react";

export type Role = "admin" | "member" | "logistics" | "librarian" | "roster_maker";
export type TeamSlug =
  | "media" | "worship" | "hospitality" | "preaching"
  | "kids" | "logistics" | "sound" | "welcome";

// Minimal user shape consumed by gating helpers — kept local so nav.ts doesn't
// depend on auth.ts. SessionUser (Task 3) is a superset of this.
export type NavUser = {
  roles: Role[];
  teams: TeamSlug[];
};

export type NavGate = {
  roles?: Role[];
  teams?: TeamSlug[];
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  gate: NavGate;     // {} = universal
  parent?: string;   // for indented sub-items in sidebar/drawer
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",        label: "Dashboard",        icon: LayoutDashboard, gate: {} },
  { href: "/people",           label: "People",           icon: Users,           gate: { roles: ["admin"] } },
  { href: "/schedule",         label: "Schedule",         icon: Calendar,        gate: {} },
  { href: "/inventory",        label: "Inventory",        icon: Boxes,           gate: {} },
  { href: "/inventory/manage", label: "Manage inventory", icon: Wrench,          gate: { roles: ["admin", "logistics"] }, parent: "/inventory" },
  { href: "/library",          label: "Library",          icon: Library,         gate: {} },
  { href: "/library/manage",   label: "Manage library",   icon: BookOpen,        gate: { roles: ["admin", "librarian"] }, parent: "/library" },
  { href: "/worship/songs",    label: "Song bank",        icon: Music,           gate: { teams: ["media", "worship"] } },
  { href: "/hospitality",      label: "Hospitality",      icon: UtensilsCrossed, gate: { roles: ["admin"], teams: ["hospitality"] } },
  { href: "/roster",           label: "Roster",           icon: ClipboardList,   gate: { roles: ["admin", "roster_maker"] } },
  { href: "/roster/grid",      label: "Roster grid",      icon: Grid3x3,         gate: { roles: ["admin", "roster_maker"] }, parent: "/roster" },
  { href: "/brief",            label: "Brief",            icon: FileText,        gate: { roles: ["admin"], teams: ["media", "preaching"] } },
  { href: "/admin",            label: "Admin",            icon: Settings,        gate: { roles: ["admin"] } },
];

export function matchesGate(gate: NavGate, user: NavUser): boolean {
  if (user.roles.includes("admin")) return true;
  if (!gate.roles && !gate.teams) return true;
  if ((gate.roles ?? []).some(r => user.roles.includes(r))) return true;
  if ((gate.teams ?? []).some(t => user.teams.includes(t))) return true;
  return false;
}

export function visibleNavItems(user: NavUser): NavItem[] {
  return NAV_ITEMS.filter(item => matchesGate(item.gate, user));
}

const ROLE_TASK: Record<Role, string> = {
  admin:        "/roster",
  logistics:    "/inventory/manage",
  librarian:    "/library/manage",
  roster_maker: "/roster/grid",
  member:       "/library",
};

const PRECEDENCE: Role[] = ["admin", "logistics", "librarian", "roster_maker", "member"];

export function bottomBarItems(user: NavUser): NavItem[] {
  const home = NAV_ITEMS.find(i => i.href === "/dashboard")!;
  const schedule = NAV_ITEMS.find(i => i.href === "/schedule")!;
  const taskRole = PRECEDENCE.find(r => user.roles.includes(r)) ?? "member";
  const task = NAV_ITEMS.find(i => i.href === ROLE_TASK[taskRole])!;
  return [home, schedule, task];
}
