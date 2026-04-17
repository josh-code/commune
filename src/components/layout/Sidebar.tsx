"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

type SidebarProps = {
  firstName: string;
  lastName: string;
  role: "admin" | "member" | "logistics";
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/people",    label: "People",    icon: Users },
  { href: "/roster",    label: "Roster",    icon: Calendar,  disabled: true },
  { href: "/admin",     label: "Admin",     icon: Settings,  adminOnly: true },
];

export function Sidebar({ firstName, lastName, role }: SidebarProps) {
  const pathname = usePathname();
  const initials = `${firstName[0]}${lastName[0]}`.toUpperCase();

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
        {NAV_ITEMS.map(({ href, label, icon: Icon, disabled, adminOnly }) => {
          if (adminOnly && role !== "admin") return null;
          const active =
            pathname === href || pathname.startsWith(href + "/");
          if (disabled) {
            return (
              <span
                key={href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 opacity-40 cursor-default"
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {label}
              </span>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
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
        <SignOutButton />
      </div>
    </aside>
  );
}
