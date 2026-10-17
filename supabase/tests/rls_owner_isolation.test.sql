-- Run with `supabase test db`. Proves one owner can never read or write another owner's car data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.vehicle_configs (id, make, model, year)
  values ('10000000-0000-0000-0000-000000000001', 'Toyota', 'RAV4', 2021);
insert into public.vehicles (id, owner_id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 2021, 'Toyota', 'RAV4', 'A car'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 2021, 'Toyota', 'RAV4', 'B car');
insert into public.service_records (vehicle_id, performed_on)
  values ('20000000-0000-0000-0000-00000000000b', '2026-01-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is((select count(*) from public.vehicles)::int, 1, 'owner sees only their own vehicle');
select is((select count(*) from public.service_records)::int, 0, 'owner cannot read another owner''s records');
select is((select count(*) from public.vehicle_configs)::int, 1, 'shared vehicle knowledge is readable');

select lives_ok(
  $$ insert into public.service_records (vehicle_id, performed_on)
     values ('20000000-0000-0000-0000-00000000000a', '2026-02-01') $$,
  'owner can log service on their own car'
);
select throws_ok(
  $$ insert into public.service_records (vehicle_id, performed_on)
     values ('20000000-0000-0000-0000-00000000000b', '2026-02-01') $$,
  '42501', null, 'owner cannot log service on someone else''s car'
);

select throws_ok(
  $$ insert into public.vehicles (owner_id, year, make, model, nickname)
     values ('00000000-0000-0000-0000-00000000000b', 2021, 'Toyota', 'RAV4', 'Planted') $$,
  '42501', null, 'owner cannot create a vehicle in someone else''s name'
);
select throws_ok(
  $$ insert into public.odometer_readings (vehicle_id, read_on, miles)
     values ('20000000-0000-0000-0000-00000000000b', '2026-02-01', 1) $$,
  '42501', null, 'owner cannot add odometer readings to someone else''s car'
);
select throws_ok(
  $$ insert into public.conversations (vehicle_id) values ('20000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'owner cannot start a conversation about someone else''s car'
);
select lives_ok(
  $$ insert into public.conversations (id, vehicle_id)
     values ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a') $$,
  'owner can start a conversation about their own car'
);
select throws_ok(
  $$ insert into public.messages (conversation_id, role, content)
     values ('30000000-0000-0000-0000-00000000000a', 'user', '{}'::jsonb) $$,
  '42501', null, 'messages are written only by the server'
);

select throws_ok(
  $$ update public.service_records set shop = 'edited' $$,
  '42501', null, 'service history is append-only'
);

select * from finish();
rollback;
