"use server";

import { redirect } from "next/navigation";
import { requireWorshipWriteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createSongAction(formData: FormData): Promise<void> {
  const user = await requireWorshipWriteAccess();

  const name          = (formData.get("name") as string)?.trim();
  const label         = (formData.get("label") as string)?.trim();
  const artist        = (formData.get("artist") as string)?.trim() || null;
  const isOriginal    = formData.get("is_original") === "on";
  const writtenKey    = (formData.get("written_key") as string)?.trim();
  const tempoRaw      = (formData.get("tempo") as string)?.trim();
  const tempo         = tempoRaw ? parseInt(tempoRaw, 10) : null;
  const chordSheetUrl = (formData.get("chord_sheet_url") as string)?.trim() || null;

  if (!name || !label || !writtenKey) return;

  const supabase = await createClient();

  const { data: song, error: songErr } = await supabase
    .from("songs")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (songErr || !song) return;

  const { error: vErr } = await supabase.from("song_versions").insert({
    song_id: song.id,
    label,
    artist,
    is_original: isOriginal,
    written_key: writtenKey,
    tempo: tempo && !isNaN(tempo) ? tempo : null,
    chord_sheet_url: chordSheetUrl,
    created_by: user.id,
  });

  if (vErr) {
    // Roll back the song row if version insert fails
    await supabase.from("songs").delete().eq("id", song.id);
    return;
  }

  redirect(`/worship/songs/${song.id}`);
}
