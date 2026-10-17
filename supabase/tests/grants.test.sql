-- Run with `supabase test db`. Proves table access exists only where a migration grants it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
  ),
  'anonymous users have no access to any table'
);
select table_privs_are('public', 'vehicles', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'owners manage their vehicles');
select table_privs_are('public', 'service_records', 'authenticated',
  array['SELECT', 'INSERT', 'DELETE'], 'service records are append-only');
select table_privs_are('public', 'odometer_readings', 'authenticated',
  array['SELECT', 'INSERT'], 'odometer readings are append-only');
select table_privs_are('public', 'reminders', 'authenticated',
  array['SELECT'], 'reminders are read-only to users');
select table_privs_are('public', 'messages', 'authenticated',
  array['SELECT'], 'assistant messages are read-only to users');
select table_privs_are('public', 'maintenance_items', 'authenticated',
  array['SELECT'], 'shared reference data is read-only');

-- A table created later gets no access until a migration grants it.
create table public.grants_probe (id int);
select table_privs_are('public', 'grants_probe', 'authenticated', array[]::text[],
  'new tables are not exposed by default');

select * from finish();
rollback;
