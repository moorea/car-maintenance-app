-- PowerSync replicates these tables from the write-ahead log. Keep in step with the tables in
-- powersync/sync-rules.yaml; a table missing here never reaches the phone.
create publication powersync for table
  public.vehicle_configs,
  public.maintenance_items,
  public.vehicles,
  public.odometer_readings,
  public.service_records,
  public.reminders;
