-- supabase/migrations/0012_roster_maker_role.sql
-- Plan F: Spreadsheet Roster View — add roster_maker profile role.
-- Standalone migration: PostgreSQL does not allow new enum values
-- to be referenced in the same transaction in which they are added.

ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'roster_maker';
