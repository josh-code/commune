// src/lib/storage.ts

/**
 * Extracts the storage path from a Supabase public URL for the given bucket.
 * Returns null if the URL doesn't appear to belong to that bucket.
 *
 * Public URL format:
 *   https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
 *   http://127.0.0.1:54321/storage/v1/object/public/{bucket}/{path}
 */
export function storagePathFromUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length);
  return path.length > 0 ? path : null;
}
