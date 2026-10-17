-- Table access is granted explicitly, never by default. The hosted project has "automatically
-- expose new tables" turned off (as does supabase/config.toml locally), so a new table is
-- reachable through the Data API only once a migration grants it. Anonymous users get nothing.
-- RLS policies still decide which rows; these grants decide which operations exist at all.

revoke all on all tables in schema public from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

-- Shared reference data.
grant select on public.vehicle_configs, public.maintenance_items, public.recalls,
  public.knowledge_chunks to authenticated;

-- Owner data. Service records and odometer readings are append-only; reminders and messages are
-- written by the service role.
grant select, insert, update, delete on public.vehicles, public.conversations to authenticated;
grant select, insert on public.odometer_readings to authenticated;
grant select, insert, delete on public.service_records to authenticated;
grant select on public.reminders, public.messages to authenticated;

-- Server jobs and edge functions (ingestion, reminders, the assistant) bypass RLS but still need
-- table privileges.
grant select, insert, update, delete on
  public.vehicle_configs, public.maintenance_items, public.recalls, public.knowledge_chunks,
  public.vehicles, public.odometer_readings, public.service_records, public.reminders,
  public.conversations, public.messages
  to service_role;
