"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  ClipboardList,
  Boxes,
  Wrench,
  Music,
  UtensilsCrossed,
  Grid3x3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";

type SidebarProps = {
  firstName: string;
  lastName: string;
  role: "admin" | "member" | "logistics" | "librarian" | "roster_maker";
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  staffOnly?: boolean;
  librarianOrAdmin?: boolean;
  rosterGrid?: boolean;        // NEW: admin OR roster_maker (team-leader visibility evaluated server-side)
  indent?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",        label: "Dashboard",        icon: LayoutDashboard },
  { href: "/people",           label: "People",           icon: Users },
  { href: "/schedule",         label: "Schedule",         icon: Calendar },
  { href: "/inventory",        label: "Inventory",        icon: Boxes },
  { href: "/inventory/manage", label: "Manage inventory", icon: Wrench, staffOnly: true, indent: true },
  { href: "/worship/songs",    label: "Song bank",        icon: Music },
  { href: "/hospitality",      label: "Hospitality",      icon: UtensilsCrossed },
  { href: "/roster",           label: "Roster",           icon: ClipboardList, adminOnly: true },
  { href: "/roster/grid",      label: "Roster grid",      icon: Grid3x3, rosterGrid: true, indent: true },
  { href: "/admin",            label: "Admin",            icon: Settings, adminOnly: true },
];

export function Sidebar({ firstName, lastName, role }: SidebarProps) {
  const pathname = usePathname();
  const initials = `${firstName[0]}${lastName[0]}`.toUpperCase();
  const isStaff = role === "admin" || role === "logistics";

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-60 bg-white border-r border-slate-200 z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 h-14 px-4 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          C
        </div>
        <span className="font-semibold text-slate-900 text-sm">Commune</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, adminOnly, staffOnly, librarianOrAdmin, rosterGrid, indent }) => {
          if (adminOnly && role !== "admin") return null;
          if (staffOnly && !isStaff) return null;
          if (librarianOrAdmin && role !== "admin" && role !== "librarian") return null;
          if (rosterGrid && role !== "admin" && role !== "roster_maker") return null;
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors",
                indent ? "px-5" : "px-3",
                active
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-slate-200 p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-900 truncate">
            {firstName} {lastName}
          </div>
          <div className="text-xs text-slate-500 capitalize">{role}</div>
        </div>
        <NotificationBadge />
        <SignOutButton />
      </div>
    </aside>
  );
}
