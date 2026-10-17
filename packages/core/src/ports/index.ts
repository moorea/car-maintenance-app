import type { IsoDate } from '../lib/date'
import type {
  AuthUser,
  DecodedVin,
  MaintenanceItem,
  OdometerReading,
  SafetyReport,
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
  /** Calls `onChange` with the owner's vehicles now and after every change. */
  watchOwned(ownerId: string, onChange: (vehicles: Vehicle[]) => void): Unsubscribe
  /**
   * Saves a new car for `ownerId`, with its first odometer reading if given, in one write so the
   * reading never uploads without its car.
   */
  add(ownerId: string, vehicle: Vehicle, firstReading?: OdometerReading): Promise<void>
}

/** Looks up what a VIN is. Needs a connection. */
export interface VinDecoder {
  /** Resolves with the car, or throws VinDecodeError. `vin` is already valid and upper case. */
  decode(vin: string): Promise<DecodedVin>
}

/** Whether this device's copy of an owner's data has finished its first download. */
export interface SyncStatus {
  /**
   * Calls `onSynced` once a full sync of `ownerId`'s data has completed (immediately if it already
   * has). Another account's earlier sync on the same phone does not count.
   */
  onFirstSync(ownerId: string, onSynced: () => void): Unsubscribe
}

/** Passwordless email sign-in: the owner types their email, then the code they were sent. */
export interface AuthPort {
  /** Calls `onChange` with the current user (or null) now and on every sign-in or sign-out. */
  watchUser(onChange: (user: AuthUser | null) => void): Unsubscribe
  /** Emails a one-time code, creating the account if needed. Throws AuthError. */
  sendCode(email: string): Promise<void>
  /** Signs in with the emailed code. Throws AuthError. */
  verifyCode(email: string, code: string): Promise<void>
  /** Always ends signed out on this device, even offline; may still throw if the server was not told. */
  signOut(): Promise<void>
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

/** Recalls and complaints for a configuration, which the server fetches from NHTSA. */
export interface SafetyRepo {
  /** Calls `onChange` with the configuration's report now and after every change. */
  watchForConfig(configId: string, onChange: (report: SafetyReport) => void): Unsubscribe
}

export interface Clock {
  today(): IsoDate
}

export interface IdGenerator {
  next(): string
}
