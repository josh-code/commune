// src/components/inventory/ImageUpload.tsx
"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "item-photos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

type ImageUploadProps = {
  initialUrl?: string | null;
  onUpload: (url: string | null) => void;
  maxWidthPx?: number;
  quality?: number;
};

async function compressToJpeg(file: File, maxWidthPx: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const ratio = longest > maxWidthPx ? maxWidthPx / longest : 1;
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Image encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export function ImageUpload({
  initialUrl = null,
  onUpload,
  maxWidthPx = 1200,
  quality = 0.82,
}: ImageUploadProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("File must be an image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 5 MB.");
      return;
    }

    setBusy(true);
    try {
      const blob = await compressToJpeg(file, maxWidthPx, quality);
      const path = `items/${crypto.randomUUID()}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = data.publicUrl;
      setUrl(publicUrl);
      onUpload(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setUrl(null);
    setError(null);
    onUpload(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  if (url) {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-slate-600">Photo</div>
        <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Item photo" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={clear}
            className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm"
            aria-label="Remove photo"
          >
            <X className="w-3.5 h-3.5 text-slate-700" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-600">Photo (optional)</div>
      <label
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer transition-colors ${
          isDragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        } ${busy ? "opacity-60 cursor-wait" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            <span className="text-xs text-slate-500">Uploading…</span>
          </>
        ) : (
          <>
            <ImagePlus className="w-5 h-5 text-slate-400" />
            <span className="text-xs text-slate-500">Drop an image or click to browse</span>
          </>
        )}
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
