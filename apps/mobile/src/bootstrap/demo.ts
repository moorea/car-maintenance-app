import {
  memoryAuth,
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
  memorySync,
  memoryVehicles,
  memoryVinDecoder,
  OWNER,
} from '@car/core/testing'

/** A VIN the demo's offline decoder knows, for previews where the real lookup cannot run. */
export const DEMO_VIN = '1HGCM82633A004352'

/** Decodes only DEMO_VIN, so the web preview never depends on NHTSA being reachable. */
export const demoVinDecoder = () =>
  memoryVinDecoder([
    {
      vin: DEMO_VIN,
      year: 2003,
      make: 'Honda',
      model: 'Accord',
      trim: 'EX-V6',
      engine: '3.0L 6-cyl',
    },
  ])

/** Sample data for running the app without a backend, e.g. before Supabase is set up. */
export const createDemoRepositories = () => ({
  // Already signed in, so the demo opens on the sample car. After signing out, any email with
  // code 123456 signs back in as the same demo owner.
  auth: memoryAuth({ user: { id: OWNER, email: 'demo@example.com' }, userIdFor: () => OWNER }),
  sync: memorySync(),
  vehicles: memoryVehicles([
    {
      id: 'demo',
      configId: 'demo',
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      nickname: 'Demo car',
      severeDuty: false,
    },
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
