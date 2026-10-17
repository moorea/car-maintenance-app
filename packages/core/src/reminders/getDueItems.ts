import type { OdometerReading, ServiceRecord, VehicleId } from '../domain/types'
import type { Clock, OdometerRepo, ScheduleRepo, ServiceRecordRepo, VehicleRepo } from '../ports'
import { estimateMilesOn, learnMilesPerDay } from './mileage'
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

/** Every scheduled item for a vehicle with its projected due date, soonest first. */
export const getDueItems =
  (deps: GetDueItemsDeps) =>
  async (vehicleId: VehicleId): Promise<DueProjection[]> => {
    const vehicle = await deps.vehicles.get(vehicleId)
    if (!vehicle) throw new Error(`Unknown vehicle ${vehicleId}`)

    const [items, records, odometer] = await Promise.all([
      // A car added on this device has no schedule until the server has matched its config.
      vehicle.configId === undefined ? [] : deps.schedule.itemsForConfig(vehicle.configId),
      deps.records.listForVehicle(vehicleId),
      deps.odometer.listForVehicle(vehicleId),
    ])

    const today = deps.clock.today()
    const { milesPerDay, latest } = learnMilesPerDay(readingsFrom(vehicleId, odometer, records))
    const currentMiles = latest ? estimateMilesOn(latest, milesPerDay, today) : undefined

    return items
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
  }
