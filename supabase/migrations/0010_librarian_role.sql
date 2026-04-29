-- supabase/migrations/0010_librarian_role.sql
-- Plan E: Library Management — add librarian profile role.
-- Must be a standalone migration: PostgreSQL does not allow new enum values
-- to be referenced in the same transaction in which they were added.

ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'librarian';
