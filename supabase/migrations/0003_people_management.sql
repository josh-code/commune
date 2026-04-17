-- supabase/migrations/0003_people_management.sql
-- Plan 02: People Management
-- Adds teams, member_teams, and contact fields to profiles

-- Extend profiles with contact fields
alter table profiles
  add column if not exists phone   text,
  add column if not exists address text,
  add column if not exists bio     text;

-- Teams lookup table
create table teams (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  color      text        not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- Member–team join table
create table member_teams (
  profile_id  uuid        not null references profiles(id)  on delete cascade,
  team_id     uuid        not null references teams(id)     on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, team_id)
);

-- RLS: teams
alter table teams enable row level security;

create policy "teams_authenticated_read" on teams
  for select using (auth.role() = 'authenticated');

create policy "teams_admin_all" on teams
  for all using (is_admin());

-- RLS: member_teams
alter table member_teams enable row level security;

create policy "member_teams_authenticated_read" on member_teams
  for select using (auth.role() = 'authenticated');

create policy "member_teams_admin_all" on member_teams
  for all using (is_admin());

-- Seed default teams for local dev
insert into teams (name, color) values
  ('Worship',   '#6366f1'),
  ('Sound',     '#f59e0b'),
  ('Kids',      '#10b981'),
  ('Welcome',   '#ec4899'),
  ('Logistics', '#64748b')
on conflict (name) do nothing;

-- Index for team-based member lookups
create index member_teams_team_id_idx on member_teams (team_id);
