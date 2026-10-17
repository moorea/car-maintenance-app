-- Maintenance schedules come from providers. A provider sets a config's whole schedule with
-- set_config_schedule, tagging each item with its source. Until a commercial feed is chosen,
-- every config gets the baseline: general, conservative intervals by powertrain, which the app
-- labels as general guidance rather than the manufacturer's schedule. See ADR 0010.

-- A stable key for what an item is ("engine-oil"), the same across providers, so a provider
-- replacing another keeps each item's id and the owner's service history stays attached.
alter table public.maintenance_items
  add column kind text check (kind ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint maintenance_items_source_check check (source ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint maintenance_items_task_check check (length(task) between 1 and 80),
  add constraint maintenance_items_kind_unique unique (config_id, kind);

-- Replaces a config's schedule with p_items from p_source, in one transaction so the phone never
-- syncs a half-written schedule. Each item is
-- {"kind", "task", "interval_miles", "interval_months", "severe_miles", "severe_months"}.
-- An item whose kind the config already has is updated in place, keeping its id; unchanged rows
-- are not rewritten, so phones do not download them again. Items of kinds the new schedule lacks
-- are deleted, and service records that pointed at them keep their details without the link.
create function public.set_config_schedule(p_config uuid, p_source text, p_items jsonb)
  returns void
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  kinds text[];
begin
  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(i.kind) into kinds
    from pg_catalog.jsonb_to_recordset(p_items) as i (kind text);
  kinds := coalesce(kinds, '{}');
  if pg_catalog.array_position(kinds, null) is not null then
    raise exception 'every schedule item needs a kind' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(kinds)
     <> (select pg_catalog.count(distinct k) from pg_catalog.unnest(kinds) as k) then
    raise exception 'schedule items need different kinds' using errcode = '22023';
  end if;

  -- One writer per config at a time, so two providers cannot interleave their steps.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_config::text, 1));

  update public.service_records r
     set item_id = null
    from public.maintenance_items m
   where r.item_id = m.id
     and m.config_id = p_config
     and (m.kind is null or not m.kind = any (kinds));

  delete from public.maintenance_items m
   where m.config_id = p_config
     and (m.kind is null or not m.kind = any (kinds));

  update public.maintenance_items m
     set task = n.task,
         interval_miles = n.interval_miles,
         interval_months = n.interval_months,
         severe_miles = n.severe_miles,
         severe_months = n.severe_months,
         source = p_source
    from pg_catalog.jsonb_to_recordset(p_items) as n (
      kind text, task text, interval_miles int, interval_months int,
      severe_miles int, severe_months int
    )
   where m.config_id = p_config
     and m.kind = n.kind
     and (m.task, m.interval_miles, m.interval_months, m.severe_miles, m.severe_months, m.source)
         is distinct from
         (n.task, n.interval_miles, n.interval_months, n.severe_miles, n.severe_months, p_source);

  insert into public.maintenance_items
    (config_id, kind, task, interval_miles, interval_months, severe_miles, severe_months, source)
  select p_config, n.kind, n.task, n.interval_miles, n.interval_months, n.severe_miles,
         n.severe_months, p_source
    from pg_catalog.jsonb_to_recordset(p_items) as n (
      kind text, task text, interval_miles int, interval_months int,
      severe_miles int, severe_months int
    )
   where not exists (
     select 1 from public.maintenance_items m where m.config_id = p_config and m.kind = n.kind
   );
end;
$$;

