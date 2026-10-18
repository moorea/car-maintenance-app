-- Run with `supabase test db`. Proves a car added from the phone is matched to a shared config.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.vehicle_configs (id, make, model, year)
  values ('10000000-0000-0000-0000-000000000001', 'Toyota', 'RAV4', 2021);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

-- A config_id sent by the phone is ignored; the description decides.
insert into public.vehicles (id, config_id, year, make, model, trim, engine, nickname) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
   2003, 'Honda', 'Accord', 'EX-V6', '3.0L 6-cyl', 'Accord');

select isnt(
  (select config_id from public.vehicles where id = '20000000-0000-0000-0000-00000000000a'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'the server, not the phone, picks the config'
);
select is(
  (select row(c.make, c.model, c.year, c.trim, c.engine, c.drivetrain)::text
     from public.vehicles v join public.vehicle_configs c on c.id = v.config_id
    where v.id = '20000000-0000-0000-0000-00000000000a'),
  row('Honda', 'Accord', 2003, 'EX-V6', '3.0L 6-cyl', null::text)::text,
  'a car with a new description gets a new config with that description'
);

insert into public.vehicles (id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000c', 2021, 'TOYOTA', 'rav4', 'Rav');
select is(
  (select config_id from public.vehicles where id = '20000000-0000-0000-0000-00000000000c'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'a car matching an existing config uses it, whatever the case'
);

update public.vehicles set trim = 'XLE' where id = '20000000-0000-0000-0000-00000000000c';
select isnt(
  (select config_id from public.vehicles where id = '20000000-0000-0000-0000-00000000000c'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'changing the description re-matches the config'
);

update public.vehicles set nickname = 'Renamed' where id = '20000000-0000-0000-0000-00000000000a';
-- Counted as the server: owners only see the configs their own cars use.
reset role;
select is(
  (select count(*) from public.vehicle_configs)::int, 3,
  'renaming a car leaves its config alone'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.vehicles (id, year, make, model, trim, engine, nickname) values
  ('20000000-0000-0000-0000-00000000000b', 2003, 'HONDA', 'Accord', 'ex-v6', '3.0L 6-cyl', 'Mine');
select is(
  (select count(*) from public.vehicle_configs where model = 'Accord')::int, 1,
  'two owners of the same car share one config'
);
select is((select count(*) from public.vehicles)::int, 1, 'owners still see only their own cars');

select throws_ok(
  $$ insert into public.vehicles (year, make, model, nickname) values (2020, '', 'X', 'X') $$,
  '23514', null, 'a car needs a make'
);
select throws_ok(
  $$ insert into public.vehicles (year, make, model, nickname) values (1975, 'Ford', 'Pinto', 'P') $$,
  '23514', null, 'a car needs a model year from 1981 on'
);
select throws_ok(
  $$ insert into public.vehicle_configs (make, model, year) values ('Ford', 'F-150', 2020) $$,
  '42501', null, 'owners still cannot write configs directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.assign_vehicle_config()', 'execute'),
  'owners cannot call the config trigger function'
);

select throws_ok(
  $$ update public.vehicles set config_id = '10000000-0000-0000-0000-000000000001'
     where id = '20000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'owners cannot repoint a car at another config'
);

reset role;
update public.vehicles set config_id = '10000000-0000-0000-0000-000000000001'
 where id = '20000000-0000-0000-0000-00000000000b';
select is(
  (select config_id from public.vehicles where id = '20000000-0000-0000-0000-00000000000b'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'a server job can point a car at another config'
);

select * from finish();
rollback;
