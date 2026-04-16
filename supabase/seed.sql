-- seed.sql
-- Creates a single admin for local development.
-- Password: commune-admin-dev (only for local use)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
  email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'admin@commune.local',
  crypt('commune-admin-dev', gen_salt('bf')),
  now(), now(), now(), null,
  '{"provider":"email","providers":["email"]}',
  '{}',
  false, '', '', '', ''
);

insert into profiles (id, first_name, last_name, email, role, status)
values (
  '11111111-1111-1111-1111-111111111111',
  'Dev',
  'Admin',
  'admin@commune.local',
  'admin',
  'active'
);
