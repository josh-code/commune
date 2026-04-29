"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireBriefEditAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storagePathFromBriefAttachmentUrl } from "@/lib/brief";

function pathFor(serviceId: string) {
  return `/brief/${serviceId}`;
}

async function loadServiceForBrief(supabase: Awaited<ReturnType<typeof createClient>>, briefId: string) {
  const { data } = await supabase
    .from("service_briefs")
    .select("service_id")
    .eq("id", briefId)
    .single();
  return data?.service_id ?? null;
}

export async function updateBriefDetailsAction(
  briefId: string,
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;
  await requireBriefEditAccess(serviceId);

  const sermonTitle = (formData.get("sermon_title") as string)?.trim() || null;
  const sermonNotes = (formData.get("sermon_notes") as string)?.trim() || null;
  const defaultBibleVersion =
    (formData.get("default_bible_version") as string)?.trim() || "NIV";

  await supabase
    .from("service_briefs")
    .update({
      sermon_title: sermonTitle,
      sermon_notes: sermonNotes,
      default_bible_version: defaultBibleVersion,
    })
    .eq("id", briefId);

  revalidatePath(pathFor(serviceId));
}

export async function addVerseAction(
  briefId: string,
  payload: {
    book: string;
    chapter: number;
    verse_start: number;
    verse_end: number | null;
    version_override: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;
  await requireBriefEditAccess(serviceId);

  const { data: maxRow } = await supabase
    .from("brief_verses")
    .select("position")
    .eq("brief_id", briefId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = maxRow && maxRow.length > 0 ? maxRow[0].position + 1 : 1;

  await supabase.from("brief_verses").insert({
    brief_id: briefId,
    position: nextPosition,
    book: payload.book,
    chapter: payload.chapter,
    verse_start: payload.verse_start,
    verse_end: payload.verse_end,
    version_override: payload.version_override,
  });

  revalidatePath(pathFor(serviceId));
}

export async function deleteVerseAction(verseId: string, serviceId: string): Promise<void> {
  await requireBriefEditAccess(serviceId);
  const supabase = await createClient();
  await supabase.from("brief_verses").delete().eq("id", verseId);
  revalidatePath(pathFor(serviceId));
}

export async function reorderVersesAction(
  briefId: string,
  serviceId: string,
  newOrderIds: string[],
): Promise<void> {
  await requireBriefEditAccess(serviceId);
  const supabase = await createClient();
  await Promise.all(
    newOrderIds.map((id, i) =>
      supabase.from("brief_verses").update({ position: i + 1 }).eq("id", id)
    ),
  );
  revalidatePath(pathFor(serviceId));
}

export async function addAttachmentAction(
  briefId: string,
  serviceId: string,
  payload: { file_name: string; file_url: string; mime_type: string; size_bytes: number },
): Promise<void> {
  const user = await requireBriefEditAccess(serviceId);
  const supabase = await createClient();
  await supabase.from("brief_attachments").insert({
    brief_id: briefId,
    file_name: payload.file_name,
    file_url: payload.file_url,
    mime_type: payload.mime_type,
    size_bytes: payload.size_bytes,
    uploaded_by: user.id,
  });
  revalidatePath(pathFor(serviceId));
}

export async function deleteAttachmentAction(
  attachmentId: string,
  serviceId: string,
): Promise<void> {
  await requireBriefEditAccess(serviceId);
  const supabase = await createClient();

  const { data: att } = await supabase
    .from("brief_attachments")
    .select("file_url")
    .eq("id", attachmentId)
    .single();

  if (att?.file_url) {
    try {
      const path = storagePathFromBriefAttachmentUrl(att.file_url);
      await supabase.storage.from("brief-attachments").remove([path]);
    } catch {}
  }

  await supabase.from("brief_attachments").delete().eq("id", attachmentId);
  revalidatePath(pathFor(serviceId));
}

export async function submitBriefAction(briefId: string): Promise<void> {
  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;
  await requireBriefEditAccess(serviceId);

  await supabase
    .from("service_briefs")
    .update({ sermon_submitted_at: new Date().toISOString() })
    .eq("id", briefId);

  await supabase.rpc("notify_brief_submitted", { p_brief_id: briefId });
  revalidatePath(pathFor(serviceId));
  revalidatePath("/brief");
}

export async function updateDeadlineAction(
  briefId: string,
  isoTimestamp: string,
): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin") return;

  const supabase = await createClient();
  const serviceId = await loadServiceForBrief(supabase, briefId);
  if (!serviceId) return;

  await supabase
    .from("service_briefs")
    .update({ deadline: isoTimestamp })
    .eq("id", briefId);

  revalidatePath(pathFor(serviceId));
}
