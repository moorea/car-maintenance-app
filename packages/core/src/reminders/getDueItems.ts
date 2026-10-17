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

/** Every scheduled item for a vehicle with its projected due date, soonest first. */
export const getDueItems =
  (deps: GetDueItemsDeps) =>
  async (vehicleId: VehicleId): Promise<DueProjection[]> => {
    const vehicle = await deps.vehicles.get(vehicleId)
    if (!vehicle) throw new Error(`Unknown vehicle ${vehicleId}`)

    const [items, records, odometer] = await Promise.all([
      deps.schedule.itemsForConfig(vehicle.configId),
      deps.records.listForVehicle(vehicleId),
      deps.odometer.listForVehicle(vehicleId),
    ])

    const today = deps.clock.today()
    const readings = readingsFrom(vehicleId, odometer, records)
    const { milesPerDay } = learnMilesPerDay(readings)
    const latest = [...readings].sort((a, b) => b.date.localeCompare(a.date))[0]
    const currentMiles = latest ? estimateMilesOn(latest, milesPerDay, today) : 0

    return items
      .flatMap((item) => {
        const projection = projectDue({
          item,
          lastService: latestServiceFor(item.id, records),
          currentMiles,
          milesPerDay,
          severeDuty: vehicle.severeDuty,
          today,
        })
        return projection ? [projection] : []
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }
