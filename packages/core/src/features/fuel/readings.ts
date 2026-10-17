import type { FillUp, OdometerReading, VehicleId } from '../../domain/types'
import type { FillUpRepo, OdometerRepo, Unsubscribe } from '../../ports'

const asReading = (f: FillUp): OdometerReading => ({
  vehicleId: f.vehicleId,
  date: f.filledOn,
  miles: f.odometerMiles,
})

const byDate = (a: OdometerReading, b: OdometerReading) =>
  a.date.localeCompare(b.date) || a.miles - b.miles

/**
 * The car's odometer readings with each fill-up's mileage among them, so logging fuel keeps
 * reminders and the mileage estimate current. Readings come from the fill-ups themselves rather
 * than copies, so editing or deleting a fill-up corrects them too. New readings still go to
 * `odometer`.
 */
export const withFillUpReadings = (odometer: OdometerRepo, fillUps: FillUpRepo): OdometerRepo => ({
  listForVehicle: async (vehicleId) => {
    const [readings, fills] = await Promise.all([
      odometer.listForVehicle(vehicleId),
      fillUps.listForVehicle(vehicleId),
    ])
    return [...readings, ...fills.map(asReading)].sort(byDate)
  },

  watchForVehicle: (vehicleId: VehicleId, onChange) => {
    let readings: OdometerReading[] | undefined
    let fills: FillUp[] | undefined
    // Waits for both sources, so a watcher never sees the readings without the fill-ups.
    const emit = () => {
      if (readings && fills) onChange([...readings, ...fills.map(asReading)].sort(byDate))
    }
    const stops: Unsubscribe[] = [
      odometer.watchForVehicle(vehicleId, (next) => {
        readings = next
        emit()
      }),
      fillUps.watchForVehicle(vehicleId, (next) => {
        fills = next
        emit()
      }),
    ]
    return () => {
      for (const stop of stops) stop()
    }
  },

  add: (reading) => odometer.add(reading),
})
