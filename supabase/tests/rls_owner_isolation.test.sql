-- Run with `supabase test db`. Proves one owner can never read or write another owner's car data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
insert into public.warranties (id, vehicle_id, kind, starts_on, months) values
  ('40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'basic', '2024-01-01', 36),
  ('40000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'basic', '2024-01-01', 36);
insert into public.fill_ups (id, vehicle_id, filled_on, odometer_miles, energy, quantity) values
  ('50000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-01-01', 1000, 'fuel', 12.4),
  ('50000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '2026-01-01', 1000, 'fuel', 12.4);
insert into public.tire_sets (id, vehicle_id, name) values
  ('60000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Winter'),
  ('60000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Winter');
-- A car only B has, typed with text B would not want strangers to read.
insert into public.vehicles (owner_id, year, make, model, trim, nickname) values
  ('00000000-0000-0000-0000-00000000000b', 2014, 'Ford', 'Focus', 'Plate 7ABC123', 'Other B car');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is((select count(*) from public.vehicles)::int, 1, 'owner sees only their own vehicle');
select is((select count(*) from public.service_records)::int, 0, 'owner cannot read another owner''s records');
select is((select count(*) from public.vehicle_configs)::int, 1,
  'owner reads the config their car uses, which other owners share');
select is((select count(*) from public.vehicle_configs where make = 'Ford')::int, 0,
  'owner cannot read configs, and the text typed into them, that only other owners use');

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

select is((select count(*) from public.warranties)::int, 1,
  'owner sees only the warranties on their own car');
select lives_ok(
  $$ update public.warranties set months = 30 where id = '40000000-0000-0000-0000-00000000000a' $$,
  'owner can correct a warranty on their own car'
);
select throws_ok(
  $$ update public.warranties set vehicle_id = '20000000-0000-0000-0000-00000000000b'
     where id = '40000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'owner cannot move a warranty onto someone else''s car'
);
select throws_ok(
  $$ insert into public.warranties (vehicle_id, kind, starts_on, months)
     values ('20000000-0000-0000-0000-00000000000b', 'extended', '2026-01-01', 48) $$,
  '42501', null, 'owner cannot add a warranty to someone else''s car'
);

select is((select count(*) from public.fill_ups)::int, 1,
  'owner sees only the fill-ups of their own car');
select lives_ok(
  $$ update public.fill_ups set odometer_miles = 1100
     where id = '50000000-0000-0000-0000-00000000000a' $$,
  'owner can correct a fill-up on their own car'
);
select throws_ok(
  $$ update public.fill_ups set vehicle_id = '20000000-0000-0000-0000-00000000000b'
     where id = '50000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'owner cannot move a fill-up onto someone else''s car'
);
select throws_ok(
  $$ insert into public.fill_ups (vehicle_id, filled_on, odometer_miles, energy, quantity)
     values ('20000000-0000-0000-0000-00000000000b', '2026-02-01', 1300, 'fuel', 10) $$,
  '42501', null, 'owner cannot add a fill-up to someone else''s car'
);
-- The phone's SQLite stores the switches as 1 and 0, and uploads them as JSON numbers.
select is(
  (json_populate_record(null::public.fill_ups, '{"full_tank": 0, "missed_previous": 1}'))
    .missed_previous,
  true, 'a fill-up uploaded with 0 and 1 for its switches reads as booleans'
);

select is((select count(*) from public.tire_sets)::int, 1,
  'owner sees only the tire sets of their own car');
select lives_ok(
  $$ update public.tire_sets set mounted = true, mounted_at_miles = 41000
     where id = '60000000-0000-0000-0000-00000000000a' $$,
  'owner can put a tire set on their own car'
);
select throws_ok(
  $$ update public.tire_sets set vehicle_id = '20000000-0000-0000-0000-00000000000b'
     where id = '60000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'owner cannot move a tire set onto someone else''s car'
);
select throws_ok(
  $$ insert into public.tire_sets (vehicle_id, name)
     values ('20000000-0000-0000-0000-00000000000b', 'Summer') $$,
  '42501', null, 'owner cannot add a tire set to someone else''s car'
);
select throws_ok(
  $$ update public.tire_sets set mounted = false
     where id = '60000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a stored tire set cannot keep the mileage it went on at'
);
-- The phone's SQLite stores the switch as 1 and 0, and uploads it as a JSON number.
select is(
  (json_populate_record(null::public.tire_sets, '{"mounted": 1}')).mounted,
  true, 'a tire set uploaded with 1 for on the car reads as true'
);

-- Free text is capped, so one account cannot fill the database.
select lives_ok(
  $$ insert into public.service_records (vehicle_id, performed_on, shop, notes)
     values ('20000000-0000-0000-0000-00000000000a', '2026-03-01', repeat('s', 200), repeat('n', 10000)) $$,
  'owner can store notes and a shop name up to the limits'
);
select throws_ok(
  $$ insert into public.service_records (vehicle_id, performed_on, notes)
     values ('20000000-0000-0000-0000-00000000000a', '2026-03-01', repeat('n', 10001)) $$,
  '23514', null, 'service notes past the limit are refused'
);
select throws_ok(
  $$ update public.warranties set policy_number = repeat('p', 201)
     where id = '40000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a warranty''s policy number past the limit is refused'
);
select throws_ok(
  $$ update public.fill_ups set station = repeat('s', 201)
     where id = '50000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a fill-up''s station past the limit is refused'
);

select * from finish();
rollback;
