-- Run with `supabase test db`. Proves bulletins and complaint mileages from NHTSA's bulk files
-- are stored for owned model years, kept up to date without rewriting unchanged rows, counted by
-- mileage, and readable only where they should be.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Fixtures: two trims of one owned model year, and a model year nobody owns. ----------------

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.vehicle_configs (id, make, model, year, trim) values
  ('20000000-0000-0000-0000-000000000001', 'Honda', 'CR-V', 2017, 'LX'),
  ('20000000-0000-0000-0000-000000000002', 'HONDA', 'cr-v', 2017, 'EX'),
  ('20000000-0000-0000-0000-000000000003', 'Ford', 'Focus', 2014, null);
insert into public.vehicles (owner_id, year, make, model, trim, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 2017, 'Honda', 'CR-V', 'LX', 'Crv'),
  ('00000000-0000-0000-0000-00000000000a', 2017, 'Honda', 'CR-V', 'EX', 'Crv 2');

select is(
  (select array_agg(row(make, model, year, waiting)::text) from public.nhtsa_owned_model_years()),
  array[row('honda', 'cr-v', 2017, true)::text],
  'the importer is told the owned model years, and that they wait for bulletins'
);

-- Bulletins ---------------------------------------------------------------------------------

select public.nhtsa_store_bulletins('honda', 'cr-v', 2017, $json$
[
  {"nhtsa_id": 10181234, "document_id": "19-047", "kind": "warranty", "issued_on": "2019-05-01",
   "components": ["engine", " POWER TRAIN "], "system": "Engine / Cooling",
   "summary": "Oil may dilute with fuel. Coverage extended to 6 years."},
  {"nhtsa_id": 10181235, "kind": "mystery", "summary": "A letter."},
  {"nhtsa_id": 10181235, "kind": "mystery", "summary": "A shorter."},
  {"nhtsa_id": "not a number", "summary": "Skipped."}
]
$json$);

select is((select count(*)::int from public.bulletins), 4,
  'each bulletin is stored once for every trim of the model year');
select is(
  (select row(document_id, kind, issued_on, components, system, summary)::text
     from public.bulletins
    where nhtsa_id = 10181234 and config_id = '20000000-0000-0000-0000-000000000001'),
  row('19-047', 'warranty', '2019-05-01'::date, array['ENGINE', 'POWER TRAIN'],
      'Engine / Cooling', 'Oil may dilute with fuel. Coverage extended to 6 years.')::text,
  'a bulletin keeps its number, kind, date, components and summary'
);
select is((select kind from public.bulletins where nhtsa_id = 10181235 limit 1), 'other',
  'an unknown kind is stored as other');
select is((select summary from public.bulletins where nhtsa_id = 10181235 limit 1), 'A letter.',
  'a bulletin listed twice keeps its fuller listing');
select is(
  (select count(*)::int from public.vehicle_configs where bulletins_checked_at is not null), 2,
  'both trims are marked as checked for bulletins'
);
select is((select array_agg(waiting) from public.nhtsa_owned_model_years()), array[false],
  'a stored model year no longer waits');

-- An unchanged bulletin is not rewritten; a gone one is removed.
create temporary table before as select id, xmin::text as version from public.bulletins
  where nhtsa_id = 10181234;
select public.nhtsa_store_bulletins('honda', 'cr-v', 2017, $json$
[
  {"nhtsa_id": 10181234, "document_id": "19-047", "kind": "warranty", "issued_on": "2019-05-01",
   "components": ["ENGINE", "POWER TRAIN"], "system": "Engine / Cooling",
   "summary": "Oil may dilute with fuel. Coverage extended to 6 years."}
]
$json$);
select is(
  (select array_agg(b.xmin::text order by b.id) from public.bulletins b join before using (id)),
  (select array_agg(version order by id) from before),
  'unchanged bulletins are not rewritten, so phones do not download them again'
);
select is((select count(*)::int from public.bulletins where nhtsa_id = 10181235), 0,
  'a bulletin no longer in the file is removed');

-- Complaint mileage -------------------------------------------------------------------------

