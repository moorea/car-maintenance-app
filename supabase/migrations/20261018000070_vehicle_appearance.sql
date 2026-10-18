-- How the app draws the car: its body style (from the VIN when vPIC says, else the owner picks)
-- and its paint (the owner picks). Both optional; the app draws a default until set (ADR 0022).

alter table public.vehicles
  add column body_style text check (body_style in ('sedan', 'suv', 'pickup', 'minivan')),
  add column paint      text check (paint in ('white', 'silver', 'gray', 'black', 'red', 'blue', 'green', 'brown'));

-- Owners update only the columns listed; this adds the two new ones to that list.
grant update (body_style, paint) on public.vehicles to authenticated;
