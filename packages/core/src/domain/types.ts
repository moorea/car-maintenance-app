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
