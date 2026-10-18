import type {
  MaintenanceItem,
  OdometerReading,
  ServiceRecord,
  Vehicle,
  VehicleId,
} from '../domain/types'
import type { IsoDate } from '../lib/date'
import type { Clock, OdometerRepo, ScheduleRepo, ServiceRecordRepo, VehicleRepo } from '../ports'
import { estimateMilesOn, learnMilesPerDay, type MileageEstimate } from './mileage'
import { projectDue, type DueProjection } from './projectDue'

export interface GetDueItemsDeps {
  vehicles: VehicleRepo
  schedule: ScheduleRepo
  records: ServiceRecordRepo
  odometer: OdometerRepo
  clock: Clock
}

/** Service records that carry a mileage double as odometer readings. */
const readingsFrom = (
  vehicleId: VehicleId,
  readings: OdometerReading[],
  records: ServiceRecord[],
): OdometerReading[] => [
  ...readings,
  ...records.flatMap((r) =>
    r.odometerMiles === undefined
      ? []
      : [{ vehicleId, date: r.performedOn, miles: r.odometerMiles }],
  ),
]

const latestServiceFor = (itemId: string, records: ServiceRecord[]) =>
  records
    .filter((r) => r.itemId === itemId)
    .sort((a, b) => b.performedOn.localeCompare(a.performedOn))[0]

/** Items with no due date (a parked car's mileage-only items) sort last. */
const byDueDate = (a: DueProjection, b: DueProjection) =>
  (a.dueDate ?? '￿').localeCompare(b.dueDate ?? '￿')

export interface DueInput {
  vehicle: Pick<Vehicle, 'id' | 'severeDuty'>
  items: MaintenanceItem[]
  records: ServiceRecord[]
  readings: OdometerReading[]
  today: IsoDate
}

export interface DueSummary {
  /** Every scheduled item with its projected due date, soonest first. */
  items: DueProjection[]
  mileage: MileageEstimate
  /** Estimated odometer today; undefined when the car has no readings at all. */
  currentMiles: number | undefined
}

/** Projects every scheduled item from data already loaded, such as on the server. */
export const dueItemsFor = ({ vehicle, items, records, readings, today }: DueInput): DueSummary => {
  const mileage = learnMilesPerDay(readingsFrom(vehicle.id, readings, records))
  const { milesPerDay, latest } = mileage
  const currentMiles = latest ? estimateMilesOn(latest, milesPerDay, today) : undefined

  const due = items
    .flatMap((item) => {
      const last = latestServiceFor(item.id, records)
      // A service logged without its mileage: estimate the odometer on that day.
      const lastService = last && {
        performedOn: last.performedOn,
        odometerMiles:
          last.odometerMiles ??
          (latest ? estimateMilesOn(latest, milesPerDay, last.performedOn) : undefined),
      }
      const projection = projectDue({
        item,
        lastService,
        currentMiles,
        milesPerDay,
        severeDuty: vehicle.severeDuty,
        today,
      })
      return projection ? [projection] : []
    })
    .sort(byDueDate)
  return { items: due, mileage, currentMiles }
}

/** A vehicle's scheduled items with their projected due dates, and how it is driven. */
export const getDueSummary =
  (deps: GetDueItemsDeps) =>
  async (vehicleId: VehicleId): Promise<DueSummary> => {
    const vehicle = await deps.vehicles.get(vehicleId)
    if (!vehicle) throw new Error(`Unknown vehicle ${vehicleId}`)

    const [items, records, readings] = await Promise.all([
      // A car added on this device has only the owner's own items until the server has matched
      // its config.
      deps.schedule.itemsForVehicle(vehicle),
      deps.records.listForVehicle(vehicleId),
      deps.odometer.listForVehicle(vehicleId),
    ])
    return dueItemsFor({ vehicle, items, records, readings, today: deps.clock.today() })
  }

/** Every scheduled item for a vehicle with its projected due date, soonest first. */
export const getDueItems =
  (deps: GetDueItemsDeps) =>
  async (vehicleId: VehicleId): Promise<DueProjection[]> =>
    (await getDueSummary(deps)(vehicleId)).items
