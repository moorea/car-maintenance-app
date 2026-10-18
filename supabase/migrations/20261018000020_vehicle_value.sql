-- What the owner thinks the car is worth, and when they said so, for weighing a big repair against
-- the car (ADR 0018). Both or neither: a value means little without its date, since cars lose value.

alter table public.vehicles
  add column value_cents int check (value_cents between 1 and 1000000000),
  add column valued_on   date,
  add constraint vehicles_value_dated check ((value_cents is null) = (valued_on is null));

-- Owners update only the columns listed; this adds the two new ones to that list.
grant update (value_cents, valued_on) on public.vehicles to authenticated;
