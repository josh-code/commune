import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorshipWriteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddVersionForm } from "./AddVersionForm";

export default async function AddVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireWorshipWriteAccess();
  const supabase = await createClient();

  const { data: song } = await supabase
    .from("songs")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!song) notFound();

  return (
    <div className="max-w-md">
      <Link href={`/worship/songs/${id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← {song.name}
      </Link>
      <h1 className="text-xl font-semibold text-slate-900 mt-1 mb-6">Add version</h1>
      <AddVersionForm songId={id} />
    </div>
  );
}
