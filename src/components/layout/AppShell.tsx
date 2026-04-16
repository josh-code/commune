import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";
import type { SessionUser } from "@/lib/auth";

type AppShellProps = {
  user: SessionUser;
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        firstName={user.firstName}
        lastName={user.lastName}
        role={user.role}
      />
      {/* md:pl-60 clears the 240px sidebar; pb-16 clears the mobile bottom nav */}
      <main className="md:pl-60 pb-16 md:pb-0">
        <div className="p-6 max-w-5xl mx-auto">{children}</div>
      </main>
      <BottomTabs role={user.role} />
    </div>
  );
}
