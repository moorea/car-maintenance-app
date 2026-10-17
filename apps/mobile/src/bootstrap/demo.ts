import {
  memoryAuth,
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
  OWNER,
} from '@car/core/testing'

/** Sample data for running the app without a backend, e.g. before Supabase is set up. */
export const createDemoRepositories = () => ({
  // Already signed in, so the demo opens on the sample car. Any email and code 123456 work.
  auth: memoryAuth({ user: { id: OWNER, email: 'demo@example.com' } }),
  vehicles: memoryVehicles([
    { id: 'demo', configId: 'demo', nickname: 'Demo car', severeDuty: false },
  ]),
  odometer: memoryOdometer(),
  schedule: memorySchedule(),
  records: memoryServiceRecords([
    {
      id: 'seed-1',
      vehicleId: 'demo',
      performedOn: '2026-07-01',
      odometerMiles: 30_000,
      shop: 'Demo Garage',
    },
  ]),
})
