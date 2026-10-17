import {
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
} from '@car/core/testing'

/** Sample data for running the app without a backend, e.g. before Supabase is set up. */
export const createDemoRepositories = () => ({
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
