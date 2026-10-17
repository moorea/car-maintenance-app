import type { IsoDate } from '../lib/date'

export type VehicleId = string
export type MaintenanceItemId = string

/** What the owner's car is. A VIN decode or the owner fills it in; it picks the shared config. */
export interface VehicleDescription {
  year: number
  make: string
  model: string
  trim?: string
  /** Such as "2.0L 4-cyl" or "Electric". */
  engine?: string
  /** Such as "FWD" or "AWD". */
  drivetrain?: string
}

export interface Vehicle extends VehicleDescription {
  id: VehicleId
  /**
   * The shared configuration (schedule, recalls) the server matched from the description. Absent
   * until a newly added car has uploaded and synced back.
   */
  configId?: string
  vin?: string
  nickname: string
  severeDuty: boolean
}

/** What a VIN decodes to. */
export interface DecodedVin extends VehicleDescription {
  vin: string
}

export type VinDecodeErrorKind = 'not-found' | 'network' | 'unknown'

/** A VIN lookup failure the screen can explain. Adapters translate their own errors into these. */
export class VinDecodeError extends Error {
  constructor(
    readonly kind: VinDecodeErrorKind,
    message: string = kind,
  ) {
    super(message)
    this.name = 'VinDecodeError'
  }
}

export interface OdometerReading {
  vehicleId: VehicleId
  date: IsoDate
  miles: number
}

/** One OEM schedule line for a vehicle configuration. Either interval may be absent. */
export interface MaintenanceItem {
  id: MaintenanceItemId
  configId: string
  task: string
  intervalMiles?: number
  intervalMonths?: number
  severeMiles?: number
  severeMonths?: number
}

export interface ServiceRecord {
  id: string
  vehicleId: VehicleId
  itemId?: MaintenanceItemId
  performedOn: IsoDate
  odometerMiles?: number
  costCents?: number
  shop?: string
  notes?: string
}

/** The signed-in person, as far as the app needs to know. */
export interface AuthUser {
  id: string
  email?: string
}

export type AuthErrorKind =
  'invalid-email' | 'invalid-code' | 'rate-limited' | 'network' | 'unknown'

/** A sign-in failure the screen can explain. Adapters translate their own errors into these. */
export class AuthError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message: string = kind,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
