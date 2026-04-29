import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Music, Plus } from "lucide-react";

export default async function SongBankPage() {
  await requireUser();
  const supabase = await createClient();

  const [{ data: songs }, { data: canWrite }] = await Promise.all([
    supabase
      .from("songs")
      .select("id, name, song_versions(id, artist, is_original)")
      .order("name"),
    supabase.rpc("is_worship_write_allowed"),
  ]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Song bank</h1>
        {canWrite && (
          <Link
            href="/worship/songs/new"
            className="flex items-center gap-2 text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add song
          </Link>
        )}
      </div>

      {!songs || songs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Music className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No songs yet.{canWrite ? " Add the first one." : ""}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {songs.map((song) => {
            const original = song.song_versions.find((v) => v.is_original) ?? song.song_versions[0];
            return (
              <li key={song.id}>
                <Link
                  href={`/worship/songs/${song.id}`}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{song.name}</div>
                    {original?.artist && (
                      <div className="text-xs text-slate-500">{original.artist}</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {song.song_versions.length} version{song.song_versions.length !== 1 ? "s" : ""}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
