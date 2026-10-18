-- Sets of tires the owner tracks for their car: the set on it, and any stored for another
-- season. Each records the week and year the tires were made, from the DOT code, since tires age
-- out whatever their tread, and the miles driven on it across seasons. Editable like warranties:
-- swapping sets updates both. Deleting the car (or the account) deletes them.

create table public.tire_sets (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles on delete cascade,
  name              text not null check (length(name) between 1 and 200),
  brand             text check (length(brand) <= 200),
  size              text check (length(size) <= 200),
  -- The last four digits of the DOT code: the week and year the tires were made.
  made_week         int check (made_week between 1 and 53),
  made_year         int check (made_year between 2000 and 2099),
  mounted           boolean not null default false,
  -- The odometer when the set last went on the car; null while it is stored.
  mounted_at_miles  int check (mounted_at_miles between 0 and 2000000),
  -- Miles driven on the set before it last went on: earlier seasons, or a used set.
  prior_miles       int not null default 0 check (prior_miles between 0 and 2000000),
  -- The shallowest tread depth last measured, in 32nds of an inch, and when.
  tread_32nds       int check (tread_32nds between 0 and 32),
  tread_checked_on  date,
  notes             text check (length(notes) <= 10000),
  updated_at        timestamptz not null default now(),
  constraint made_week_and_year check ((made_week is null) = (made_year is null)),
  constraint tread_and_date check ((tread_32nds is null) = (tread_checked_on is null)),
  constraint mounted_at_only_when_mounted check (mounted or mounted_at_miles is null)
);
create index on public.tire_sets (vehicle_id);

alter table public.tire_sets enable row level security;

-- The check on writes stops a tire set being attached to, or moved onto, someone else's car.
create policy owner_all on public.tire_sets for all to authenticated
  using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));

grant select, insert, update, delete on public.tire_sets to authenticated, service_role;

alter publication powersync add table public.tire_sets;
