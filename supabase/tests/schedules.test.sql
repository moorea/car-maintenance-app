-- Run with `supabase test db`. Proves every car gets a schedule, and a provider can replace it
-- without losing the owner's service history.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select is(public.powertrain_of('Toyota', 'RAV4', '2.5L 4-cyl'), 'gas', 'a decoded engine is gas');
select is(public.powertrain_of('Toyota', 'RAV4', '2.5L 4-cyl hybrid'), 'hybrid',
  'a decoded hybrid is a hybrid');
select is(public.powertrain_of('Ram', '2500', '6.7L 6-cyl diesel'), 'diesel',
  'a decoded diesel is a diesel');
select is(public.powertrain_of('Nissan', 'Leaf', 'Electric'), 'electric',
  'a decoded electric car is electric');
select is(public.powertrain_of('Tesla', 'Model 3', null), 'electric',
  'a typed-in Tesla is electric');
select is(public.powertrain_of('Ford', 'Mustang Mach-E', null), 'electric',
  'a typed-in electric model is electric');
select is(public.powertrain_of('Ford', 'Mustang', null), 'gas', 'a typed-in car is gas by default');
select is(public.powertrain_of('Kia', 'Sorento', null), 'gas',
  'a model name containing "ev" letters is not taken for electric');
select is(public.powertrain_of('Chevrolet', 'Equinox', null), 'gas',
  'a typed-in Equinox is gas, unlike an Equinox EV');
select is(public.powertrain_of('Chevrolet', 'Equinox EV', null), 'electric',
  'a typed-in Equinox EV is electric');
select is(public.powertrain_of('Infiniti', 'I35', null), 'gas', 'only BMW''s i models are electric');
select is(public.powertrain_of('Audi', 'A3 Sportback e-tron', null), 'gas',
  'a plug-in Audi e-tron is not taken for electric');
select is(public.powertrain_of('Chevrolet', 'Volt', null), 'hybrid', 'a typed-in Volt is a hybrid');
select is(
  (select pg_catalog.count(*) from public.baseline_schedule a join public.baseline_schedule b
       on a.kind = b.kind and a.years && b.years and a.years <> b.years)::int,
  0,
  'a kind''s baseline rows never cover the same model year twice'
);

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

insert into public.vehicles (id, year, make, model, engine, nickname) values
  ('20000000-0000-0000-0000-000000000001', 2021, 'Toyota', 'RAV4', '2.5L 4-cyl', 'Rav'),
  ('20000000-0000-0000-0000-000000000002', 2023, 'Tesla', 'Model 3', 'Electric', 'Tess'),
  ('20000000-0000-0000-0000-000000000003', 2019, 'Ram', '2500', '6.7L 6-cyl diesel', 'Truck'),
  ('20000000-0000-0000-0000-000000000004', 1998, 'Honda', 'Civic', '1.6L 4-cyl', 'Old');

create temporary view schedule_of as
  select v.nickname, m.*
    from public.vehicles v join public.maintenance_items m on m.config_id = v.config_id;
grant select on schedule_of to authenticated;

select is(
  (select pg_catalog.string_agg(kind, ' ' order by kind) from schedule_of where nickname = 'Rav'),
  'battery-test brake-fluid brake-inspection cabin-air-filter engine-air-filter engine-coolant '
  'engine-oil spark-plugs timing-belt tire-rotation transmission-fluid',
  'a gas car gets the baseline schedule as soon as it is added'
);
select ok(
  (select bool_and(source = 'baseline') from schedule_of where nickname = 'Rav'),
  'baseline items say they are the baseline'
);
select is(
  (select row(interval_miles, interval_months, severe_miles, severe_months)::text
     from schedule_of where nickname = 'Rav' and kind = 'engine-oil'),
  row(5000, 6, 3000, 6)::text,
  'the baseline oil change is every 5,000 mi or 6 months, sooner in severe conditions'
);
select ok(
  (select not bool_or(kind in ('engine-oil', 'spark-plugs', 'engine-air-filter'))
     from schedule_of where nickname = 'Tess')
  and exists (select 1 from schedule_of where nickname = 'Tess' and kind = 'tire-rotation'),
  'an electric car gets no oil, plugs or air filter, but does get tire rotations'
);
select ok(
  exists (select 1 from schedule_of where nickname = 'Truck' and kind = 'fuel-filter')
  and not exists (select 1 from schedule_of where nickname = 'Truck' and kind = 'spark-plugs'),
  'a diesel gets a fuel filter and no spark plugs'
);
select is(
  (select pg_catalog.string_agg(kind || ' ' || interval_miles, ', ' order by kind)
     from schedule_of where nickname = 'Old' and kind in ('engine-coolant', 'spark-plugs')),
  'engine-coolant 30000, spark-plugs 30000',
  'an older car gets the shorter coolant and spark plug intervals'
);

insert into public.service_records (id, vehicle_id, item_id, performed_on, odometer_miles)
select '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', id,
       '2026-07-01', 30000
  from schedule_of where nickname = 'Rav' and kind = 'engine-oil';
insert into public.service_records (id, vehicle_id, item_id, performed_on)
select '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', id,
       '2026-05-01'
  from schedule_of where nickname = 'Rav' and kind = 'battery-test';

select throws_ok(
  $$ select public.set_config_schedule(
       (select config_id from public.vehicles where nickname = 'Rav'), 'motor', '[]') $$,
  '42501', null, 'owners cannot set a schedule'
);

reset role;
create temporary table baseline_ids as select kind, id from schedule_of where nickname = 'Rav';

-- A commercial feed takes over the RAV4's schedule.
select public.set_config_schedule(
  (select config_id from public.vehicles where nickname = 'Rav'),
  'motor',
  '[{"kind": "engine-oil", "task": "Engine oil and filter", "interval_miles": 10000,
     "interval_months": 12, "severe_miles": 5000, "severe_months": 6},
    {"kind": "tire-rotation", "task": "Tire rotation", "interval_miles": 5000},
    {"kind": "drive-belt", "task": "Drive belt inspection", "interval_miles": 60000}]'
);

select is(
  (select row(m.id = b.id, m.task, m.interval_miles, m.source)::text
     from schedule_of m join baseline_ids b using (kind)
    where m.nickname = 'Rav' and m.kind = 'engine-oil'),
  row(true, 'Engine oil and filter', 10000, 'motor')::text,
  'a provider updates an item of the same kind in place, keeping its id'
);
select is(
  (select pg_catalog.string_agg(kind, ' ' order by kind) from schedule_of where nickname = 'Rav'),
  'drive-belt engine-oil tire-rotation',
  'a provider''s schedule replaces the whole baseline'
);
select is(
  (select row(r.item_id = b.id, r.odometer_miles)::text
     from public.service_records r, baseline_ids b
    where r.id = '30000000-0000-0000-0000-000000000001' and b.kind = 'engine-oil'),
  row(true, 30000)::text,
  'a service of a kind the provider also has stays linked to it'
);
select is(
  (select row(item_id, performed_on)::text
     from public.service_records where id = '30000000-0000-0000-0000-000000000002'),
  row(null::uuid, '2026-05-01'::date)::text,
  'a service of a kind the provider dropped is kept, unlinked'
);

select public.fill_baseline_schedule((select config_id from public.vehicles where nickname = 'Rav'));
select is(
  (select count(*) from schedule_of where nickname = 'Rav' and source = 'motor')::int, 3,
  'the baseline never replaces a provider''s schedule'
);

select * from finish();
rollback;
