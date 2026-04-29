const CHORD_SHEET_PREFIX = "/storage/v1/object/public/chord-sheets/";

export function storagePathFromChordSheetUrl(url: string): string {
  const idx = url.indexOf(CHORD_SHEET_PREFIX);
  if (idx === -1) throw new Error(`Not a chord-sheets storage URL: ${url}`);
  return url.slice(idx + CHORD_SHEET_PREFIX.length);
}

export function reorderIds(ids: string[], draggedId: string, targetIndex: number): string[] {
  const from = ids.indexOf(draggedId);
  if (from === -1) throw new Error(`ID "${draggedId}" not found in list`);
  const result = [...ids];
  result.splice(from, 1);
  result.splice(targetIndex, 0, draggedId);
  return result;
}