select public.nhtsa_handle_response('honda', 'cr-v', 2017, 'complaints', 200, $json$
{"count": 4, "results": [
  {"odiNumber": 12000001, "dateComplaintFiled": "01/12/2024", "components": "ENGINE",
   "summary": "Oil level rising."},
  {"odiNumber": 12000002, "dateComplaintFiled": "02/12/2024", "components": "ENGINE,POWER TRAIN",
   "summary": "Engine and transmission shudder."},
  {"odiNumber": 12000003, "dateComplaintFiled": "03/12/2024", "components": "ENGINE",
   "summary": "Oil smells of fuel."},
  {"odiNumber": 12000004, "dateComplaintFiled": "04/12/2024", "components": "ENGINE",
   "summary": "No mileage given."}
]}
$json$);

select is((select by_mileage from public.complaint_summaries where component = 'ENGINE' limit 1),
  '[]'::jsonb, 'summaries have no mileage bands before mileages are imported');

select public.nhtsa_store_complaint_miles($json$
[
  {"odi_number": 12000001, "miles": 81200},
  {"odi_number": 12000002, "miles": 88999},
  {"odi_number": 12000003, "miles": 93000},
  {"odi_number": 12000004, "miles": 0},
  {"odi_number": 99999999, "miles": 5000},
  {"odi_number": "x", "miles": 1}
]
$json$);
select is((select count(*)::int from public.complaint_miles), 4,
  'mileages are stored by ODI number, leaving out zero and garbage');

select public.nhtsa_refresh_complaint_mileage();
select is(
  (select by_mileage from public.complaint_summaries
    where component = 'ENGINE' and config_id = '20000000-0000-0000-0000-000000000001'),
  '[{"from": 80000, "complaints": 2}, {"from": 90000, "complaints": 1}]'::jsonb,
  'complaints are counted per 10,000-mile band, lowest first'
);
select is(
  (select by_mileage from public.complaint_summaries
    where component = 'POWER TRAIN' and config_id = '20000000-0000-0000-0000-000000000002'),
  '[{"from": 80000, "complaints": 1}]'::jsonb,
  'a complaint about two parts counts for each, on every trim'
);

create temporary table summaries_before as
  select id, xmin::text as version from public.complaint_summaries;
select public.nhtsa_refresh_complaint_mileage();
select is(
  (select array_agg(s.xmin::text order by s.id)
     from public.complaint_summaries s join summaries_before using (id)),
  (select array_agg(version order by id) from summaries_before),
  'an unchanged count is not rewritten'
);

-- NHTSA's API answering again keeps the bands, since it refreshes them itself.
select public.nhtsa_handle_response('honda', 'cr-v', 2017, 'complaints', 200, $json$
{"count": 1, "results": [
  {"odiNumber": 12000001, "dateComplaintFiled": "01/12/2024", "components": "ENGINE",
   "summary": "Oil level rising."}
]}
$json$);
select is(
  (select by_mileage from public.complaint_summaries
    where component = 'ENGINE' and config_id = '20000000-0000-0000-0000-000000000001'),
  '[{"from": 80000, "complaints": 1}]'::jsonb,
  'fresh complaints from the API are counted by mileage straight away'
);

select is(
  (select miles from public.complaints_with_miles where odi_number = 12000001 limit 1), 81200,
  'the assistant reads complaints with their mileage'
);

-- Access ------------------------------------------------------------------------------------

select table_privs_are('public', 'bulletins', 'authenticated', array['SELECT'],
  'bulletins are read-only to users');
select table_privs_are('public', 'complaint_miles', 'authenticated', array[]::text[],
  'complaint mileages stay on the server');
select table_privs_are('public', 'complaints_with_miles', 'authenticated', array[]::text[],
  'complaints with mileage stay on the server');
select ok(
  not has_function_privilege('authenticated',
    'public.nhtsa_store_bulletins(text, text, int, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.nhtsa_store_complaint_miles(jsonb)',
    'execute'),
  'owners cannot store bulletins or mileages'
);

select * from finish();
rollback;
