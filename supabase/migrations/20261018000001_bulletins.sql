-- Manufacturer communications (technical service bulletins, warranty extensions, service
-- campaigns) and the mileage each owner complaint happened at. NHTSA publishes both only as bulk
-- files, not through its API, so a GitHub Actions job (packages/importer) downloads them, keeps
-- the rows for model years someone owns, and stores them through the functions below. Bulletins
-- and per-mileage complaint counts sync to the phone; complaint mileages stay here for the
-- assistant. See ADR 0013.

alter table public.vehicle_configs
  -- When the importer last stored this model year's bulletins, so the phone can tell "no
  -- bulletins" from "not imported yet". Set once, like recalls_checked_at.
  add column bulletins_checked_at timestamptz;

create table public.bulletins (
  id          uuid primary key default gen_random_uuid(),
  config_id   uuid not null references public.vehicle_configs on delete cascade,
  -- NHTSA's number for the communication.
  nhtsa_id    bigint not null,
  -- The manufacturer's own number, such as "19-047".
  document_id text,
  kind        text not null
              check (kind in ('bulletin', 'warranty', 'campaign', 'software', 'emissions', 'other')),
  issued_on   date,
  -- NHTSA's top-level components, upper case.
  components  text[] not null default '{}',
  -- The manufacturer's own system and subsystem, such as "Engine / Cooling".
  system      text,
  summary     text not null,
  unique (config_id, nhtsa_id)
);

-- The mileage an owner gave for a complaint, by ODI number. Server only, like raw complaints.
create table public.complaint_miles (
  odi_number bigint primary key,
  miles      int not null check (miles > 0)
);

-- Complaints per 10,000-mile band: [{"from": 80000, "complaints": 4}], lowest first.
alter table public.complaint_summaries
  add column by_mileage jsonb not null default '[]';

-- Which bulk files were imported, by their ETag, so an unchanged day costs nothing.
create table public.nhtsa_imports (
  file        text primary key,
  etag        text not null,
  imported_at timestamptz not null default pg_catalog.now()
);

alter table public.bulletins       enable row level security;
alter table public.complaint_miles enable row level security;
alter table public.nhtsa_imports   enable row level security;

create policy read_shared on public.bulletins for select to authenticated using (true);

grant select on public.bulletins to authenticated;
grant select, insert, update, delete on
  public.bulletins, public.complaint_miles, public.nhtsa_imports to service_role;

-- Raw complaints with their mileage, for the assistant (service role only).
create view public.complaints_with_miles with (security_invoker = true) as
  select c.*, m.miles
    from public.complaints c
    left join public.complaint_miles m using (odi_number);

grant select on public.complaints_with_miles to service_role;

-- Model years -------------------------------------------------------------------------------

-- The model years someone owns, up to next year's, as nhtsa_run fetches them: make and model
-- lower-cased, whether any of their configs is still waiting for its first bulletins, and how
-- many bulletins are stored for them, so the importer can refuse to wipe them on a misread.
create function public.nhtsa_owned_model_years()
  returns table (make text, model text, year int, waiting boolean, bulletins int)
  language sql stable set search_path = ''
as $$
  with owned as (
    select pg_catalog.lower(c.make) as make, pg_catalog.lower(c.model) as model, c.year,
           pg_catalog.bool_or(c.bulletins_checked_at is null) as waiting
      from public.vehicle_configs c
     where exists (select 1 from public.vehicles v where v.config_id = c.id)
       and c.year <= pg_catalog.date_part('year', pg_catalog.now())::int + 1
     group by 1, 2, 3
  )
  select o.make, o.model, o.year, o.waiting,
         (select pg_catalog.count(distinct b.nhtsa_id)::int
            from public.bulletins b
            join public.vehicle_configs c on c.id = b.config_id
           where pg_catalog.lower(c.make) = o.make
             and pg_catalog.lower(c.model) = o.model
             and c.year = o.year)
    from owned o
   order by o.year desc, o.make, o.model
$$;

-- Bulletins ---------------------------------------------------------------------------------

-- Replaces one model year's bulletins with `rows`, the importer's complete list for it:
-- [{"nhtsa_id": 10181234, "document_id": "19-047", "kind": "warranty", "issued_on": "2019-05-01",
--   "components": ["ENGINE"], "system": "Engine / Cooling", "summary": "..."}]
-- Rows that did not change are not rewritten, so phones do not download them again.
create function public.nhtsa_store_bulletins(p_make text, p_model text, p_year int, rows jsonb)
  returns void
  language plpgsql set search_path = ''
as $$
declare
  configs uuid[] := public.nhtsa_configs(p_make, p_model, p_year);
