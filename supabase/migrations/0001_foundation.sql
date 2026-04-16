-- 0001_foundation.sql
-- Initial schema for Commune: profiles + invite flow

-- Enums
create type profile_role as enum ('admin', 'member', 'logistics');
create type profile_status as enum ('invited', 'active', 'on_leave', 'left');

-- Profiles table (minimal — future migrations add more fields)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  role profile_role not null default 'member',
  status profile_status not null default 'invited',
  invite_token uuid unique,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row
  execute function set_updated_at();

-- Indexes
create index profiles_invite_token_idx on profiles (invite_token) where invite_token is not null;
create index profiles_role_idx on profiles (role);
create index profiles_status_idx on profiles (status);

-- Row-Level Security
alter table profiles enable row level security;

-- A user can read their own profile
create policy "profiles_self_read" on profiles
  for select using (auth.uid() = id);

-- Admins can read any profile
create policy "profiles_admin_read" on profiles
  for select using (
    exists (
      select 1 from profiles as p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- A user can update their own profile
create policy "profiles_self_update" on profiles
  for update using (auth.uid() = id);

-- Admins can update any profile
create policy "profiles_admin_update" on profiles
  for update using (
    exists (
      select 1 from profiles as p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Admins can insert profiles (invite creation)
create policy "profiles_admin_insert" on profiles
  for insert with check (
    exists (
      select 1 from profiles as p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Service role bypasses RLS automatically (used by invite activation)
