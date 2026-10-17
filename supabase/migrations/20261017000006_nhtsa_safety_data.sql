-- Recalls and owner complaints from NHTSA's free APIs (no key) for every model year an owner
-- drives. The database fetches them itself: a pg_cron job sends requests with pg_net and stores
-- the answers on its next run, so there is no server, schedule or secret to run elsewhere.
-- Recalls and a per-component complaint summary sync to the phone; raw complaints stay here for
-- the assistant. See ADR 0006.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- When NHTSA was last asked about the config's model year, so the phone can tell "no recalls"
-- from "not checked yet".
alter table public.vehicle_configs
  add column recalls_checked_at    timestamptz,
  add column complaints_checked_at timestamptz;

alter table public.recalls
  add column manufacturer text,
  add column consequence  text,
  add column notes        text,
  add column park_it      boolean not null default false,
  add column park_outside boolean not null default false,
  add column over_the_air boolean not null default false;

create table public.complaints (
  id          uuid primary key default gen_random_uuid(),
  config_id   uuid not null references public.vehicle_configs on delete cascade,
  odi_number  bigint not null,
  components  text[] not null,
  summary     text,
  crash       boolean not null default false,
  fire        boolean not null default false,
  injuries    int not null default 0,
  deaths      int not null default 0,
  incident_on date,
  filed_on    date,
  unique (config_id, odi_number)
);

-- One row per config and component, recomputed from complaints. Small enough to sync.
create table public.complaint_summaries (
  id              uuid primary key default gen_random_uuid(),
  config_id       uuid not null references public.vehicle_configs on delete cascade,
  component       text not null,
  complaints      int not null,
  crashes         int not null,
  fires           int not null,
  injuries        int not null,
  deaths          int not null,
  latest_filed_on date,
  -- The three newest complaints: [{"filed_on": "2024-05-01", "summary": "..."}].
  recent          jsonb not null default '[]',
  unique (config_id, component)
);

-- Requests to NHTSA in flight or backing off, per model year (lower-cased) and kind.
create table public.nhtsa_fetches (
  make         text not null,
  model        text not null,
  year         int  not null,
  kind         text not null check (kind in ('recalls', 'complaints')),
  request_id   bigint,
  requested_at timestamptz,
  failures     int not null default 0,
  retry_after  timestamptz,
  primary key (make, model, year, kind)
);

alter table public.complaints          enable row level security;
alter table public.complaint_summaries enable row level security;
alter table public.nhtsa_fetches       enable row level security;

create policy read_shared on public.complaint_summaries for select to authenticated using (true);

grant select on public.complaint_summaries to authenticated;
grant select, insert, update, delete on
  public.complaints, public.complaint_summaries, public.nhtsa_fetches to service_role;

-- Parsing NHTSA values ---------------------------------------------------------------------------

-- NHTSA writes recall dates day first ("26/01/2012") and complaint dates month first. Also
-- accepts ISO dates, and swaps the order when the expected one cannot be a date.
create function public.nhtsa_date(value text, day_first boolean) returns date
  language plpgsql immutable set search_path = ''
as $$
declare
  parts text[] := pg_catalog.regexp_match(value, '^\s*(\d{1,2})/(\d{1,2})/(\d{4})');
  d int;
  m int;
begin
  if value ~ '^\s*\d{4}-\d{2}-\d{2}' then
    return pg_catalog.left(pg_catalog.btrim(value), 10)::date;
  end if;
  if parts is null then
    return null;
  end if;
  if day_first then
    d := parts[1]::int;
    m := parts[2]::int;
  else
    m := parts[1]::int;
    d := parts[2]::int;
  end if;
  if m > 12 and d <= 12 then
    return pg_catalog.make_date(parts[3]::int, d, m);
  end if;
  return pg_catalog.make_date(parts[3]::int, m, d);
exception
  when datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    return null;
end
$$;

