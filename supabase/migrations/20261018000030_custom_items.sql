-- The owner's own changes to a car's schedule: items the schedule doesn't have, and their own
-- interval for an item it does. Editable; deleting the car (or the account) deletes them, and a
-- replacement goes when a schedule update drops the item it replaces.

create table public.custom_items (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles on delete cascade,
  -- The schedule item whose interval this replaces; null for an item the owner added.
  replaces_item_id uuid references public.maintenance_items on delete cascade,
  task             text not null check (length(task) between 1 and 100),
  interval_miles   int check (interval_miles between 100 and 500000),
  interval_months  int check (interval_months between 1 and 240),
  updated_at       timestamptz not null default now(),
  check (interval_miles is not null or interval_months is not null)
);
create index on public.custom_items (vehicle_id);

alter table public.custom_items enable row level security;

-- The check on writes stops an item being attached to, or moved onto, someone else's car.
create policy owner_all on public.custom_items for all to authenticated
  using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));

grant select, insert, update, delete on public.custom_items to authenticated, service_role;

alter publication powersync add table public.custom_items;

-- A service can now count as one of the owner's own items, which are not schedule items, so the
-- foreign key gives way to a check that accepts either. It runs as the writer: an owner can link
-- a service only to a schedule item they can see or to an item of the same car's. A link to
-- anything else fails like the foreign key did (23503), so the phone keeps the service without
-- it. Deleting an owner's item leaves its services as they are, named by their notes.
alter table public.service_records drop constraint service_records_item_id_fkey;

create function public.check_service_item() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if new.item_id is null
     or exists (select 1 from public.maintenance_items m where m.id = new.item_id)
     or exists (select 1 from public.custom_items c
                 where c.id = new.item_id and c.vehicle_id = new.vehicle_id) then
    return new;
  end if;
  raise exception 'service item % is not on this car''s schedule', new.item_id
    using errcode = '23503';
end;
$$;

create trigger check_service_item before insert or update of item_id, vehicle_id
  on public.service_records for each row execute function public.check_service_item();
