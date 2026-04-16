"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Calendar, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type BottomTabsProps = {
  role: "admin" | "member" | "logistics";
};

export function BottomTabs({ role }: BottomTabsProps) {
  const pathname = usePathname();

  const tabs = [
    { href: "/dashboard", label: "Home",   icon: LayoutDashboard },
    { href: "/people",    label: "People", icon: Users },
    { href: "/roster",    label: "Roster", icon: Calendar, disabled: true },
    ...(role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: Settings, disabled: false as const }]
      : []),
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex">
        {tabs.map(({ href, label, icon: Icon, disabled }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          if (disabled) {
            return (
              <span
                key={href}
                className="flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium text-slate-500 opacity-40 cursor-default"
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </span>
            );
          }
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
      </div>
    </nav>
  );
}
