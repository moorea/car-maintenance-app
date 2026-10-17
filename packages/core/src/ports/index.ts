import type { IsoDate } from '../lib/date'
import type {
  MaintenanceItem,
  OdometerReading,
  ServiceRecord,
  Vehicle,
  VehicleId,
} from '../domain/types'

/**
 * Ports are the only way core reaches storage, the network or the clock. The app supplies
 * SQLite/PowerSync and Supabase adapters; tests use the in-memory ones in `@car/core/testing`.
 */
export type Unsubscribe = () => void

export interface VehicleRepo {
  get(id: VehicleId): Promise<Vehicle | undefined>
}

export interface ServiceRecordRepo {
  listForVehicle(vehicleId: VehicleId): Promise<ServiceRecord[]>
  /** Calls `onChange` with the full list now and after every change, like a live query. */
  watchForVehicle(vehicleId: VehicleId, onChange: (records: ServiceRecord[]) => void): Unsubscribe
  add(record: ServiceRecord): Promise<void>
}

export interface OdometerRepo {
  listForVehicle(vehicleId: VehicleId): Promise<OdometerReading[]>
  add(reading: OdometerReading): Promise<void>
}

export interface ScheduleRepo {
  itemsForConfig(configId: string): Promise<MaintenanceItem[]>
}

export interface Clock {
  today(): IsoDate
}

export interface IdGenerator {
  next(): string
}
