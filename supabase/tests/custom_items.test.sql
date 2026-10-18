-- Run with `supabase test db`. Proves owners keep their own schedule items to their own cars, and
-- that a service can count as one of them, but not as another car's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.vehicle_configs (id, make, model, year)
  values ('10000000-0000-0000-0000-000000000001', 'Toyota', 'RAV4', 2021);
insert into public.maintenance_items (id, config_id, kind, source, task, interval_miles)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
          'test-item', 'baseline', 'Oil change', 10000);
insert into public.vehicles (id, owner_id, config_id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
   '10000000-0000-0000-0000-000000000001', 2021, 'Toyota', 'RAV4', 'A car'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b',
   '10000000-0000-0000-0000-000000000001', 2021, 'Toyota', 'RAV4', 'B car');
insert into public.custom_items (id, vehicle_id, replaces_item_id, task, interval_miles) values
  ('70000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-000000000001', 'Oil change', 5000),
  ('70000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b',
   null, 'Wiper blades', null);
update public.custom_items set interval_months = 12
  where id = '70000000-0000-0000-0000-00000000000b';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is((select count(*) from public.custom_items)::int, 1,
  'owner sees only the schedule items of their own car');
select lives_ok(
  $$ update public.custom_items set interval_miles = 7500
     where id = '70000000-0000-0000-0000-00000000000a' $$,
  'owner can change their own interval'
);
select throws_ok(
  $$ update public.custom_items set vehicle_id = '20000000-0000-0000-0000-00000000000b'
     where id = '70000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'owner cannot move a schedule item onto someone else''s car'
);
select throws_ok(
  $$ insert into public.custom_items (vehicle_id, task, interval_months)
     values ('20000000-0000-0000-0000-00000000000b', 'Cabin air filter', 12) $$,
  '42501', null, 'owner cannot add a schedule item to someone else''s car'
);
select throws_ok(
  $$ insert into public.custom_items (vehicle_id, task)
     values ('20000000-0000-0000-0000-00000000000a', 'Cabin air filter') $$,
  '23514', null, 'a schedule item needs an interval'
);
select throws_ok(
  $$ insert into public.custom_items (vehicle_id, task, interval_months)
     values ('20000000-0000-0000-0000-00000000000a', repeat('t', 101), 12) $$,
  '23514', null, 'a schedule item''s name past the limit is refused'
);

insert into public.custom_items (id, vehicle_id, task, interval_months) values
  ('70000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a',
   'Cabin air filter', 12);
select lives_ok(
  $$ insert into public.service_records (vehicle_id, item_id, performed_on)
     values ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2',
             '2026-05-01') $$,
  'owner can log a service as one of their own items'
);
select lives_ok(
  $$ insert into public.service_records (vehicle_id, item_id, performed_on)
     values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001',
             '2026-05-01') $$,
  'owner can still log a service as a schedule item'
);
select throws_ok(
  $$ insert into public.service_records (vehicle_id, item_id, performed_on)
     values ('20000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000000b',
             '2026-05-01') $$,
  '23503', null, 'a service cannot count as another car''s item'
);
select throws_ok(
  $$ insert into public.service_records (vehicle_id, item_id, performed_on)
     values ('20000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-000000000009',
             '2026-05-01') $$,
  '23503', null, 'a service cannot count as an item that does not exist'
);

select lives_ok(
  $$ delete from public.custom_items where id = '70000000-0000-0000-0000-0000000000a2' $$,
  'owner can delete their own item'
);
select is(
  (select count(*) from public.service_records
    where item_id = '70000000-0000-0000-0000-0000000000a2')::int,
  1, 'its services stay in the log'
);

reset role;
delete from public.maintenance_items where id = '30000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.custom_items
    where id = '70000000-0000-0000-0000-00000000000a')::int,
  0, 'an interval goes with the schedule item it replaced'
);

select * from finish();
rollback;
