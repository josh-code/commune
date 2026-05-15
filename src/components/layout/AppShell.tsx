"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";
import { MobileDrawer } from "./MobileDrawer";
import type { SessionUser } from "@/lib/auth";

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} />
      <main className="md:pl-60 pb-16 md:pb-0">
        <div className="p-6 max-w-5xl mx-auto [&:has(.full-bleed-page)]:max-w-none [&:has(.full-bleed-page)]:p-0">
          {children}
        </div>
      </main>
      <BottomTabs user={user} onOpenMenu={() => setDrawerOpen(true)} />
      <MobileDrawer user={user} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
