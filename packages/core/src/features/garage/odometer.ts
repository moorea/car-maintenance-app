import type { IsoDate } from '../../lib/date'
import type { OdometerReading, ServiceRecord } from '../../domain/types'
import { estimateMilesOn, learnMilesPerDay, type MileageEstimate } from '../../reminders/mileage'

export interface CurrentOdometer extends MileageEstimate {
  /** Estimated miles today; undefined when the car has no readings at all. */
  miles?: number | undefined
}

/**
 * The car's odometer today, estimated from its readings and the mileage on its service records
 * (as getDueItems does), with the rate it is driven.
 */
export const currentOdometer = (
  readings: OdometerReading[],
  records: ServiceRecord[],
  today: IsoDate,
): CurrentOdometer => {
  const estimate = learnMilesPerDay([
    ...readings,
    ...records.flatMap((r) =>
      r.odometerMiles === undefined
        ? []
        : [{ vehicleId: r.vehicleId, date: r.performedOn, miles: r.odometerMiles }],
    ),
  ])
  return {
    ...estimate,
    miles: estimate.latest
      ? estimateMilesOn(estimate.latest, estimate.milesPerDay, today)
      : undefined,
  }
}
