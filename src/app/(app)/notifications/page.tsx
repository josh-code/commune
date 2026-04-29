import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NotificationsList } from "./NotificationsList";

export default async function NotificationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const initial = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    read_at: n.read_at,
    created_at: n.created_at,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Notifications</h1>
      <NotificationsList initial={initial} />
    </div>
  );
}
