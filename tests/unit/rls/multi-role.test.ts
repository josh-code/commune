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
    const { data: me, error } = await admin.from("profiles").select("id, roles").single();
    expect(error).toBeNull();
    expect(me).toBeTruthy();
    expect(Array.isArray(me!.roles)).toBe(true);
    expect(me!.roles).toContain("admin");
  });

  it("admin can update its own profile roles", async () => {
    const { data: me } = await admin.from("profiles").select("id").single();
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
});