-- true for JSON true or "Yes"/"Y"/"true" in any case; NHTSA uses both.
create function public.nhtsa_flag(value jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select coalesce(
    value = 'true'::jsonb
      or (pg_catalog.jsonb_typeof(value) = 'string'
          and pg_catalog.lower(value #>> '{}') in ('yes', 'y', 'true')),
    false)
$$;

-- Trimmed text, or null when empty.
create function public.nhtsa_text(value jsonb) returns text
  language sql immutable set search_path = ''
as $$ select nullif(pg_catalog.btrim(value #>> '{}'), '') $$;

-- Storing NHTSA answers ------------------------------------------------------------------------

-- The configs of one model year. make and model are matched lower-cased.
create function public.nhtsa_configs(p_make text, p_model text, p_year int) returns uuid[]
  language sql stable set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(c.id), '{}')
    from public.vehicle_configs c
   where pg_catalog.lower(c.make) = p_make
     and pg_catalog.lower(c.model) = p_model
     and c.year = p_year
$$;

-- Replaces the recalls of one model year's configs with NHTSA's `results` array. Rows that did
-- not change are not rewritten, so phones do not download them again.
create function public.nhtsa_store_recalls(p_make text, p_model text, p_year int, results jsonb)
  returns void
  language plpgsql set search_path = ''
as $$
declare
  configs uuid[] := public.nhtsa_configs(p_make, p_model, p_year);
begin
  with parsed as (
    select distinct on (campaign) *
      from (
        select public.nhtsa_text(r -> 'NHTSACampaignNumber') as campaign,
               public.nhtsa_text(r -> 'Manufacturer') as manufacturer,
               public.nhtsa_text(r -> 'Component') as component,
               coalesce(public.nhtsa_text(r -> 'Summary'), '') as summary,
               public.nhtsa_text(r -> 'Consequence') as consequence,
               public.nhtsa_text(r -> 'Remedy') as remedy,
               public.nhtsa_text(r -> 'Notes') as notes,
               public.nhtsa_date(r ->> 'ReportReceivedDate', true) as reported_on,
               public.nhtsa_flag(r -> 'parkIt') as park_it,
               public.nhtsa_flag(r -> 'parkOutSide') as park_outside,
               public.nhtsa_flag(r -> 'overTheAirUpdate') as over_the_air
          from pg_catalog.jsonb_array_elements(results) as r
      ) as raw
     where campaign is not null
     order by campaign
  ),
  gone as (
    delete from public.recalls rc
     where rc.config_id = any (configs)
       and not exists (select 1 from parsed n where n.campaign = rc.campaign)
  )
  insert into public.recalls as rc (config_id, campaign, manufacturer, component, summary,
                                    consequence, remedy, notes, reported_on, park_it,
                                    park_outside, over_the_air)
  select c.id, n.campaign, n.manufacturer, n.component, n.summary, n.consequence, n.remedy,
         n.notes, n.reported_on, n.park_it, n.park_outside, n.over_the_air
    from pg_catalog.unnest(configs) as c (id)
    cross join parsed n
  on conflict (config_id, campaign) do update
     set manufacturer = excluded.manufacturer, component = excluded.component,
         summary = excluded.summary, consequence = excluded.consequence,
         remedy = excluded.remedy, notes = excluded.notes, reported_on = excluded.reported_on,
         park_it = excluded.park_it, park_outside = excluded.park_outside,
         over_the_air = excluded.over_the_air
   where (rc.manufacturer, rc.component, rc.summary, rc.consequence, rc.remedy, rc.notes,
          rc.reported_on, rc.park_it, rc.park_outside, rc.over_the_air)
         is distinct from
         (excluded.manufacturer, excluded.component, excluded.summary, excluded.consequence,
          excluded.remedy, excluded.notes, excluded.reported_on, excluded.park_it,
          excluded.park_outside, excluded.over_the_air);

  update public.vehicle_configs set recalls_checked_at = pg_catalog.now()
   where id = any (configs);
end
$$;

-- Replaces the complaints of one model year's configs with NHTSA's `results` array, then
-- recomputes their per-component summaries.
create function public.nhtsa_store_complaints(p_make text, p_model text, p_year int, results jsonb)
  returns void
  language plpgsql set search_path = ''
as $$
declare
  configs uuid[] := public.nhtsa_configs(p_make, p_model, p_year);
begin
  with parsed as (
    select distinct on (odi_number) *
      from (
        select (r ->> 'odiNumber')::bigint as odi_number,
               -- "ENGINE,POWER TRAIN:AUTOMATIC": top-level components come before any colon.
               coalesce(
                 (select pg_catalog.array_agg(distinct part order by part)
                    from (select pg_catalog.upper(
                                   pg_catalog.btrim(pg_catalog.split_part(x, ':', 1))) as part
                            from pg_catalog.unnest(
                                   pg_catalog.string_to_array(r ->> 'components', ',')) as x
                         ) as parts
                   where part <> ''),
                 array['UNKNOWN OR OTHER']) as components,
               public.nhtsa_text(r -> 'summary') as summary,
               public.nhtsa_flag(r -> 'crash') as crash,
               public.nhtsa_flag(r -> 'fire') as fire,
               coalesce(pg_catalog.substring(r ->> 'numberOfInjuries', '^\d{1,6}')::int, 0)
                 as injuries,
               coalesce(pg_catalog.substring(r ->> 'numberOfDeaths', '^\d{1,6}')::int, 0)
                 as deaths,
               public.nhtsa_date(r ->> 'dateOfIncident', false) as incident_on,
               public.nhtsa_date(r ->> 'dateComplaintFiled', false) as filed_on
          from pg_catalog.jsonb_array_elements(results) as r
         where (r ->> 'odiNumber') ~ '^\d{1,18}$'
      ) as raw
     order by odi_number
  ),
  gone as (
    delete from public.complaints cm
     where cm.config_id = any (configs)
       and not exists (select 1 from parsed n where n.odi_number = cm.odi_number)
  )
  insert into public.complaints as cm (config_id, odi_number, components, summary, crash, fire,
                                       injuries, deaths, incident_on, filed_on)
  select c.id, n.odi_number, n.components, n.summary, n.crash, n.fire, n.injuries, n.deaths,
         n.incident_on, n.filed_on
    from pg_catalog.unnest(configs) as c (id)
    cross join parsed n
  on conflict (config_id, odi_number) do update
     set components = excluded.components, summary = excluded.summary, crash = excluded.crash,
         fire = excluded.fire, injuries = excluded.injuries, deaths = excluded.deaths,
         incident_on = excluded.incident_on, filed_on = excluded.filed_on
   where (cm.components, cm.summary, cm.crash, cm.fire, cm.injuries, cm.deaths, cm.incident_on,
          cm.filed_on)
         is distinct from
         (excluded.components, excluded.summary, excluded.crash, excluded.fire,
          excluded.injuries, excluded.deaths, excluded.incident_on, excluded.filed_on);

  -- A separate statement, so it sees the complaints just written.
  with exploded as (
    select cm.config_id, part as component, cm.summary, cm.crash, cm.fire, cm.injuries,
           cm.deaths, cm.filed_on,
           pg_catalog.row_number() over (
             partition by cm.config_id, part
             order by cm.filed_on desc nulls last, cm.odi_number desc) as newest
      from public.complaints cm
      cross join pg_catalog.unnest(cm.components) as part
     where cm.config_id = any (configs)
  ),
  summed as (
    select e.config_id, e.component,
           pg_catalog.count(*)::int as complaints,
           (pg_catalog.count(*) filter (where e.crash))::int as crashes,
           (pg_catalog.count(*) filter (where e.fire))::int as fires,
           pg_catalog.sum(e.injuries)::int as injuries,
           pg_catalog.sum(e.deaths)::int as deaths,
           pg_catalog.max(e.filed_on) as latest_filed_on,
           coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object('filed_on', e.filed_on,
                                             'summary', pg_catalog.left(e.summary, 600))
               order by e.newest)
               filter (where e.newest <= 3 and e.summary is not null),
             '[]'::jsonb) as recent
      from exploded e
     group by e.config_id, e.component
  ),
  gone as (
    delete from public.complaint_summaries s
     where s.config_id = any (configs)
       and not exists (select 1 from summed n
                        where n.config_id = s.config_id and n.component = s.component)
  )
  insert into public.complaint_summaries as s (config_id, component, complaints, crashes, fires,
                                               injuries, deaths, latest_filed_on, recent)
  select n.config_id, n.component, n.complaints, n.crashes, n.fires, n.injuries, n.deaths,
         n.latest_filed_on, n.recent
    from summed n
  on conflict (config_id, component) do update
     set complaints = excluded.complaints, crashes = excluded.crashes, fires = excluded.fires,
         injuries = excluded.injuries, deaths = excluded.deaths,
         latest_filed_on = excluded.latest_filed_on, recent = excluded.recent
   where (s.complaints, s.crashes, s.fires, s.injuries, s.deaths, s.latest_filed_on, s.recent)
         is distinct from
         (excluded.complaints, excluded.crashes, excluded.fires, excluded.injuries,
          excluded.deaths, excluded.latest_filed_on, excluded.recent);

  update public.vehicle_configs set complaints_checked_at = pg_catalog.now()
   where id = any (configs);
end
$$;

-- Handles NHTSA's answer to one fetch. A success stores the results. Other client errors mean
-- NHTSA has nothing for that model year, so it counts as checked and stored data is kept.
-- Anything else (outage, rate limit, timeout, garbage) is retried later with backoff.
create function public.nhtsa_handle_response(
  p_make text, p_model text, p_year int, p_kind text, status int, body text
) returns void
  language plpgsql set search_path = ''
as $$
declare
  results jsonb;
  configs uuid[];
begin
  if status = 200 then
    begin
      results := body::jsonb -> 'results';
    exception when others then
      results := null;
    end;
  end if;

  if status = 200 and pg_catalog.jsonb_typeof(results) = 'array' then
    if p_kind = 'recalls' then
      perform public.nhtsa_store_recalls(p_make, p_model, p_year, results);
    else
      perform public.nhtsa_store_complaints(p_make, p_model, p_year, results);
    end if;
    delete from public.nhtsa_fetches
     where (make, model, year, kind) = (p_make, p_model, p_year, p_kind);
  elsif status between 400 and 499 and status <> 429 then
    configs := public.nhtsa_configs(p_make, p_model, p_year);
    if p_kind = 'recalls' then
      update public.vehicle_configs set recalls_checked_at = pg_catalog.now()
       where id = any (configs);
    else
      update public.vehicle_configs set complaints_checked_at = pg_catalog.now()
       where id = any (configs);
    end if;
    delete from public.nhtsa_fetches
     where (make, model, year, kind) = (p_make, p_model, p_year, p_kind);
  else
    -- 10 minutes, doubling per failure, at most a day.
    update public.nhtsa_fetches f
       set request_id = null,
           failures = f.failures + 1,
           retry_after = pg_catalog.now()
             + least(interval '10 minutes' * power(2, f.failures), interval '1 day')
     where (f.make, f.model, f.year, f.kind) = (p_make, p_model, p_year, p_kind);
  end if;
end
$$;

-- The fetch job ----------------------------------------------------------------------------

-- Runs every minute. Stores the answers to requests sent on earlier runs, then asks NHTSA about
-- up to `batch` model years whose data is missing or a day old. Only model years someone owns
-- are fetched. pg_net sends requests after this transaction commits.
create function public.nhtsa_sync(batch int default 10) returns void
  language plpgsql set search_path = ''
as $$
declare
  f record;
  url text;
  rid bigint;
begin
  -- A run that overlaps a slow one does nothing.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('public.nhtsa_sync')) then
    return;
  end if;

  for f in
    select n.make, n.model, n.year, n.kind, n.requested_at, r.status_code, r.content,
           r.id as response_id
      from public.nhtsa_fetches n
      left join net._http_response r on r.id = n.request_id
     where n.request_id is not null
  loop
    if f.response_id is not null then
      perform public.nhtsa_handle_response(f.make, f.model, f.year, f.kind,
                                           coalesce(f.status_code, 0), f.content);
    elsif f.requested_at < pg_catalog.now() - interval '10 minutes' then
      -- The response was lost (pg_net keeps them for a few hours); treat it as a failure.
      perform public.nhtsa_handle_response(f.make, f.model, f.year, f.kind, 0, null);
    end if;
  end loop;

  for f in
    select due.make, due.model, due.year, due.kind, due.make_name, due.model_name
      from (
        select pg_catalog.lower(c.make) as make, pg_catalog.lower(c.model) as model, c.year,
               k.kind, pg_catalog.min(c.make) as make_name, pg_catalog.min(c.model) as model_name
          from public.vehicle_configs c
          cross join (values ('recalls'), ('complaints')) as k (kind)
         where exists (select 1 from public.vehicles v where v.config_id = c.id)
           and coalesce(case k.kind when 'recalls' then c.recalls_checked_at
                                    else c.complaints_checked_at end,
                        '-infinity') < pg_catalog.now() - interval '1 day'
         group by 1, 2, 3, 4
      ) as due
      left join public.nhtsa_fetches n
        on (n.make, n.model, n.year, n.kind) = (due.make, due.model, due.year, due.kind)
     where n.request_id is null
       and coalesce(n.retry_after, '-infinity') <= pg_catalog.now()
     order by n.make is not null, due.year desc, due.make, due.model, due.kind
     limit batch
  loop
    url := case f.kind
             when 'recalls' then 'https://api.nhtsa.gov/recalls/recallsByVehicle'
             else 'https://api.nhtsa.gov/complaints/complaintsByVehicle'
           end;
    rid := net.http_get(
      url := url,
      params := pg_catalog.jsonb_build_object('make', f.make_name, 'model', f.model_name,
                                              'modelYear', f.year::text),
      timeout_milliseconds := 30000
    );
    insert into public.nhtsa_fetches as n (make, model, year, kind, request_id, requested_at)
    values (f.make, f.model, f.year, f.kind, rid, pg_catalog.now())
    on conflict (make, model, year, kind) do update
       set request_id = excluded.request_id, requested_at = excluded.requested_at;
  end loop;
end
$$;

revoke all on function
  public.nhtsa_date(text, boolean), public.nhtsa_flag(jsonb), public.nhtsa_text(jsonb),
  public.nhtsa_configs(text, text, int),
  public.nhtsa_store_recalls(text, text, int, jsonb),
  public.nhtsa_store_complaints(text, text, int, jsonb),
  public.nhtsa_handle_response(text, text, int, text, int, text),
  public.nhtsa_sync(int)
  from public, anon, authenticated;

select cron.schedule('nhtsa-sync', '* * * * *', 'select public.nhtsa_sync()');

-- Recalls and complaint summaries reach the phone with the rest of the car's shared data.
alter publication powersync add table public.recalls, public.complaint_summaries;
