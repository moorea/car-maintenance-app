import { Schema, Table, column } from '@powersync/common'

/**
 * The on-device SQLite schema PowerSync keeps in sync. Mirrors the Postgres tables in
 * supabase/migrations; `id` is implicit. Booleans are integers and dates are ISO text in SQLite.
 */
export const schema = new Schema({
  vehicle_configs: new Table({
    make: column.text,
    model: column.text,
    year: column.integer,
    trim: column.text,
    engine: column.text,
    drivetrain: column.text,
    recalls_checked_at: column.text,
    complaints_checked_at: column.text,
  }),
  recalls: new Table(
    {
      config_id: column.text,
      campaign: column.text,
      manufacturer: column.text,
      component: column.text,
      summary: column.text,
      consequence: column.text,
      remedy: column.text,
      notes: column.text,
      reported_on: column.text,
      park_it: column.integer,
      park_outside: column.integer,
      over_the_air: column.integer,
    },
    { indexes: { by_config: ['config_id'] } },
  ),
  complaint_summaries: new Table(
    {
      config_id: column.text,
      component: column.text,
      complaints: column.integer,
      crashes: column.integer,
      fires: column.integer,
      injuries: column.integer,
      deaths: column.integer,
      latest_filed_on: column.text,
      // JSON text: [{ "filed_on": "2024-05-01", "summary": "..." }]
      recent: column.text,
    },
    { indexes: { by_config: ['config_id'] } },
  ),
  maintenance_items: new Table(
    {
      config_id: column.text,
      task: column.text,
      interval_miles: column.integer,
      interval_months: column.integer,
      severe_miles: column.integer,
      severe_months: column.integer,
      source: column.text,
    },
    { indexes: { by_config: ['config_id'] } },
  ),
  vehicles: new Table({
    owner_id: column.text,
    config_id: column.text,
    vin: column.text,
    year: column.integer,
    make: column.text,
    model: column.text,
    trim: column.text,
    engine: column.text,
    drivetrain: column.text,
    nickname: column.text,
    severe_duty: column.integer,
    updated_at: column.text,
  }),
  odometer_readings: new Table(
    { vehicle_id: column.text, read_on: column.text, miles: column.integer, source: column.text },
    { indexes: { by_vehicle: ['vehicle_id', 'read_on'] } },
  ),
  service_records: new Table(
    {
      vehicle_id: column.text,
      item_id: column.text,
      performed_on: column.text,
      odometer_miles: column.integer,
      cost_cents: column.integer,
      shop: column.text,
      notes: column.text,
      receipt_path: column.text,
      created_at: column.text,
    },
    { indexes: { by_vehicle: ['vehicle_id', 'performed_on'] } },
  ),
  reminders: new Table(
    {
      vehicle_id: column.text,
      item_id: column.text,
      due_on: column.text,
      due_miles: column.integer,
      status: column.text,
      updated_at: column.text,
    },
    { indexes: { by_vehicle: ['vehicle_id'] } },
  ),
  attachments: new Table(
    {
      owner_id: column.text,
      vehicle_id: column.text,
      service_record_id: column.text,
      kind: column.text,
      name: column.text,
      content_type: column.text,
      size_bytes: column.integer,
      added_on: column.text,
      created_at: column.text,
    },
    { indexes: { by_vehicle: ['vehicle_id'] } },
  ),
  // Never synced or uploaded: facts about this phone's copy, such as whose data it holds.
  device_state: new Table({ value: column.text }, { localOnly: true }),
})

/** Tables the app writes locally and uploads. Everything else is read-only on the device. */
export const UPLOADABLE_TABLES = [
  'vehicles',
  'odometer_readings',
  'service_records',
  'attachments',
] as const
export type UploadableTable = (typeof UPLOADABLE_TABLES)[number]
