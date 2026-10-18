-- Owners can correct a service they logged: a typo in its mileage, date or cost would otherwise
-- stay in the history for good, and a mileage typo would hold back every later reading. The car a
-- service belongs to never changes, so only what the owner typed is updatable.

create policy owner_update on public.service_records for update to authenticated
  using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));

grant update (item_id, performed_on, odometer_miles, cost_cents, shop, notes)
  on public.service_records to authenticated;
