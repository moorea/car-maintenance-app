import type { IsoDate } from '../lib/date'

export type VehicleId = string
export type MaintenanceItemId = string

export interface Vehicle {
  id: VehicleId
  configId: string
  nickname: string
  severeDuty: boolean
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