begin
  with parsed as (
    select distinct on (nhtsa_id) *
      from (
        select (r ->> 'nhtsa_id')::bigint as nhtsa_id,
               public.nhtsa_text(r -> 'document_id') as document_id,
               case when r ->> 'kind' in ('bulletin', 'warranty', 'campaign', 'software',
                                          'emissions')
                    then r ->> 'kind' else 'other' end as kind,
               public.nhtsa_date(r ->> 'issued_on', false) as issued_on,
               coalesce(
                 (select pg_catalog.array_agg(distinct pg_catalog.upper(pg_catalog.btrim(c))
                                              order by pg_catalog.upper(pg_catalog.btrim(c)))
                    from pg_catalog.jsonb_array_elements_text(
                           case pg_catalog.jsonb_typeof(r -> 'components')
                                when 'array' then r -> 'components' else '[]' end) as c
                   where pg_catalog.btrim(c) <> ''),
                 '{}') as components,
               public.nhtsa_text(r -> 'system') as system,
               coalesce(public.nhtsa_text(r -> 'summary'), '') as summary
          from pg_catalog.jsonb_array_elements(rows) as r
         where (r ->> 'nhtsa_id') ~ '^\d{1,18}$'
      ) as raw
     order by nhtsa_id, pg_catalog.length(summary) desc
  ),
  gone as (
    delete from public.bulletins b
     where b.config_id = any (configs)
       and not exists (select 1 from parsed n where n.nhtsa_id = b.nhtsa_id)
  )
  insert into public.bulletins as b (config_id, nhtsa_id, document_id, kind, issued_on,
                                     components, system, summary)
  select c.id, n.nhtsa_id, n.document_id, n.kind, n.issued_on, n.components, n.system,
         n.summary
    from pg_catalog.unnest(configs) as c (id)
    cross join parsed n
  on conflict (config_id, nhtsa_id) do update
     set document_id = excluded.document_id, kind = excluded.kind,
         issued_on = excluded.issued_on, components = excluded.components,
         system = excluded.system, summary = excluded.summary
   where (b.document_id, b.kind, b.issued_on, b.components, b.system, b.summary)
         is distinct from
         (excluded.document_id, excluded.kind, excluded.issued_on, excluded.components,
          excluded.system, excluded.summary);

  update public.vehicle_configs set bulletins_checked_at = pg_catalog.now()
   where id = any (configs) and bulletins_checked_at is null;
end
$$;

-- Complaint mileage -------------------------------------------------------------------------

-- Recomputes the per-mileage counts of the given configs' complaint summaries from the stored
-- complaints and their mileages. Unchanged summaries are not rewritten.
create function public.nhtsa_store_complaint_mileage(configs uuid[]) returns void
  language sql set search_path = ''
as $$
  with banded as (
    select cm.config_id, part as component, (m.miles / 10000) * 10000 as band
      from public.complaints cm
      join public.complaint_miles m using (odi_number)
      cross join pg_catalog.unnest(cm.components) as part
     where cm.config_id = any (configs)
  ),
  counted as (
    select config_id, component, band, pg_catalog.count(*)::int as complaints
      from banded
     group by 1, 2, 3
  ),
  bands as (
    select s.id,
           coalesce(
             (select pg_catalog.jsonb_agg(
                       pg_catalog.jsonb_build_object('from', n.band, 'complaints', n.complaints)
                       order by n.band)
                from counted n
               where n.config_id = s.config_id and n.component = s.component),
             '[]'::jsonb) as by_mileage
      from public.complaint_summaries s
     where s.config_id = any (configs)
  )
  update public.complaint_summaries s
     set by_mileage = b.by_mileage
    from bands b
   where s.id = b.id and s.by_mileage is distinct from b.by_mileage
$$;

-- Stores mileages from NHTSA's complaint files: [{"odi_number": 11184030, "miles": 88000}].
-- Unchanged ones are not rewritten. The importer refreshes the summaries once it is done.
create function public.nhtsa_store_complaint_miles(rows jsonb) returns void
  language sql set search_path = ''
as $$
  insert into public.complaint_miles as m (odi_number, miles)
  select distinct on (odi_number) odi_number, miles
    from (
      -- Cast only what matched, whatever order the planner checks the conditions in.
      select case when (r ->> 'odi_number') ~ '^\d{1,18}$'
                  then (r ->> 'odi_number')::bigint end as odi_number,
             case when (r ->> 'miles') ~ '^\d{1,7}$' then (r ->> 'miles')::int end as miles
        from pg_catalog.jsonb_array_elements(rows) as r
    ) as parsed
   where odi_number is not null and miles > 0
   order by odi_number, miles desc
  on conflict (odi_number) do update set miles = excluded.miles
   where m.miles is distinct from excluded.miles
$$;

-- Refreshes the per-mileage counts of every owned config, once a whole import is stored.
create function public.nhtsa_refresh_complaint_mileage() returns void
  language sql set search_path = ''
as $$
  select public.nhtsa_store_complaint_mileage(
    (select coalesce(pg_catalog.array_agg(distinct v.config_id), '{}')
       from public.vehicles v where v.config_id is not null))
$$;

-- Complaints NHTSA's API sends keep their counts by mileage up to date too: the same answer
-- handling as before, then a refresh of that model year's bands.
create or replace function public.nhtsa_handle_response(
  p_make text, p_model text, p_year int, p_kind text, status int, body text
) returns void
  language plpgsql set search_path = ''
as $$
declare
  results jsonb;
begin
  if status = 200 then
    begin
      results := body::jsonb -> 'results';
    exception when others then
      results := null;
    end;
  end if;

  if pg_catalog.jsonb_typeof(results) is distinct from 'array' then
    perform public.nhtsa_fetch_failed(p_make, p_model, p_year, p_kind);
    return;
  end if;

  if p_kind = 'recalls' then
    perform public.nhtsa_store_recalls(p_make, p_model, p_year, results);
  else
    perform public.nhtsa_store_complaints(p_make, p_model, p_year, results);
    perform public.nhtsa_store_complaint_mileage(public.nhtsa_configs(p_make, p_model, p_year));
  end if;
  update public.nhtsa_fetches
     set checked_at = pg_catalog.now(), request_id = null, failures = 0, retry_after = null
   where (make, model, year, kind) = (p_make, p_model, p_year, p_kind);
end
$$;

revoke all on function
  public.nhtsa_owned_model_years(),
  public.nhtsa_store_bulletins(text, text, int, jsonb),
  public.nhtsa_store_complaint_mileage(uuid[]),
  public.nhtsa_store_complaint_miles(jsonb),
  public.nhtsa_refresh_complaint_mileage(),
  public.nhtsa_handle_response(text, text, int, text, int, text)
  from public, anon, authenticated;

-- Bulletins reach the phone with the rest of the car's shared data.
alter publication powersync add table public.bulletins;
