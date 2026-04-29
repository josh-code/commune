import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBriefViewAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { defaultDeadlineFor } from "@/lib/brief";
import { BriefEditor } from "./BriefEditor";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ service_id: string }>;
}) {
  const { service_id } = await params;
  const user = await requireBriefViewAccess(service_id);
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select("id, name, date")
    .eq("id", service_id)
    .single();
  if (!service) notFound();

  // Lazy-fetch-then-insert (do not overwrite existing deadline on every load)
  let { data: brief } = await supabase
    .from("service_briefs")
    .select("*")
    .eq("service_id", service_id)
    .maybeSingle();

  if (!brief) {
    const { data: newBrief } = await supabase
      .from("service_briefs")
      .insert({
        service_id,
        deadline: defaultDeadlineFor(service.date),
        default_bible_version: "NIV",
      })
      .select("*")
      .single();
    brief = newBrief;
  }
  if (!brief) notFound();

  const [{ data: verses }, { data: attachments }, { data: speaker }] = await Promise.all([
    supabase
      .from("brief_verses")
      .select("id, book, chapter, verse_start, verse_end, version_override, position")
      .eq("brief_id", brief.id)
      .order("position"),
    supabase
      .from("brief_attachments")
      .select("id, file_name, file_url, mime_type, size_bytes")
      .eq("brief_id", brief.id)
      .order("uploaded_at"),
    supabase.rpc("is_service_speaker", { sid: service_id }),
  ]);

  const isAdmin = user.role === "admin";
  const canEdit = isAdmin || (speaker ?? false);

  const dateStr = new Date(service.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="max-w-2xl">
      <Link href="/brief" className="text-sm text-slate-500 hover:text-slate-900">← Briefs</Link>
      <div className="mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{service.name} — projection brief</h1>
        <div className="text-sm text-slate-500 mt-0.5">{dateStr}</div>
      </div>

      <BriefEditor
        brief={brief}
        initialVerses={verses ?? []}
        initialAttachments={attachments ?? []}
        canEdit={canEdit}
        isAdmin={isAdmin}
      />
    </div>
  );
}
