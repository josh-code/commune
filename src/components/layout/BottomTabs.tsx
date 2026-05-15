"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { bottomBarItems } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";

type Props = {
  user: SessionUser;
  onOpenMenu: () => void;
};

export function BottomTabs({ user, onOpenMenu }: Props) {
  const pathname = usePathname();
  const items = bottomBarItems(user);
  const primaryHrefs = items.map(i => i.href);
  const moreActive = !primaryHrefs.some(h => pathname === h || pathname.startsWith(h + "/"));

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex">
        {items.map(({ href, label, icon: Icon }) => {
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
        <button
          onClick={onOpenMenu}
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
  );
}
