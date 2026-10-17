-- Warranty coverages the owner enters for their car, from the paperwork. Unlike service history
-- they are editable: a typo in a mileage limit should be fixed, not appended to. Deleting the
-- car (or the account) deletes them.

create table public.warranties (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles on delete cascade,
  kind          text not null check (kind in ('basic', 'powertrain', 'corrosion', 'emissions',
                                              'hybrid-battery', 'extended', 'other')),
  provider      text,
  starts_on     date not null,
  months        int check (months between 1 and 1200),
  end_miles     int check (end_miles between 1 and 2000000),
  policy_number text,
  notes         text,
  updated_at    timestamptz not null default now(),
  constraint has_a_limit check (months is not null or end_miles is not null)
);
create index on public.warranties (vehicle_id);

alter table public.warranties enable row level security;

-- The check on writes stops a warranty being attached to, or moved onto, someone else's car.
create policy owner_all on public.warranties for all to authenticated
  using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));

grant select, insert, update, delete on public.warranties to authenticated, service_role;

alter publication powersync add table public.warranties;
