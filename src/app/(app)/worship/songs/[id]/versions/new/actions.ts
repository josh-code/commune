"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorshipWriteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromChordSheetUrl } from "@/lib/worship";

export async function createVersionAction(songId: string, formData: FormData): Promise<void> {
  const user = await requireWorshipWriteAccess();

  const label         = (formData.get("label") as string)?.trim();
  const artist        = (formData.get("artist") as string)?.trim() || null;
  const isOriginal    = formData.get("is_original") === "on";
  const writtenKey    = (formData.get("written_key") as string)?.trim();
  const tempoRaw      = (formData.get("tempo") as string)?.trim();
  const tempo         = tempoRaw ? parseInt(tempoRaw, 10) : null;
  const chordSheetUrl = (formData.get("chord_sheet_url") as string)?.trim() || null;

  if (!label || !writtenKey) return;

  const supabase = await createClient();

  // If marking as original, clear the existing original for this song first
  if (isOriginal) {
    await supabase
      .from("song_versions")
      .update({ is_original: false })
      .eq("song_id", songId)
      .eq("is_original", true);
  }

  await supabase.from("song_versions").insert({
    song_id: songId,
    label,
    artist,
    is_original: isOriginal,
    written_key: writtenKey,
    tempo: tempo && !isNaN(tempo) ? tempo : null,
    chord_sheet_url: chordSheetUrl,
    created_by: user.id,
  });

  redirect(`/worship/songs/${songId}`);
}

export async function deleteVersionAction(
  versionId: string,
  songId: string,
): Promise<{ error?: string }> {
  await requireWorshipWriteAccess();
  const supabase = await createClient();

  const { data: version } = await supabase
    .from("song_versions")
    .select("chord_sheet_url")
    .eq("id", versionId)
    .single();

  const { error } = await supabase
    .from("song_versions")
    .delete()
    .eq("id", versionId);

  if (error) return { error: error.message };

  if (version?.chord_sheet_url) {
    try {
      const path = storagePathFromChordSheetUrl(version.chord_sheet_url);
      await supabase.storage.from("chord-sheets").remove([path]);
    } catch {}
  }

  revalidatePath(`/worship/songs/${songId}`);
  return {};
}

export async function deleteChordSheetAction(url: string): Promise<void> {
  await requireWorshipWriteAccess();
  const supabase = await createClient();
  try {
    const path = storagePathFromChordSheetUrl(url);
    await supabase.storage.from("chord-sheets").remove([path]);
  } catch {}
}
