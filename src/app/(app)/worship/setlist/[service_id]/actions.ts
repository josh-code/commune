"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reorderIds } from "@/lib/worship";

export async function addSongToSetlistAction(
  setlistId: string,
  serviceId: string,
  songVersionId: string,
  playedKey: string,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: isLeader } = await supabase.rpc("is_service_worship_leader", { sid: serviceId });
  if (!isLeader) return;

  const { data: existing } = await supabase
    .from("setlist_songs")
    .select("position")
    .eq("setlist_id", setlistId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 1;

  await supabase.from("setlist_songs").insert({
    setlist_id: setlistId,
    song_version_id: songVersionId,
    position: nextPosition,
    played_key: playedKey,
    added_by: user.id,
  });

  revalidatePath(`/worship/setlist/${serviceId}`);
}

export async function removeSongFromSetlistAction(
  entryId: string,
  serviceId: string,
): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { data: isLeader } = await supabase.rpc("is_service_worship_leader", { sid: serviceId });
  if (!isLeader) return;

  await supabase.from("setlist_songs").delete().eq("id", entryId);
  revalidatePath(`/worship/setlist/${serviceId}`);
}

export async function reorderSetlistAction(
  setlistId: string,
  serviceId: string,
  entryIds: string[],
  draggedId: string,
  targetIndex: number,
): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  const { data: isLeader } = await supabase.rpc("is_service_worship_leader", { sid: serviceId });
  if (!isLeader) return;

  let newOrder: string[];
  try {
    newOrder = reorderIds(entryIds, draggedId, targetIndex);
  } catch {
    return;
  }

  await Promise.all(
    newOrder.map((id, i) =>
      supabase.from("setlist_songs").update({ position: i + 1 }).eq("id", id)
    )
  );

  revalidatePath(`/worship/setlist/${serviceId}`);
}
