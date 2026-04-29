import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FileText, Plus } from "lucide-react";

export default async function SongDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();

  const [{ data: song }, { data: canWrite }] = await Promise.all([
    supabase
      .from("songs")
      .select("id, name, song_versions(id, label, artist, is_original, written_key, tempo, chord_sheet_url)")
      .eq("id", id)
      .single(),
    supabase.rpc("is_worship_write_allowed"),
  ]);

  if (!song) notFound();

  const sorted = [...song.song_versions].sort((a, b) =>
    a.is_original ? -1 : b.is_original ? 1 : 0
  );

  return (
    <div className="max-w-2xl">
      <Link href="/worship/songs" className="text-sm text-slate-500 hover:text-slate-900">← Song bank</Link>
      <div className="flex items-center justify-between mt-1 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{song.name}</h1>
        {canWrite && (
          <Link
            href={`/worship/songs/${id}/versions/new`}
            className="flex items-center gap-2 text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add version
          </Link>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400">No versions yet.</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((v) => (
            <li key={v.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">{v.label}</span>
                    {v.is_original && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Original</span>
                    )}
                  </div>
                  {v.artist && <div className="text-xs text-slate-500 mt-0.5">{v.artist}</div>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>Key: {v.written_key}</span>
                    {v.tempo && <span>{v.tempo} BPM</span>}
                  </div>
                </div>
                {v.chord_sheet_url && (
                  <a
                    href={v.chord_sheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Chord sheet
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
