-- Run with `supabase test db`. Rules every table, view, function and bucket must follow, so a new
-- migration that forgets one fails here rather than in production.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    order by 1
  ),
  array[]::text[],
  'every table has row-level security turned on'
);

select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce('security_invoker=true' = any(c.reloptions), false)
    order by 1
  ),
  array[]::text[],
  'every view applies the reader''s row-level security, not its owner''s'
);

-- Supabase grants EXECUTE on new functions to anon and authenticated by default, so each one that
-- runs with its owner's rights must revoke it.
select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
    order by 1
  ),
  array[]::text[],
  'signed-out callers cannot run any function with elevated rights'
);
select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1
  ),
  array['delete_account'],
  'the only function with elevated rights an owner may call deletes their own account'
);
select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'
      )
    order by 1
  ),
  array[]::text[],
  'every function with elevated rights pins its search path'
);

select is(
  (select array_agg(id order by id) from storage.buckets where public),
  null,
  'no Storage bucket is public'
);
select is(
  array(
    select policyname::text from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (roles <> '{authenticated}'
           or coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%')
    order by 1
  ),
  array[]::text[],
  'every Storage policy is for signed-in owners and scoped to their own id'
);
select is(
  array(
    select policyname::text from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'ALL')
    order by 1
  ),
  array[]::text[],
  'no Storage policy lets a file be replaced in place'
);

select * from finish();
rollback;