-- Providers run on the server with the service role. Owners cannot write shared schedules.
revoke all on function public.set_config_schedule(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_config_schedule(uuid, text, jsonb) to service_role;

-- The baseline provider -------------------------------------------------------------------------

-- What drives a car, as far as its schedule cares: 'gas' (also when unknown, the most common in
-- the US), 'hybrid' (plug-in too), 'diesel' or 'electric'. Reads the engine the VIN decoded to
-- ("Electric", "2.5L 4-cyl hybrid", "3.0L 6-cyl diesel"), and the make and model for a car typed
-- in without one.
create function public.powertrain_of(p_make text, p_model text, p_engine text) returns text
  language sql immutable set search_path = ''
as $$
  select case
    when p_engine ~* 'hybrid' then 'hybrid'
    when p_engine ~* 'diesel' then 'diesel'
    when p_engine ~* 'electric' then 'electric'
    when p_engine is not null then 'gas'
    when lower(p_make) in ('tesla', 'rivian', 'lucid', 'polestar', 'fisker') then 'electric'
    when p_model ~* '(^|[^a-z])(ev\d*|electric|e-tron|leaf|bolt|mach-e|lightning|ioniq ?[5-9]|bz4x|lyriq|ariya|id\.\d|taycan|i[x3-7]|eq[a-z]+|prologue)([^a-z]|$)'
      then 'electric'
    when p_model ~* 'hybrid|prius|plug-in|phev' then 'hybrid'
    else 'gas'
  end
$$;

-- General, conservative intervals: at or ahead of what most manufacturers ask, so following them
-- never lets an item lapse. Severe intervals apply to cars marked as driven in severe conditions
-- (towing, short trips, dust, extreme heat or cold). Not readable by owners; they see the copies
-- in maintenance_items.
create table public.baseline_schedule (
  kind            text primary key,
  task            text not null,
  interval_miles  int check (interval_miles > 0),
  interval_months int check (interval_months > 0),
  severe_miles    int check (severe_miles > 0),
  severe_months   int check (severe_months > 0),
  powertrains     text[] not null
    check (powertrains <@ array['gas', 'hybrid', 'diesel', 'electric'] and powertrains <> '{}'),
  check (interval_miles is not null or interval_months is not null)
);
alter table public.baseline_schedule enable row level security;
revoke all on table public.baseline_schedule from public, anon, authenticated;
grant select, insert, update, delete on public.baseline_schedule to service_role;

insert into public.baseline_schedule
  (kind, task, interval_miles, interval_months, severe_miles, severe_months, powertrains)
values
  ('engine-oil', 'Oil & filter change', 5000, 6, 3000, 6, '{gas,hybrid,diesel}'),
  ('tire-rotation', 'Tire rotation', 5000, 6, null, null, '{gas,hybrid,diesel,electric}'),
  ('brake-inspection', 'Brake inspection', 12000, 12, 6000, 6, '{gas,hybrid,diesel,electric}'),
  ('cabin-air-filter', 'Cabin air filter', 15000, 12, 7500, 12, '{gas,hybrid,diesel,electric}'),
  ('engine-air-filter', 'Engine air filter', 15000, 24, 7500, 12, '{gas,hybrid,diesel}'),
  ('fuel-filter', 'Fuel filter', 15000, 24, null, null, '{diesel}'),
  ('brake-fluid', 'Brake fluid', 30000, 24, null, null, '{gas,hybrid,diesel,electric}'),
  ('battery-test', '12-volt battery test', null, 12, null, null, '{gas,hybrid,diesel,electric}'),
  ('spark-plugs', 'Spark plugs', 60000, null, null, null, '{gas,hybrid}'),
  ('transmission-fluid', 'Transmission fluid', 60000, null, 30000, null, '{gas,hybrid,diesel}'),
  ('engine-coolant', 'Engine coolant', 60000, 60, null, null, '{gas,hybrid,diesel}');

-- Gives a config the baseline schedule for its powertrain, unless another provider has already
-- set its schedule.
create function public.fill_baseline_schedule(p_config uuid) returns void
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  powertrain text;
begin
  select public.powertrain_of(c.make, c.model, c.engine) into powertrain
    from public.vehicle_configs c
   where c.id = p_config;
  if not found then
    return;
  end if;
  if exists (
    select 1 from public.maintenance_items m
     where m.config_id = p_config and m.source <> 'baseline'
  ) then
    return;
  end if;

  perform public.set_config_schedule(
    p_config,
    'baseline',
    coalesce(
      (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'kind', b.kind, 'task', b.task,
                'interval_miles', b.interval_miles, 'interval_months', b.interval_months,
                'severe_miles', b.severe_miles, 'severe_months', b.severe_months))
         from public.baseline_schedule b
        where powertrain = any (b.powertrains)),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.fill_baseline_schedule(uuid) from public, anon, authenticated;
grant execute on function public.fill_baseline_schedule(uuid) to service_role;

-- A new config gets its schedule in the same transaction as the car that created it, so the
-- phone receives both in one sync.
create function public.fill_new_config_schedule() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.fill_baseline_schedule(new.id);
  return null;
end;
$$;

revoke all on function public.fill_new_config_schedule() from public, anon, authenticated;

create trigger fill_schedule
  after insert on public.vehicle_configs
  for each row execute function public.fill_new_config_schedule();

-- Configs created before this migration.
select public.fill_baseline_schedule(c.id)
  from public.vehicle_configs c
 where not exists (select 1 from public.maintenance_items m where m.config_id = c.id);
