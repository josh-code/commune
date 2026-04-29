const COVER_PREFIX = "/storage/v1/object/public/book-covers/";
const DAY_MS = 1000 * 60 * 60 * 24;

export function computeOverdueDays(dueAtIso: string, now: Date = new Date()): number {
  const due = new Date(dueAtIso).getTime();
  const diff = now.getTime() - due;
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_MS);
}

export function defaultDueDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function storagePathFromCoverUrl(url: string): string {
  const idx = url.indexOf(COVER_PREFIX);
  if (idx === -1) throw new Error(`Not a book-covers URL: ${url}`);
  return url.slice(idx + COVER_PREFIX.length);
}

export function matchesSearch(
  book: { title: string; author: string; isbn?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    book.title.toLowerCase().includes(q) ||
    book.author.toLowerCase().includes(q) ||
    (book.isbn ?? "").toLowerCase().includes(q)
  );
}
