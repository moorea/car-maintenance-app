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
  }),
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
  // Never synced or uploaded: facts about this phone's copy, such as whose data it holds.
  device_state: new Table({ value: column.text }, { localOnly: true }),
})

/** Tables the app writes locally and uploads. Everything else is read-only on the device. */
export const UPLOADABLE_TABLES = ['vehicles', 'odometer_readings', 'service_records'] as const
export type UploadableTable = (typeof UPLOADABLE_TABLES)[number]
