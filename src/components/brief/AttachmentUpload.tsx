"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, Loader2 } from "lucide-react";

type Props = {
  briefId: string;
  onUploaded: (info: {
    file_name: string;
    file_url: string;
    mime_type: string;
    size_bytes: number;
  }) => void;
};

const BUCKET = "brief-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMG_EDGE = 1600;
const IMG_QUALITY = 0.85;

const ACCEPTED = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

async function compressImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", IMG_QUALITY),
  );
  return { blob, ext: "jpg" };
}

function extFromMime(mime: string, fallback: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.ms-powerpoint") return "ppt";
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return fallback;
}

export function AttachmentUpload({ briefId, onUploaded }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("File type not supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File must be 10 MB or smaller.");
      return;
    }

    setLoading(true);
    try {
      const isImage = file.type.startsWith("image/");
      let blob: Blob;
      let ext: string;
      let mime: string;

      if (isImage) {
        const compressed = await compressImage(file);
        blob = compressed.blob;
        ext = compressed.ext;
        mime = "image/jpeg";
      } else {
        blob = file;
        const fallback = file.name.split(".").pop() ?? "bin";
        ext = extFromMime(file.type, fallback);
        mime = file.type;
      }

      const path = `briefs/${briefId}/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: mime });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onUploaded({
        file_name: file.name,
        file_url: data.publicUrl,
        mime_type: mime,
        size_bytes: blob.size,
      });
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`w-full border-2 border-dashed rounded-lg px-4 py-6 flex flex-col items-center gap-2 transition-colors ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-slate-400"
        } disabled:opacity-50`}
      >
        {loading
          ? <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          : <Upload className="w-6 h-6 text-slate-400" />}
        <span className="text-xs text-slate-500">
          {loading ? "Uploading…" : "Drop a PDF, image, slide deck, or click to browse"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
