-- Run with `supabase test db`. Deleting an account removes the owner and all their data, and
-- nobody else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.vehicle_configs (id, make, model, year)
  values ('10000000-0000-0000-0000-000000000001', 'Toyota', 'RAV4', 2021);
insert into public.vehicles (id, owner_id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 2021, 'Toyota', 'RAV4', 'A car'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 2021, 'Toyota', 'RAV4', 'B car');
insert into public.service_records (vehicle_id, performed_on) values
  ('20000000-0000-0000-0000-00000000000a', '2026-01-01'),
  ('20000000-0000-0000-0000-00000000000b', '2026-01-01');
insert into public.odometer_readings (vehicle_id, read_on, miles) values
  ('20000000-0000-0000-0000-00000000000a', '2026-01-01', 1000),
  ('20000000-0000-0000-0000-00000000000b', '2026-01-01', 2000);
insert into public.conversations (id, vehicle_id)
  values ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a');
insert into public.messages (conversation_id, role, content)
  values ('30000000-0000-0000-0000-00000000000a', 'user', '{}'::jsonb);
insert into public.assistant_questions (owner_id)
  values ('00000000-0000-0000-0000-00000000000a');

select ok(
  not has_function_privilege('anon', 'public.delete_account()', 'execute'),
  'signed-out visitors cannot call it'
);
select ok(
  not has_function_privilege('service_role', 'public.delete_account()', 'execute'),
  'the server cannot call it on an owner''s behalf'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_account()'::regprocedure),
  'runs as its owner, since owners cannot touch auth.users'
);
select is(
  (select proconfig from pg_proc where oid = 'public.delete_account()'::regprocedure),
  array['search_path=""'],
  'pins an empty search path, so a caller cannot shadow auth.users'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select lives_ok($$ select public.delete_account() $$, 'an owner can delete their account');
reset role;

select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-00000000000a'),
  0, 'removes the owner'
);
select is(
  (select count(*)::int from public.vehicles where owner_id = '00000000-0000-0000-0000-00000000000a'),
  0, 'removes their cars'
);
select is(
  (select count(*)::int from public.service_records
    where vehicle_id = '20000000-0000-0000-0000-00000000000a'),
  0, 'removes their service history'
);
select is(
  (select count(*)::int from public.odometer_readings
    where vehicle_id = '20000000-0000-0000-0000-00000000000a'),
  0, 'removes their odometer readings'
);
select is(
  (select count(*)::int from public.messages), 0, 'removes their assistant conversations'
);
select is(
  (select count(*)::int from public.assistant_questions), 0, 'removes their question history'
);
select is(
  (select count(*)::int from public.vehicles v
    join public.service_records r on r.vehicle_id = v.id
    join public.odometer_readings o on o.vehicle_id = v.id
    where v.owner_id = '00000000-0000-0000-0000-00000000000b'),
  1, 'leaves other owners and their data alone'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select public.delete_account() $$, '42501', null, 'refuses a caller who is not signed in'
);
reset role;

select * from finish();
rollback;
