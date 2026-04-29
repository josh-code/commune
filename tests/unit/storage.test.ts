// tests/unit/storage.test.ts
import { describe, it, expect } from "vitest";
import { storagePathFromUrl } from "@/lib/storage";

describe("storagePathFromUrl", () => {
  it("extracts the path from a production public URL", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/item-photos/items/123e4567-e89b-12d3-a456-426614174000.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBe("items/123e4567-e89b-12d3-a456-426614174000.jpg");
  });

  it("extracts the path from a local dev URL", () => {
    const url = "http://127.0.0.1:54321/storage/v1/object/public/item-photos/items/abc.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBe("items/abc.jpg");
  });

  it("returns null for a URL pointing at a different bucket", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/other-bucket/items/abc.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBeNull();
  });

  it("returns null for an unrelated URL", () => {
    expect(storagePathFromUrl("https://example.com/photo.jpg", "item-photos")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(storagePathFromUrl("", "item-photos")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(storagePathFromUrl(null, "item-photos")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(storagePathFromUrl(undefined, "item-photos")).toBeNull();
  });

  it("returns null when path portion is empty", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/item-photos/";
    expect(storagePathFromUrl(url, "item-photos")).toBeNull();
  });

  it("handles nested paths correctly", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/item-photos/items/sub/dir/file.jpg";
    expect(storagePathFromUrl(url, "item-photos")).toBe("items/sub/dir/file.jpg");
  });
});
