-- Where each car sits in the owner's garage, first at 0, so the car they use most can lead. Null
-- until the owner arranges their cars; those cars follow the arranged ones, by name.

alter table public.vehicles
  add column garage_position int check (garage_position between 0 and 999);

-- Owners update only the columns listed; this adds the new one to that list.
grant update (garage_position) on public.vehicles to authenticated;
