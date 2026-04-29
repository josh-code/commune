"use client";

import { useState, useTransition } from "react";
import { GripVertical, Trash2, ChevronDown, ChevronUp, X, Music } from "lucide-react";
import {
  addSongToSetlistAction,
  removeSongFromSetlistAction,
  reorderSetlistAction,
} from "./actions";

const KEYS = ["C","C#","Db","D","D#","Eb","E","F","F#","Gb","G","G#","Ab","A","A#","Bb","B"];

type SongVersion = { id: string; label: string; artist: string | null; written_key: string };

type SongWithHistory = {
  id: string;
  name: string;
  song_versions: SongVersion[];
  ownLastKey: string | null;
  anyLastKey: string | null;
};

type Entry = {
  id: string;
  position: number;
  played_key: string;
  notes: string | null;
  song_versions: {
    id: string;
    label: string;
    written_key: string;
    songs: { id: string; name: string } | null;
  } | null;
};

type Props = {
  setlistId: string;
  serviceId: string;
  isLeader: boolean;
  initialEntries: Entry[];
  songs: SongWithHistory[];
};

function reorderLocal(ids: string[], moved: string, targetIndex: number): string[] {
  const from = ids.indexOf(moved);
  if (from === -1) return ids;
  const result = [...ids];
  result.splice(from, 1);
  result.splice(targetIndex, 0, moved);
  return result;
}

export function SetlistEditor({ setlistId, serviceId, isLeader, initialEntries, songs }: Props) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [showPicker, setShowPicker] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pickedVersion, setPickedVersion] = useState<Record<string, string>>({});
  const [pickedKey, setPickedKey] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function handleDrop(targetEntryId: string) {
    if (!draggedId || draggedId === targetEntryId) return;
    const ids = entries.map((e) => e.id);
    const targetIndex = ids.indexOf(targetEntryId);
    const newIds = reorderLocal(ids, draggedId, targetIndex);
    setEntries(newIds.map((id, i) => ({ ...entries.find((e) => e.id === id)!, position: i + 1 })));
    startTransition(() => {
      reorderSetlistAction(setlistId, serviceId, ids, draggedId, targetIndex);
    });
    setDraggedId(null);
  }

  function handleRemove(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    startTransition(() => removeSongFromSetlistAction(entryId, serviceId));
  }

  function handleAdd(song: SongWithHistory) {
    const versionId = pickedVersion[song.id] ?? song.song_versions[0]?.id;
    const version = song.song_versions.find((v) => v.id === versionId) ?? song.song_versions[0];
    if (!version) return;

    const key = pickedKey[song.id] ?? song.ownLastKey ?? version.written_key;

    const tempEntry: Entry = {
      id: `temp-${Date.now()}`,
      position: entries.length + 1,
      played_key: key,
      notes: null,
      song_versions: {
        id: version.id,
        label: version.label,
        written_key: version.written_key,
        songs: { id: song.id, name: song.name },
      },
    };
    setEntries((prev) => [...prev, tempEntry]);
    setShowPicker(false);
    startTransition(() => addSongToSetlistAction(setlistId, serviceId, version.id, key));
  }

  return (
    <div>
      {entries.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Music className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            No songs yet.{isLeader ? " Use “Add song” to build the setlist." : ""}
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              draggable={isLeader}
              onDragStart={() => setDraggedId(entry.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(entry.id)}
              className={`flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-3 transition-opacity ${
                draggedId === entry.id ? "opacity-40" : "opacity-100"
              }`}
            >
              <span className="text-xs text-slate-300 w-4 text-right flex-shrink-0">{i + 1}</span>
              {isLeader && (
                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {entry.song_versions?.songs?.name ?? "Unknown song"}
                </div>
                <div className="text-xs text-slate-500">
                  {entry.song_versions?.label} · Key: <strong>{entry.played_key}</strong>
                </div>
              </div>
              {isLeader && (
                <button
                  type="button"
                  onClick={() => handleRemove(entry.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {isLeader && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowPicker((p) => !p)}
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            {showPicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Add song
          </button>

          {showPicker && (
            <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-xs font-medium text-slate-600">Choose a song</span>
                <button type="button" onClick={() => setShowPicker(false)}>
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-700" />
                </button>
              </div>

              {songs.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">No songs in the bank yet.</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {songs.map((song) => {
                    const vId = pickedVersion[song.id] ?? song.song_versions[0]?.id;
                    const version = song.song_versions.find((v) => v.id === vId) ?? song.song_versions[0];
                    const key = pickedKey[song.id] ?? song.ownLastKey ?? version?.written_key ?? "C";

                    return (
                      <li key={song.id} className="px-3 py-3 hover:bg-slate-50">
                        <div className="mb-2">
                          <div className="text-sm font-medium text-slate-900">{song.name}</div>
                          {(song.ownLastKey || song.anyLastKey) && (
                            <div className="flex gap-4 mt-0.5 text-xs text-slate-400">
                              {song.ownLastKey && (
                                <span>Your last: <strong className="text-slate-600">{song.ownLastKey}</strong></span>
                              )}
                              {song.anyLastKey && (
                                <span>Last used: <strong className="text-slate-600">{song.anyLastKey}</strong></span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {song.song_versions.length > 1 && (
                            <select
                              value={vId}
                              onChange={(e) =>
                                setPickedVersion((p) => ({ ...p, [song.id]: e.target.value }))
                              }
                              className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300"
                            >
                              {song.song_versions.map((v) => (
                                <option key={v.id} value={v.id}>{v.label}</option>
                              ))}
                            </select>
                          )}
                          <select
                            value={key}
                            onChange={(e) =>
                              setPickedKey((p) => ({ ...p, [song.id]: e.target.value }))
                            }
                            className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300"
                          >
                            {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAdd(song)}
                            className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1 hover:bg-indigo-50 transition-colors"
                          >
                            Add
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
