-- Registration, inspection and insurance dates the owner types from the car's paperwork, so the
-- phone can remind them before each runs out. Editable: a renewal moves the date on, and a typo
-- should be fixed. Deleting the car (or the account) deletes them.

create table public.renewals (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles on delete cascade,
  kind         text not null
               check (kind in ('registration', 'inspection', 'emissions', 'insurance', 'other')),
  -- The owner's own name for an "other" one, such as a parking permit.
  title        text check (length(title) between 1 and 100),
  due_on       date not null,
  -- How often it comes round; null when it doesn't repeat.
  every_months int check (every_months between 1 and 120),
  notes        text,
  updated_at   timestamptz not null default now()
);
create index on public.renewals (vehicle_id);

alter table public.renewals enable row level security;

-- The check on writes stops a renewal being attached to, or moved onto, someone else's car.
create policy owner_all on public.renewals for all to authenticated
  using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));

grant select, insert, update, delete on public.renewals to authenticated, service_role;

alter publication powersync add table public.renewals;

-- Inspection and emissions reports join the car's documents.
alter table public.attachments drop constraint attachments_kind_check;
alter table public.attachments add constraint attachments_kind_check
  check (kind in ('receipt', 'registration', 'inspection', 'insurance', 'other'));
