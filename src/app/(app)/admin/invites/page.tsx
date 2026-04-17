import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";

export default async function InvitesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .order("name");
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Invite member</h1>
      <InviteForm teams={teams ?? []} />
      <p className="mt-4 text-sm text-slate-500">
        Have many members?{" "}
        <a href="/admin/import" className="text-indigo-600 hover:text-indigo-800 font-medium">
          Import via CSV
        </a>
      </p>
    </div>
  );
}
