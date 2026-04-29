import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SetlistEditor } from "./SetlistEditor";

export default async function SetlistPage({
  params,
}: {
  params: Promise<{ service_id: string }>;
}) {
  const { service_id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  // Gate: viewer check
  const { data: canView } = await supabase.rpc("is_setlist_viewer", { sid: service_id });
  if (!canView) redirect("/dashboard");

  const { data: isLeader } = await supabase.rpc("is_service_worship_leader", { sid: service_id });

  // Upsert setlist (lazy creation)
  const { data: setlist } = await supabase
    .from("setlists")
    .upsert({ service_id }, { onConflict: "service_id" })
    .select("id")
    .single();

  const [{ data: service }, { data: entries }, { data: allSongs }, { data: leaderServiceIds }] =
    await Promise.all([
      supabase.from("services").select("id, name, date").eq("id", service_id).single(),
      supabase
        .from("setlist_songs")
        .select(`
          id, position, played_key, notes,
          song_versions (
            id, label, written_key,
            songs ( id, name )
          )
        `)
        .eq("setlist_id", setlist?.id ?? "")
        .order("position"),
      supabase
        .from("songs")
        .select("id, name, song_versions(id, label, artist, written_key)")
        .order("name"),
      supabase.rpc("get_worship_leader_service_ids"),
    ]);

  // Build key history maps from past setlist_songs
  const { data: history } = await supabase
    .from("setlist_songs")
    .select(`
      played_key,
      song_versions ( song_id ),
      setlists ( service_id )
    `);

  const leaderServiceSet = new Set<string>(leaderServiceIds ?? []);
  const ownLastKeyMap: Record<string, string> = {};
  const anyLastKeyMap: Record<string, string> = {};

  for (const row of history ?? []) {
    const songId = (row.song_versions as { song_id: string } | null)?.song_id;
    const rowServiceId = (row.setlists as { service_id: string } | null)?.service_id;
    if (!songId) continue;
    if (!anyLastKeyMap[songId]) anyLastKeyMap[songId] = row.played_key;
    if (rowServiceId && leaderServiceSet.has(rowServiceId) && !ownLastKeyMap[songId]) {
      ownLastKeyMap[songId] = row.played_key;
    }
  }

  const songsWithHistory = (allSongs ?? []).map((song) => ({
    ...song,
    ownLastKey: ownLastKeyMap[song.id] ?? null,
    anyLastKey: anyLastKeyMap[song.id] ?? null,
  }));

  const serviceDate = service?.date
    ? new Date(service.date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  if (!setlist) redirect("/dashboard");

  // suppress unused variable warning - user is available for future use
  void user;

  return (
    <div className="max-w-2xl">
      <Link href="/schedule" className="text-sm text-slate-500 hover:text-slate-900">← Schedule</Link>
      <div className="mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {service?.name ?? "Service"} — setlist
        </h1>
        {serviceDate && <div className="text-sm text-slate-500 mt-0.5">{serviceDate}</div>}
      </div>

      <SetlistEditor
        setlistId={setlist.id}
        serviceId={service_id}
        isLeader={isLeader ?? false}
        initialEntries={(entries ?? []) as any}
        songs={songsWithHistory as any}
      />
    </div>
  );
}
