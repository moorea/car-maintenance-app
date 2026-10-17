import type {
  OdometerRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  SyncStatus,
  Unsubscribe,
  VehicleRepo,
} from '@car/core'
import type { CommonPowerSyncDatabase } from '@powersync/common'
import { readOwner } from './session'
import {
  fromServiceRecord,
  toMaintenanceItem,
  toOdometerReading,
  toServiceRecord,
  toVehicle,
} from './rows'

export interface PowerSyncRepositories {
  vehicles: VehicleRepo
  records: ServiceRecordRepo
  odometer: OdometerRepo
  schedule: ScheduleRepo
  sync: SyncStatus
}

const RECORDS_FOR_VEHICLE =
  'select * from service_records where vehicle_id = ? order by performed_on desc, created_at desc'

type Row = Record<string, unknown>

/** Calls `onRows` with the query's rows now and whenever `table` changes, until unsubscribed. */
const watchRows = (
  db: CommonPowerSyncDatabase,
  sql: string,
  params: unknown[],
  table: string,
  onRows: (rows: Row[]) => void,
): Unsubscribe => {
  const controller = new AbortController()
  db.watch(
    sql,
    params,
    {
      onResult: (result) => onRows((result.rows?._array ?? []) as Row[]),
      onError: (error) => console.error(`${table} watch failed`, error),
    },
    { signal: controller.signal, tables: [table] },
  )
  return () => controller.abort()
}

/** What the first-sync check reads from PowerSync. */
export interface SyncSource {
  hasSynced(): boolean
  onStatusChanged(onChange: () => void): () => void
  /** The user whose data the local copy holds. */
  owner(): Promise<string | undefined>
}

/**
 * Calls `onSynced` once the local copy has fully synced and belongs to `ownerId`. After an account
 * switch PowerSync still reports the previous owner's sync until their copy is cleared, which
 * would tell the new owner they have no cars before theirs have downloaded.
 */
export const firstSyncOf = (
  source: SyncSource,
  ownerId: string,
  onSynced: () => void,
): (() => void) => {
  let done = false
  let check = Promise.resolve()
  const recheck = () => {
    check = check
      .then(async () => {
        if (done || !source.hasSynced()) return
        if ((await source.owner()) !== ownerId || done || !source.hasSynced()) return
        done = true
        stop()
        onSynced()
      })
      // A failed read must not stop later status changes from being checked.
      .catch((error: unknown) => console.warn('First sync check failed', error))
  }
  const stop = source.onStatusChanged(recheck)
  recheck()
  return () => {
    done = true
    stop()
  }
}

/** The core ports implemented over the on-device PowerSync (SQLite) database. */
export const createPowerSyncRepositories = (
  db: CommonPowerSyncDatabase,
): PowerSyncRepositories => ({
  sync: {
    onFirstSync: (ownerId, onSynced) =>
      firstSyncOf(
        {
          hasSynced: () => db.currentStatus.hasSynced === true,
          onStatusChanged: (onChange) => db.registerListener({ statusChanged: onChange }),
          owner: () => readOwner(db),
        },
        ownerId,
        onSynced,
      ),
  },

  vehicles: {
    // Filtered by owner even though only the owner's rows sync: just after an account switch the
    // previous owner's copy may not be cleared yet.
    watchOwned: (ownerId, onChange) =>
      watchRows(
        db,
        'select * from vehicles where owner_id = ? order by nickname',
        [ownerId],
        'vehicles',
        (rows) => onChange(rows.map(toVehicle)),
      ),
    get: async (id) => {
      const row = await db.getOptional<Record<string, unknown>>(
        'select * from vehicles where id = ?',
        [id],
      )
      return row ? toVehicle(row) : undefined
    },
  },

  records: {
    listForVehicle: async (vehicleId) =>
      (await db.getAll<Record<string, unknown>>(RECORDS_FOR_VEHICLE, [vehicleId])).map(
        toServiceRecord,
      ),

    watchForVehicle: (vehicleId, onChange) =>
      watchRows(db, RECORDS_FOR_VEHICLE, [vehicleId], 'service_records', (rows) =>
        onChange(rows.map(toServiceRecord)),
      ),

    add: async (record) => {
      // Same text format as synced timestamptz values, so the created_at tie-break sorts both alike.
      const createdAt = new Date().toISOString().replace('T', ' ')
      const row = { ...fromServiceRecord(record), created_at: createdAt }
      const columns = Object.keys(row)
      await db.execute(
        `insert into service_records (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
        Object.values(row),
      )
    },
  },

  odometer: {
    listForVehicle: async (vehicleId) =>
      (
        await db.getAll<Record<string, unknown>>(
          'select * from odometer_readings where vehicle_id = ? order by read_on',
          [vehicleId],
        )
      ).map(toOdometerReading),
    add: async (reading) => {
      await db.execute(
        "insert into odometer_readings (id, vehicle_id, read_on, miles, source) values (uuid(), ?, ?, ?, 'manual')",
        [reading.vehicleId, reading.date, reading.miles],
      )
    },
  },

  schedule: {
    itemsForConfig: async (configId) =>
      (
        await db.getAll<Record<string, unknown>>(
          'select * from maintenance_items where config_id = ? order by task',
          [configId],
        )
      ).map(toMaintenanceItem),
  },
})
