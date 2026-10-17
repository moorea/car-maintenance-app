-- Run with `supabase test db`. Proves NHTSA recalls and complaints are fetched for owned model
-- years and stored, summarised and retried correctly. Requests are never sent: pg_net only sends
-- after commit, and this test rolls back. Responses are handed to nhtsa_handle_response directly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Dates -------------------------------------------------------------------------------------

select is(public.nhtsa_date('26/01/2012', true), '2012-01-26'::date, 'recall dates are day first');
select is(public.nhtsa_date('05/02/2023', true), '2023-02-05'::date,
  'an ambiguous recall date is read day first');
select is(public.nhtsa_date('06/15/2021', false), '2021-06-15'::date,
  'complaint dates are month first');
select is(public.nhtsa_date('15/06/2021', false), '2021-06-15'::date,
  'a date that cannot be month first is read day first');
select is(public.nhtsa_date('2024-03-09T00:00:00', true), '2024-03-09'::date, 'ISO dates parse');
select ok(public.nhtsa_date('soon', true) is null and public.nhtsa_date(null, true) is null
  and public.nhtsa_date('31/31/2020', true) is null, 'anything else is no date');

-- Fixtures: two trims of one model year that someone owns, and a model year nobody owns. ------

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.vehicle_configs (id, make, model, year, trim) values
  ('10000000-0000-0000-0000-000000000001', 'Toyota', 'RAV4', 2021, 'LE'),
  ('10000000-0000-0000-0000-000000000002', 'TOYOTA', 'rav4', 2021, 'XLE'),
  ('10000000-0000-0000-0000-000000000003', 'Honda', 'Civic', 2019, null);
insert into public.vehicles (owner_id, year, make, model, trim, nickname) values
  ('00000000-0000-0000-0000-00000000000a', 2021, 'Toyota', 'RAV4', 'LE', 'Rav'),
  ('00000000-0000-0000-0000-00000000000a', 2021, 'Toyota', 'RAV4', 'XLE', 'Rav 2');

-- Requests ----------------------------------------------------------------------------------

select public.nhtsa_sync();
select is(
  (select array_agg(row(make, model, year, kind)::text order by kind)
     from public.nhtsa_fetches where request_id is not null),
  array[row('toyota', 'rav4', 2021, 'complaints')::text, row('toyota', 'rav4', 2021, 'recalls')::text],
  'one request per kind for each owned model year, shared by its trims'
);
select ok(not exists (select 1 from public.nhtsa_fetches where make = 'honda'),
  'model years nobody owns are not fetched');

select public.nhtsa_sync();
select is((select count(*)::int from public.nhtsa_fetches), 2,
  'a model year with a request in flight is not asked again');

-- Recalls -----------------------------------------------------------------------------------

select public.nhtsa_handle_response('toyota', 'rav4', 2021, 'recalls', 200, $json$
{"Count": 3, "results": [
  {"Manufacturer": "Toyota Motor Engineering & Manufacturing", "NHTSACampaignNumber": "23V123000",
   "parkIt": true, "parkOutSide": false, "overTheAirUpdate": false,
   "ReportReceivedDate": "26/01/2023", "Component": "ELECTRICAL SYSTEM: WIRING",
   "Summary": "Wiring may chafe.", "Consequence": "A fire may occur.", "Remedy": "Dealers will fix it.",
   "Notes": "Owners may call 1-800.", "ModelYear": "2021", "Make": "TOYOTA", "Model": "RAV4"},
  {"NHTSACampaignNumber": "22V456000", "parkIt": false, "parkOutSide": "Yes",
   "ReportReceivedDate": "05/02/2022", "Component": "FUEL SYSTEM, GASOLINE",
   "Summary": "Fuel pump may fail."},
  {"NHTSACampaignNumber": "22V456000", "Summary": "Duplicate listing."}
]}
$json$);

select is((select count(*)::int from public.recalls), 4,
  'each recall is stored once for every trim of the model year');
select is(
  (select row(manufacturer, component, summary, consequence, remedy, notes, reported_on, park_it,
              park_outside, over_the_air)::text
     from public.recalls
    where campaign = '23V123000' and config_id = '10000000-0000-0000-0000-000000000001'),
  row('Toyota Motor Engineering & Manufacturing', 'ELECTRICAL SYSTEM: WIRING', 'Wiring may chafe.',
      'A fire may occur.', 'Dealers will fix it.', 'Owners may call 1-800.', '2023-01-26'::date,
      true, false, false)::text,
  'a recall keeps its details, date and warnings'
);
select ok((select park_outside from public.recalls where campaign = '22V456000' limit 1),
  '"Yes" reads as true');
select is(
  (select count(*)::int from public.vehicle_configs
    where recalls_checked_at is not null and complaints_checked_at is null),
  2, 'both trims are marked as checked for recalls only');
select is((select count(*)::int from public.nhtsa_fetches where kind = 'recalls'), 0,
  'a stored answer clears its fetch');

select public.nhtsa_handle_response('toyota', 'rav4', 2021, 'recalls', 200,
  '{"Count": 1, "results": [{"NHTSACampaignNumber": "23V123000", "Summary": "Wiring may chafe."}]}');
select is((select array_agg(distinct campaign) from public.recalls), array['23V123000'],
  'a recall NHTSA no longer lists is removed');

