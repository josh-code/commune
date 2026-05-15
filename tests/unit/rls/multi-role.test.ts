import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function signIn(email: string, password: string) {
  const supabase = createClient(URL, ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return supabase;
}

describe("Multi-role RLS smoke", () => {
  let admin: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    admin = await signIn("admin@commune.local", "commune-admin-dev");
  });

  it("admin profile has a roles array", async () => {
    const { data: me, error } = await admin
      .from("profiles")
      .select("id, roles")
      .eq("email", "admin@commune.local")
      .single();
    expect(error).toBeNull();
    expect(me).toBeTruthy();
    expect(Array.isArray(me!.roles)).toBe(true);
    expect(me!.roles).toContain("admin");
  });

  it("admin can update its own profile roles", async () => {
    const { data: me } = await admin
      .from("profiles")
      .select("id")
      .eq("email", "admin@commune.local")
      .single();
    const { error } = await admin
      .from("profiles")
      .update({ roles: ["admin", "member"] })
      .eq("id", me!.id);
    expect(error).toBeNull();
  });

  it("current_user_has_role('admin') returns true for admin", async () => {
    const { data, error } = await admin.rpc("current_user_has_role", { target: "admin" });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("current_user_has_role('librarian') returns false for admin-only user", async () => {
    // admin@commune.local has roles {admin,member} — not librarian
    const { data, error } = await admin.rpc("current_user_has_role", { target: "librarian" });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  // Regression: every role-helper function must run clean after the role→roles[]
  // migration. is_logistics_or_admin() was missed in 0014's first pass — its body
  // still referenced the dropped `role` column, erroring on every call (which broke
  // all inventory_categories / inventory_items RLS policies that gate on it).
  it("role-helper RPCs execute without referencing the dropped role column", async () => {
    for (const fn of [
      "is_admin",
      "is_logistics_or_admin",
      "is_hospitality_or_admin",
      "is_media_or_admin",
      "is_worship_write_allowed",
      "is_librarian_or_admin",
    ]) {
      const { error } = await admin.rpc(fn);
      expect(error, `${fn} should not error`).toBeNull();
    }
  });

  it("admin can read and write inventory_categories (gated by is_logistics_or_admin)", async () => {
    const name = `RLS Test Cat ${Date.now()}`;
    const { error: insertError } = await admin
      .from("inventory_categories")
      .insert({ name });
    expect(insertError).toBeNull();

    const { data, error: readError } = await admin
      .from("inventory_categories")
      .select("id, name")
      .eq("name", name);
    expect(readError).toBeNull();
    expect(data?.length).toBe(1);

    // cleanup
    if (data?.[0]) await admin.from("inventory_categories").delete().eq("id", data[0].id);
  });
});
