-- Run with `supabase test db`. Proves table access exists only where a migration grants it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete')
  ),
  'anonymous users have no access to any table'
);
select table_privs_are('public', 'vehicles', 'authenticated',
  array['SELECT', 'INSERT', 'DELETE'], 'owners manage their vehicles');
select ok(
  has_column_privilege('authenticated', 'public.vehicles', 'nickname', 'update')
    and not has_column_privilege('authenticated', 'public.vehicles', 'config_id', 'update'),
  'owners can edit their car but not repoint its config'
);
select table_privs_are('public', 'conversations', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'owners manage their conversations');
select table_privs_are('public', 'service_records', 'authenticated',
  array['SELECT', 'INSERT', 'DELETE'], 'service records are append-only');
select table_privs_are('public', 'warranties', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'owners can correct their warranties');
select table_privs_are('public', 'fill_ups', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'owners can correct their fill-ups');
select table_privs_are('public', 'tire_sets', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'owners can correct and swap their tire sets');
select table_privs_are('public', 'odometer_readings', 'authenticated',
  array['SELECT', 'INSERT'], 'odometer readings are append-only');
select table_privs_are('public', 'reminders', 'authenticated',
  array['SELECT'], 'reminders are read-only to users');
select table_privs_are('public', 'messages', 'authenticated',
  array['SELECT'], 'assistant messages are read-only to users');
select table_privs_are('public', 'vehicle_configs', 'authenticated',
  array['SELECT'], 'vehicle configurations are read-only to users');
select table_privs_are('public', 'maintenance_items', 'authenticated',
  array['SELECT'], 'schedules are read-only to users');
select table_privs_are('public', 'recalls', 'authenticated',
  array['SELECT'], 'recalls are read-only to users');
select table_privs_are('public', 'knowledge_chunks', 'authenticated',
  array['SELECT'], 'assistant knowledge is read-only to users');
select table_privs_are('public', 'complaint_summaries', 'authenticated',
  array['SELECT'], 'complaint summaries are read-only to users');
select table_privs_are('public', 'complaints', 'authenticated', array[]::text[],
  'raw complaints stay on the server');
select table_privs_are('public', 'nhtsa_fetches', 'authenticated', array[]::text[],
  'the NHTSA fetch queue is private');
select table_privs_are('public', 'baseline_schedule', 'authenticated', array[]::text[],
  'owners see baseline intervals only as their car''s schedule');
select table_privs_are('public', 'reminders', 'service_role',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'the reminder job can write reminders');
select table_privs_are('public', 'messages', 'service_role',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'the assistant can write messages');

-- A table created later gets no access until a migration grants it.
create table public.grants_probe (id int);
select table_privs_are('public', 'grants_probe', 'authenticated', array[]::text[],
  'new tables are not exposed by default');

select * from finish();
rollback;
