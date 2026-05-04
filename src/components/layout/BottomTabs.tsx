"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Calendar,
  Settings,
  Wrench,
  Music,
  UtensilsCrossed,
  FileText,
  Library,
  BookOpen,
  Users,
  ClipboardList,
  Grid3x3,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BottomTabsProps = {
  role: "admin" | "member" | "logistics" | "librarian" | "roster_maker";
};

export function BottomTabs({ role }: BottomTabsProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAdmin = role === "admin";
  const isLogistics = role === "logistics";
  const isLibrarian = role === "librarian";
  const isRosterMaker = role === "roster_maker";

  const allNavItems = [
    { href: "/dashboard",         label: "Home",          icon: LayoutDashboard, show: true },
    { href: "/schedule",          label: "Schedule",      icon: Calendar,        show: true },
    { href: "/inventory",         label: "Inventory",     icon: Boxes,           show: true },
    { href: "/library",           label: "Library",       icon: Library,         show: true },
    { href: "/worship/songs",     label: "Songs",         icon: Music,           show: true },
    { href: "/hospitality",       label: "Hospitality",   icon: UtensilsCrossed, show: true },
    { href: "/brief",             label: "Brief",         icon: FileText,        show: true },
    { href: "/people",            label: "People",        icon: Users,           show: true },
    { href: "/admin",             label: "Admin",         icon: Settings,        show: isAdmin },
    { href: "/roster",            label: "Roster",        icon: ClipboardList,   show: isAdmin },
    { href: "/inventory/manage",  label: "Manage Inventory", icon: Wrench,       show: isAdmin || isLogistics },
    { href: "/library/manage",    label: "Manage Library",   icon: BookOpen,     show: isAdmin || isLibrarian },
    { href: "/roster/grid",       label: "Roster Grid",      icon: Grid3x3,      show: isAdmin || isRosterMaker },
  ].filter((item) => item.show);

  const primaryHrefs = ["/dashboard", "/schedule", "/inventory"];

  const moreActive =
    !primaryHrefs.some(
      (href) => pathname === href || pathname.startsWith(href + "/"),
    );

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Bottom sheet drawer */}
      <div
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-40 transition-transform duration-200",
          drawerOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-base font-semibold text-slate-800">Menu</span>
          <button
            onClick={closeDrawer}
            className="p-1 rounded-md text-slate-500 hover:text-slate-700"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 px-2 pb-2">
          {allNavItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={closeDrawer}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 px-1 rounded-xl text-xs font-medium transition-colors",
                  active
                    ? "text-indigo-600 bg-indigo-50"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-center leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Primary bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex">
          {/* Home */}
          {[
            { href: "/dashboard", label: "Home",      icon: LayoutDashboard },
            { href: "/schedule",  label: "Schedule",  icon: Calendar },
            { href: "/inventory", label: "Inventory", icon: Boxes },
          ].map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
                  active ? "text-indigo-600" : "text-slate-500",
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setDrawerOpen((prev) => !prev)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
              moreActive ? "text-indigo-600" : "text-slate-500",
            )}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
