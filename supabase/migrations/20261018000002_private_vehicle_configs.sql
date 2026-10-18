-- Configs are created from what owners type when they add a car (assign_vehicle_config), so a
-- config's trim, engine or drivetrain can be any text an owner chose. Readable by every signed-in
-- user, that text reached strangers through the Data API. Owners now read only the configs their
-- own cars use, which is all the app and the assistant ever read; sync was already scoped this way.
-- Schedules, recalls and complaint summaries stay shared: they come from the server, not owners.

drop policy read_shared on public.vehicle_configs;
create policy owner_read on public.vehicle_configs for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.config_id = vehicle_configs.id and v.owner_id = (select auth.uid())
    )
  );
