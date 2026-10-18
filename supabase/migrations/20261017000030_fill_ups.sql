-- Fill-ups at the pump and charging sessions the owner logs for their car. Each one's odometer
-- counts as a reading on the phone, read from the fill-up itself rather than copied, so they are
-- editable: a typo in a mileage should be fixed, and a forgotten fill-up entered late. Deleting
-- the car (or the account) deletes them.

create table public.fill_ups (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.vehicles on delete cascade,
  filled_on       date not null,
  odometer_miles  int not null check (odometer_miles between 0 and 2000000),
  energy          text not null check (energy in ('fuel', 'electric')),
  -- Gallons of fuel or kWh of charge.
  quantity        double precision not null check (quantity > 0 and quantity <= 1000),
  -- The total paid, in cents; null when free or not known.
  cost_cents      int check (cost_cents between 0 and 1000000),
  full_tank       boolean not null default true,
  missed_previous boolean not null default false,
  station         text,
  notes           text,
  updated_at      timestamptz not null default now()
);
create index on public.fill_ups (vehicle_id, filled_on);

alter table public.fill_ups enable row level security;

-- The check on writes stops a fill-up being attached to, or moved onto, someone else's car.
create policy owner_all on public.fill_ups for all to authenticated
  using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));

grant select, insert, update, delete on public.fill_ups to authenticated, service_role;

alter publication powersync add table public.fill_ups;
