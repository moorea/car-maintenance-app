import {
  memoryAuth,
  memoryOdometer,
  memorySafety,
  memorySchedule,
  memoryServiceRecords,
  memorySync,
  memoryVehicles,
  memoryVinDecoder,
  OWNER,
} from '@car/core/testing'
import type { SafetyReport } from '@car/core'

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

const DEMO_CHECKED = '2026-10-17 12:00:00Z'

/** Made-up recalls and complaints for the demo car, shaped like NHTSA's. Not real campaigns. */
const DEMO_SAFETY: SafetyReport = {
  recallsCheckedAt: DEMO_CHECKED,
  complaintsCheckedAt: DEMO_CHECKED,
  recalls: [
    {
      id: 'demo-r1',
      configId: 'demo',
      campaign: '00V000001',
      component: 'ELECTRICAL SYSTEM: WIRING: HARNESS',
      summary:
        'Sample recall. A wiring harness behind the dashboard may rub against a bracket and short.',
      consequence: 'A short circuit can increase the risk of a fire.',
      remedy: 'Dealers will inspect the harness and add a protective sleeve, free of charge.',
      reportedOn: '2025-03-14',
      parkIt: false,
      parkOutside: true,
      overTheAir: false,
    },
    {
      id: 'demo-r2',
      configId: 'demo',
      campaign: '00V000002',
      component: 'BACK OVER PREVENTION: REARVIEW SYSTEM',
      summary: 'Sample recall. The rearview camera image may not appear when reversing.',
      consequence: 'Reduced rear visibility increases the risk of a crash.',
      remedy: 'A software update fixes the camera, free of charge.',
      reportedOn: '2024-08-02',
      parkIt: false,
      parkOutside: false,
      overTheAir: true,
    },
  ],
  complaints: [
    {
      id: 'demo-c1',
      configId: 'demo',
      component: 'FUEL/PROPULSION SYSTEM',
      complaints: 37,
      crashes: 1,
      fires: 0,
      injuries: 1,
      deaths: 0,
      latestFiledOn: '2026-06-30',
      recent: [
        {
          filedOn: '2026-06-30',
          summary: 'Sample complaint. The car hesitated when accelerating onto the highway.',
        },
        { filedOn: '2026-02-11', summary: 'Sample complaint. Fuel smell after filling up.' },
      ],
    },
    {
      id: 'demo-c2',
      configId: 'demo',
      component: 'SERVICE BRAKES',
      complaints: 12,
      crashes: 0,
      fires: 0,
      injuries: 0,
      deaths: 0,
      latestFiledOn: '2025-11-04',
      recent: [{ filedOn: '2025-11-04', summary: 'Sample complaint. Brakes squeal when cold.' }],
    },
  ],
}

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
  odometer: memoryOdometer([{ vehicleId: 'demo', date: '2026-04-01', miles: 25_000 }]),
  // A short, made-up schedule so the demo has reminders to show. Not Toyota's real one.
  schedule: memorySchedule([
    {
      id: 'demo-oil',
      configId: 'demo',
      task: 'Oil and filter',
      intervalMiles: 10_000,
      intervalMonths: 12,
    },
    { id: 'demo-rotate', configId: 'demo', task: 'Tire rotation', intervalMiles: 5_000 },
    { id: 'demo-cabin', configId: 'demo', task: 'Cabin air filter', intervalMiles: 15_000 },
  ]),
  safety: memorySafety({ demo: DEMO_SAFETY }),
  records: memoryServiceRecords([
    {
      id: 'seed-1',
      vehicleId: 'demo',
      performedOn: '2026-07-01',
      odometerMiles: 30_000,
      shop: 'Demo Garage',
    },
    {
      id: 'seed-2',
      vehicleId: 'demo',
      itemId: 'demo-rotate',
      performedOn: '2026-08-15',
      odometerMiles: 32_500,
      shop: 'Demo Garage',
    },
  ]),
})
