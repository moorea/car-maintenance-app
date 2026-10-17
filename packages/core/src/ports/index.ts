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

/** Whether the owner lets this app show notifications. Only the OS can change a denial. */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined'

/** A notification scheduled on this device for a calendar date, at an hour of the local day. */
export interface LocalNotification {
  /** Stable for the same reminder, so rescheduling replaces rather than duplicates it. */
  id: string
  date: IsoDate
  /** Hour of the day on the phone's own clock, 0 to 23. */
  hour: number
  title: string
  body: string
  /** The car it is about, so tapping it can open that car. */
  vehicleId: VehicleId
}

/** Notifications scheduled on this device. Works offline; nothing is sent from a server. */
export interface Notifier {
  permission(): Promise<NotificationPermission>
  /** Shows the system prompt if the owner has not answered it yet; resolves with the outcome. */
  requestPermission(): Promise<NotificationPermission>
  /** The reminders this app has scheduled and that have not been shown yet. */
  scheduled(): Promise<LocalNotification[]>
  /** Schedules a notification, replacing any with the same id. */
  schedule(notification: LocalNotification): Promise<void>
  cancel(id: string): Promise<void>
  /** Opens this app's page in the system settings, where a denial can be undone. */
  openSettings(): Promise<void>
}

/** The owner's reminder choices, kept on this device. */
export interface ReminderSettings {
  enabled: boolean
}

export interface ReminderSettingsRepo {
  /** Calls `onChange` with the settings now and after every change. */
  watch(onChange: (settings: ReminderSettings) => void): Unsubscribe
  set(settings: ReminderSettings): Promise<void>
}
