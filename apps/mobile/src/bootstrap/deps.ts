import type { Clock } from '@car/core'
import { memoryServiceRecords, sequentialIds } from '@car/core/testing'

// Placeholder wiring until the PowerSync (SQLite) adapters land. Screens only ever see ports,
// so swapping these out does not touch any screen or model.
const clock: Clock = { today: () => new Date().toISOString().slice(0, 10) }

export const deps = {
  clock,
  ids: sequentialIds('local'),
  records: memoryServiceRecords([
    {
      id: 'seed-1',
      vehicleId: 'demo',
      performedOn: '2026-07-01',
      odometerMiles: 30_000,
      shop: 'Demo Garage',
    },
  ]),
}
