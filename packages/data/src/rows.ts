import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '@car/core'

/** SQLite returns NULL for missing values; the domain uses absent properties. */
type Row = Record<string, unknown>

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const required = <T>(v: T | undefined, field: string): T => {
  if (v === undefined) throw new Error(`Row is missing ${field}`)
  return v
}

type UndefinedKeys<T> = { [K in keyof T]: undefined extends T[K] ? K : never }[keyof T]
/** Properties that may be undefined become optional, as exactOptionalPropertyTypes requires. */
type Defined<T> = Omit<T, UndefinedKeys<T>> & {
  [K in UndefinedKeys<T>]?: Exclude<T[K], undefined>
}

/** Drops undefined values so objects satisfy exactOptionalPropertyTypes. */
const defined = <T extends object>(o: T): Defined<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Defined<T>

export const toVehicle = (r: Row): Vehicle => ({
  id: required(text(r.id), 'id'),
  configId: required(text(r.config_id), 'config_id'),
  nickname: text(r.nickname) ?? '',
  severeDuty: r.severe_duty === 1,
})

export const toServiceRecord = (r: Row): ServiceRecord =>
  defined({
    id: required(text(r.id), 'id'),
    vehicleId: required(text(r.vehicle_id), 'vehicle_id'),
    performedOn: required(text(r.performed_on), 'performed_on'),
    itemId: text(r.item_id),
    odometerMiles: num(r.odometer_miles),
    costCents: num(r.cost_cents),
    shop: text(r.shop),
    notes: text(r.notes),
  })

export const fromServiceRecord = (s: ServiceRecord) => ({
  id: s.id,
  vehicle_id: s.vehicleId,
  performed_on: s.performedOn,
  item_id: s.itemId ?? null,
  odometer_miles: s.odometerMiles ?? null,
  cost_cents: s.costCents ?? null,
  shop: s.shop ?? null,
  notes: s.notes ?? null,
})

export const toOdometerReading = (r: Row): OdometerReading => ({
  vehicleId: required(text(r.vehicle_id), 'vehicle_id'),
  date: required(text(r.read_on), 'read_on'),
  miles: required(num(r.miles), 'miles'),
})

export const toMaintenanceItem = (r: Row): MaintenanceItem =>
  defined({
    id: required(text(r.id), 'id'),
    configId: required(text(r.config_id), 'config_id'),
    task: required(text(r.task), 'task'),
    intervalMiles: num(r.interval_miles),
    intervalMonths: num(r.interval_months),
    severeMiles: num(r.severe_miles),
    severeMonths: num(r.severe_months),
  })
