"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function NotificationBadge() {
  const [count, setCount] = useState<number>(0);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { count: c } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (!cancelled) setCount(c ?? 0);
    }
    load();
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 transition-colors"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
    >
      <Bell className="w-4 h-4 text-slate-600" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
