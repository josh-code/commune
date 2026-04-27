import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { InviteForm } from "./InviteForm";

export default async function InvitesPage() {
  await requireAdmin();
  return (
    <div>
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">← Admin</Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Invite member</h1>
      <InviteForm />
      <p className="mt-4 text-sm text-slate-500">
        Have many members?{" "}
        <a href="/admin/import" className="text-indigo-600 hover:text-indigo-800 font-medium">
          Import via CSV
        </a>
      </p>
    </div>
  );
}
