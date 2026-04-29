"use client";

import { useState } from "react";
import { BIBLE_BOOKS, BIBLE_VERSIONS, findBook } from "@/lib/bible-structure";

export type VerseValue = {
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  version_override: string | null;
};

type Props = {
  initial?: Partial<VerseValue>;
  onSubmit: (v: VerseValue) => void;
  submitLabel?: string;
};

export function VerseInput({ initial, onSubmit, submitLabel = "Add" }: Props) {
  const [book, setBook] = useState(initial?.book ?? "John");
  const [chapter, setChapter] = useState<number>(initial?.chapter ?? 1);
  const [vStart, setVStart] = useState<number>(initial?.verse_start ?? 1);
  const [vEnd, setVEnd] = useState<string>(
    initial?.verse_end != null ? String(initial.verse_end) : ""
  );
  const [version, setVersion] = useState<string>(initial?.version_override ?? "");
  const [error, setError] = useState<string | null>(null);

  const bookData = findBook(book);
  const maxChapter = bookData?.chapters.length ?? 1;
  const maxVerse = bookData && chapter >= 1 && chapter <= bookData.chapters.length
    ? bookData.chapters[chapter - 1]
    : 1;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!bookData) return setError("Pick a valid book.");
    if (chapter < 1 || chapter > maxChapter) {
      return setError(`Chapter must be 1–${maxChapter}.`);
    }
    if (vStart < 1 || vStart > maxVerse) {
      return setError(`Verse must be 1–${maxVerse}.`);
    }
    const endNum = vEnd ? parseInt(vEnd, 10) : null;
    if (endNum != null) {
      if (Number.isNaN(endNum) || endNum < vStart || endNum > maxVerse) {
        return setError(`End verse must be ${vStart}–${maxVerse}.`);
      }
    }

    onSubmit({
      book,
      chapter,
      verse_start: vStart,
      verse_end: endNum,
      version_override: version || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-12 gap-2">
        <select
          value={book}
          onChange={(e) => { setBook(e.target.value); setChapter(1); setVStart(1); setVEnd(""); }}
          className="col-span-5 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {BIBLE_BOOKS.map((b) => (
            <option key={b.name} value={b.name}>{b.name}</option>
          ))}
        </select>
        <input
          type="number" min={1} max={maxChapter} value={chapter}
          onChange={(e) => setChapter(parseInt(e.target.value, 10) || 1)}
          className="col-span-2 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <input
          type="number" min={1} max={maxVerse} value={vStart}
          onChange={(e) => setVStart(parseInt(e.target.value, 10) || 1)}
          className="col-span-2 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <input
          type="number" min={vStart} max={maxVerse} value={vEnd} placeholder="end"
          onChange={(e) => setVEnd(e.target.value)}
          className="col-span-3 text-sm border border-slate-200 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
      <div className="flex items-center gap-2">
        <select
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
        >
          <option value="">Use default version</option>
          {BIBLE_VERSIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button
          type="submit"
          className="ml-auto text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  );
}
