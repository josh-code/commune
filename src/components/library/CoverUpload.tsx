"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2 } from "lucide-react";

type Props = {
  bookId: string;
  initialUrl?: string | null;
  onUpload: (url: string | null) => void;
  maxWidthPx?: number;
  quality?: number;
};

const BUCKET = "book-covers";
const MAX_BYTES = 5 * 1024 * 1024;

async function compressImage(file: File, maxWidthPx: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidthPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}

export function CoverUpload({
  bookId,
  initialUrl = null,
  onUpload,
  maxWidthPx = 1200,
  quality = 0.82,
}: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) { setError("Image only."); return; }
    if (file.size > MAX_BYTES)            { setError("Max 5 MB."); return; }
    setLoading(true);
    try {
      const blob = await compressImage(file, maxWidthPx, quality);
      const path = `books/${bookId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setUrl(data.publicUrl);
      onUpload(data.publicUrl);
    } catch {
      setError("Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  function clear() { setUrl(null); setError(null); onUpload(null); if (inputRef.current) inputRef.current.value = ""; }

  if (url) {
    return (
      <div className="relative inline-block">
        <img src={url} alt="Cover" className="max-h-48 rounded-lg border border-slate-200 object-contain" />
        <button
          type="button" onClick={clear}
          className="absolute -top-2 -right-2 w-5 h-5 bg-slate-700 text-white rounded-full flex items-center justify-center hover:bg-red-600"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button" disabled={loading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0]; if (f) handleFile(f);
        }}
        className={`w-full border-2 border-dashed rounded-lg px-4 py-6 flex flex-col items-center gap-2 ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-slate-400"
        } disabled:opacity-50`}
      >
        {loading ? <Loader2 className="w-6 h-6 text-slate-400 animate-spin" /> : <Upload className="w-6 h-6 text-slate-400" />}
        <span className="text-xs text-slate-500">{loading ? "Uploading…" : "Drop cover image, or click"}</span>
      </button>
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
