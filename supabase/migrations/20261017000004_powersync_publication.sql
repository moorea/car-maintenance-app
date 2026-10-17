-- PowerSync replicates these tables from the write-ahead log. Keep in step with the tables in
-- powersync/sync-rules.yaml; a table missing here never reaches the phone.
-- PowerSync's setup guide may already have created a FOR ALL TABLES publication by hand, which
-- cannot be altered into a table list, so it is replaced (atomically, inside the migration).
drop publication if exists powersync;
create publication powersync for table
  public.vehicle_configs,
  public.maintenance_items,
  public.vehicles,
  public.odometer_readings,
  public.service_records,
  public.reminders;