-- Complaints --------------------------------------------------------------------------------

select public.nhtsa_handle_response('toyota', 'rav4', 2021, 'complaints', 200, $json$
{"count": 5, "results": [
  {"odiNumber": 11000001, "crash": true, "fire": false, "numberOfInjuries": 2, "numberOfDeaths": 0,
   "dateOfIncident": "01/10/2024", "dateComplaintFiled": "01/12/2024",
   "components": "ENGINE,FUEL/PROPULSION SYSTEM", "summary": "Engine stalled on the highway."},
  {"odiNumber": 11000002, "crash": false, "fire": true, "numberOfInjuries": 0, "numberOfDeaths": 0,
   "dateComplaintFiled": "03/01/2024", "components": "ENGINE", "summary": "Smoke from the engine bay."},
  {"odiNumber": 11000003, "crash": false, "fire": false, "dateComplaintFiled": "02/01/2024",
   "components": "ENGINE:COOLING", "summary": "Coolant leak."},
  {"odiNumber": 11000004, "dateComplaintFiled": "04/01/2023", "components": "ENGINE",
   "summary": "Oil consumption."},
  {"odiNumber": 11000005, "dateComplaintFiled": "05/01/2022", "components": "",
   "summary": "Something else."}
]}
$json$);

select is((select count(*)::int from public.complaints), 10,
  'each complaint is stored once for every trim');
select is(
  (select row(complaints, crashes, fires, injuries, deaths, latest_filed_on)::text
     from public.complaint_summaries
    where component = 'ENGINE' and config_id = '10000000-0000-0000-0000-000000000001'),
  row(4, 1, 1, 2, 0, '2024-03-01'::date)::text,
  'complaints are counted per component, with crashes, fires and injuries'
);
select is(
  (select array_agg(e ->> 'summary' order by ord)
     from public.complaint_summaries s,
          jsonb_array_elements(s.recent) with ordinality as r (e, ord)
    where component = 'ENGINE' and config_id = '10000000-0000-0000-0000-000000000001'),
  array['Smoke from the engine bay.', 'Coolant leak.', 'Engine stalled on the highway.'],
  'a summary keeps the three newest complaints, newest first'
);
select is(
  (select array_agg(component order by component) from public.complaint_summaries
    where config_id = '10000000-0000-0000-0000-000000000002'),
  array['ENGINE', 'FUEL/PROPULSION SYSTEM', 'UNKNOWN OR OTHER'],
  'components are split, cut at the colon, and an empty list counts as unknown'
);
select ok(
  (select bool_and(complaints_checked_at is not null) from public.vehicle_configs
    where id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')),
  'both trims are marked as checked for complaints'
);

select public.nhtsa_handle_response('toyota', 'rav4', 2021, 'complaints', 200,
  '{"count": 1, "results": [{"odiNumber": 11000004, "components": "ENGINE", "summary": "Oil."}]}');
select is((select array_agg(component) from public.complaint_summaries
            where config_id = '10000000-0000-0000-0000-000000000001'),
  array['ENGINE'], 'summaries for components with no complaints left are removed');

-- Checked data is not fetched again for a day ----------------------------------------------

select public.nhtsa_sync();
select is((select count(*)::int from public.nhtsa_fetches), 0,
  'a model year checked within the day is not fetched');

update public.vehicle_configs set recalls_checked_at = now() - interval '25 hours';
select public.nhtsa_sync();
select is((select count(*)::int from public.nhtsa_fetches where kind = 'recalls'), 1,
  'a day later it is fetched again');

-- Failures ----------------------------------------------------------------------------------

select public.nhtsa_handle_response('toyota', 'rav4', 2021, 'recalls', 503, 'Service Unavailable');
select ok(
  (select request_id is null and failures = 1 and retry_after > now() + interval '9 minutes'
     from public.nhtsa_fetches where kind = 'recalls'),
  'an outage is retried after a backoff'
);
select is((select count(*)::int from public.recalls), 2, 'an outage keeps stored recalls');
select public.nhtsa_sync();
select ok((select request_id is null from public.nhtsa_fetches where kind = 'recalls'),
  'nothing is asked again before the backoff ends');

update public.nhtsa_fetches set retry_after = now() - interval '1 second';
select public.nhtsa_sync();
select public.nhtsa_handle_response('toyota', 'rav4', 2021, 'recalls', 200, '<html>oops</html>');
select ok(
  (select failures = 2 and retry_after > now() + interval '19 minutes'
     from public.nhtsa_fetches where kind = 'recalls'),
  'an answer that is not JSON is a failure, and the backoff doubles'
);

update public.vehicle_configs set recalls_checked_at = null;
select public.nhtsa_handle_response('toyota', 'rav4', 2021, 'recalls', 400, '{"message": "No results"}');
select ok(
  (select bool_and(recalls_checked_at is not null) from public.vehicle_configs where make ilike 'toyota')
  and (select count(*) from public.recalls) = 2
  and not exists (select 1 from public.nhtsa_fetches where kind = 'recalls'),
  'a client error counts as checked and keeps stored recalls'
);

select is((select schedule from cron.job where jobname = 'nhtsa-sync'), '* * * * *',
  'the fetch job runs every minute');

select * from finish();
rollback;
