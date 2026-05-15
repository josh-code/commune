"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { visibleNavItems } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";

type Props = {
  user: SessionUser;
  open: boolean;
  onClose: () => void;
};

export function MobileDrawer({ user, open, onClose }: Props) {
  const pathname = usePathname();
  const items = visibleNavItems(user);
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const primaryRole = user.roles[0] ?? "member";

  // Lock body scroll while open; close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={cn(
          "md:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "md:hidden fixed top-0 left-0 h-full w-[280px] bg-white shadow-xl z-50 flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">C</div>
            <span className="font-semibold text-slate-900 text-sm">Commune</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-500 hover:text-slate-700"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {items.map(({ href, label, icon: Icon, parent }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            const indent = !!parent;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  indent ? "px-5" : "px-3",
                  active ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-900 truncate">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-slate-500 capitalize truncate">{primaryRole}</div>
          </div>
          <NotificationBadge />
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
