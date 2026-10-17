import {
  memoryAuth,
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
  memorySync,
  memoryVehicles,
  OWNER,
} from '@car/core/testing'

/** Sample data for running the app without a backend, e.g. before Supabase is set up. */
export const createDemoRepositories = () => ({
  // Already signed in, so the demo opens on the sample car. After signing out, any email with
  // code 123456 signs back in as the same demo owner.
  auth: memoryAuth({ user: { id: OWNER, email: 'demo@example.com' }, userIdFor: () => OWNER }),
  sync: memorySync(),
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
