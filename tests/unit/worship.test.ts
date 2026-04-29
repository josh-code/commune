import { describe, it, expect } from "vitest";
import { storagePathFromChordSheetUrl, reorderIds } from "@/lib/worship";

const BASE = "https://abc123.supabase.co/storage/v1/object/public/chord-sheets/";

describe("storagePathFromChordSheetUrl", () => {
  it("extracts path for a pdf", () => {
    expect(storagePathFromChordSheetUrl(`${BASE}songs/uuid-abc.pdf`))
      .toBe("songs/uuid-abc.pdf");
  });
  it("extracts path for an image", () => {
    expect(storagePathFromChordSheetUrl(`${BASE}songs/uuid-xyz.jpg`))
      .toBe("songs/uuid-xyz.jpg");
  });
  it("throws on a URL from a different bucket", () => {
    expect(() =>
      storagePathFromChordSheetUrl("https://abc123.supabase.co/storage/v1/object/public/item-photos/foo.jpg")
    ).toThrow();
  });
});

describe("reorderIds", () => {
  it("moves an item to the front", () => {
    expect(reorderIds(["a", "b", "c", "d"], "c", 0)).toEqual(["c", "a", "b", "d"]);
  });
  it("moves an item to the end", () => {
    expect(reorderIds(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
  });
  it("moves an item one step down", () => {
    expect(reorderIds(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
  });
  it("no-op when item stays at same logical position", () => {
    expect(reorderIds(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
  });
  it("throws if dragged id not found", () => {
    expect(() => reorderIds(["a", "b"], "z", 0)).toThrow();
  });
});
