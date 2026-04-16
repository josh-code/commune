import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">
        Welcome, {user.firstName}
      </h1>
      <p className="text-sm text-muted-foreground">
        Role: {user.role} · Status: {user.status}
      </p>
    </div>
  );
}
