-- 0002_fix_rls_recursion.sql
-- Fix infinite recursion in profiles RLS policies.
-- The admin-check policies were self-referential: querying profiles to check if
-- the current user is an admin, which triggers the policy again.
-- Solution: use a SECURITY DEFINER function that bypasses RLS.

-- Helper function: check if the calling user is an admin (bypasses RLS)
create or replace function is_admin()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Drop the old recursive policies
drop policy if exists "profiles_admin_read"   on profiles;
drop policy if exists "profiles_admin_update" on profiles;
drop policy if exists "profiles_admin_insert" on profiles;

-- Recreate using the non-recursive helper
create policy "profiles_admin_read" on profiles
  for select using (is_admin());

create policy "profiles_admin_update" on profiles
  for update using (is_admin());

create policy "profiles_admin_insert" on profiles
  for insert with check (is_admin());
