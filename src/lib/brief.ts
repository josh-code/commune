export type BriefStatus = "pending" | "complete" | "late";

export function computeBriefStatus(args: {
  sermon_submitted_at: string | null;
  deadline: string;
  now?: Date;
}): BriefStatus {
  const now = args.now ?? new Date();
  if (args.sermon_submitted_at) return "complete";
  if (new Date(args.deadline) < now) return "late";
  return "pending";
}

// Returns ISO timestamp 4 days before service date at 23:59 local time
export function defaultDeadlineFor(serviceDateIso: string): string {
  const d = new Date(serviceDateIso + "T00:00:00");
  d.setDate(d.getDate() - 4);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

export function formatVerseRef(
  v: {
    book: string;
    chapter: number;
    verse_start: number;
    verse_end: number | null;
    version_override: string | null;
  },
  defaultVersion: string,
): string {
  const range = v.verse_end ? `${v.verse_start}-${v.verse_end}` : `${v.verse_start}`;
  const version = v.version_override ?? defaultVersion;
  return `${v.book} ${v.chapter}:${range} (${version})`;
}

const ATTACHMENT_PREFIX = "/storage/v1/object/public/brief-attachments/";

export function storagePathFromBriefAttachmentUrl(url: string): string {
  const idx = url.indexOf(ATTACHMENT_PREFIX);
  if (idx === -1) throw new Error(`Not a brief-attachments URL: ${url}`);
  return url.slice(idx + ATTACHMENT_PREFIX.length);
}
