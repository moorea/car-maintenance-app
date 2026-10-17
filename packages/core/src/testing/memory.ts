import type {
  MaintenanceItem,
  OdometerReading,
  ServiceRecord,
  Vehicle,
  VehicleId,
} from '../domain/types'
import type {
  Clock,
  IdGenerator,
  OdometerRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  VehicleRepo,
} from '../ports'
import type { IsoDate } from '../lib/date'

/** In-memory adapters for tests and headless runs. They behave like the real ones, minus I/O. */
export const memoryVehicles = (vehicles: Vehicle[] = []): VehicleRepo => ({
  get: async (id) => vehicles.find((v) => v.id === id),
})

export const memorySchedule = (items: MaintenanceItem[] = []): ScheduleRepo => ({
  itemsForConfig: async (configId) => items.filter((i) => i.configId === configId),
})

export const memoryOdometer = (readings: OdometerReading[] = []): OdometerRepo => ({
  listForVehicle: async (vehicleId) => readings.filter((r) => r.vehicleId === vehicleId),
  add: async (reading) => {
    readings.push(reading)
  },
})

export const memoryServiceRecords = (
  initial: ServiceRecord[] = [],
): ServiceRecordRepo & { failNextAdd: (message: string) => void } => {
  const records = [...initial]
  const watchers = new Set<{ vehicleId: VehicleId; onChange: (r: ServiceRecord[]) => void }>()
  let nextFailure: string | undefined
  const forVehicle = (vehicleId: VehicleId) => records.filter((r) => r.vehicleId === vehicleId)

  return {
    listForVehicle: async (vehicleId) => forVehicle(vehicleId),
    watchForVehicle: (vehicleId, onChange) => {
      const watcher = { vehicleId, onChange }
      watchers.add(watcher)
      onChange(forVehicle(vehicleId))
      return () => watchers.delete(watcher)
    },
    add: async (record) => {
      if (nextFailure !== undefined) {
        const message = nextFailure
        nextFailure = undefined
        throw new Error(message)
      }
      records.push(record)
      for (const w of watchers)
        if (w.vehicleId === record.vehicleId) w.onChange(forVehicle(w.vehicleId))
    },
    failNextAdd: (message) => {
      nextFailure = message
    },
  }
}

export const fixedClock = (today: IsoDate): Clock => ({ today: () => today })

export const sequentialIds = (prefix = 'id'): IdGenerator => {
  let n = 0
  return { next: () => `${prefix}-${++n}` }
}
