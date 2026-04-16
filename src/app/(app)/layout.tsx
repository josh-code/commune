import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Commune
          </Link>
          <Link href="/profile">Profile</Link>
          {user.role === "admin" && (
            <Link href="/admin/invites">Invites</Link>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.firstName} {user.lastName}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
