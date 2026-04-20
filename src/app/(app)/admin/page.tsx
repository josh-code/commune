import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Users, Upload } from "lucide-react";

export default async function AdminPage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <Link
          href="/admin/invites"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors"
        >
          <Users className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Invite member</div>
          <div className="text-xs text-slate-500 mt-1">
            Send an invite link to a new member
          </div>
        </Link>
        <Link
          href="/admin/import"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:bg-slate-50 transition-colors"
        >
          <Upload className="w-6 h-6 text-indigo-600 mb-3" />
          <div className="font-medium text-slate-900 text-sm">Import via CSV</div>
          <div className="text-xs text-slate-500 mt-1">
            Bulk import members from a spreadsheet
          </div>
        </Link>
      </div>
    </div>
  );
}
