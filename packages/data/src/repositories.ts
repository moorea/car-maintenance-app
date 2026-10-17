import type { OdometerRepo, ScheduleRepo, ServiceRecordRepo, VehicleRepo } from '@car/core'
import type { CommonPowerSyncDatabase } from '@powersync/common'
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
}

const RECORDS_FOR_VEHICLE =
  'select * from service_records where vehicle_id = ? order by performed_on desc, created_at desc'

/** The core ports implemented over the on-device PowerSync (SQLite) database. */
export const createPowerSyncRepositories = (
  db: CommonPowerSyncDatabase,
): PowerSyncRepositories => ({
  vehicles: {
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

    watchForVehicle: (vehicleId, onChange) => {
      const controller = new AbortController()
      db.watch(
        RECORDS_FOR_VEHICLE,
        [vehicleId],
        {
          onResult: (result) =>
            onChange(
              (result.rows?._array ?? []).map((r: Record<string, unknown>) => toServiceRecord(r)),
            ),
          onError: (error) => console.error('service_records watch failed', error),
        },
        { signal: controller.signal, tables: ['service_records'] },
      )
      return () => controller.abort()
    },

    add: async (record) => {
      const row = { ...fromServiceRecord(record), created_at: new Date().toISOString() }
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
