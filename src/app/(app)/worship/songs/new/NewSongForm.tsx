"use client";

import { useState } from "react";
import { ChordSheetUpload } from "@/components/worship/ChordSheetUpload";
import { createSongAction } from "./actions";

const KEYS = ["C","C#","Db","D","D#","Eb","E","F","F#","Gb","G","G#","Ab","A","A#","Bb","B"];

export function NewSongForm() {
  const [chordSheetUrl, setChordSheetUrl] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        if (chordSheetUrl) formData.set("chord_sheet_url", chordSheetUrl);
        await createSongAction(formData);
      }}
      className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Song name</label>
        <input
          type="text" name="name" required autoFocus
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Version label</label>
        <input
          type="text" name="label" required defaultValue="Original"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Artist (optional)</label>
        <input
          type="text" name="artist"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
        <input type="checkbox" name="is_original" defaultChecked className="rounded border-slate-300 text-indigo-600" />
        Mark as original version
      </label>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Written key</label>
        <select
          name="written_key" required
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Tempo / BPM (optional)</label>
        <input
          type="number" name="tempo" min="40" max="300"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Chord sheet (optional)</label>
        <ChordSheetUpload onUpload={setChordSheetUrl} />
      </div>

      <button type="submit" className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
        Add song
      </button>
    </form>
  );
}
