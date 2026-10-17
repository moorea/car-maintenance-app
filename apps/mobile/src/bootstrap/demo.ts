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
import { demoModel, localAssistant } from '@car/core/testing'
import type { Clock, MaintenanceItem, SafetyReport } from '@car/core'

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

/**
 * The demo car's schedule: the baseline a gas car gets from the server
 * (supabase/migrations/20261017000008_schedule_providers.sql), labelled as general guidance.
 */
const DEMO_SCHEDULE: MaintenanceItem[] = [
  {
    id: 'demo-oil',
    configId: 'demo',
    kind: 'engine-oil',
    source: 'baseline',
    task: 'Oil & filter change',
    intervalMiles: 5_000,
    intervalMonths: 6,
    severeMiles: 3_000,
    severeMonths: 6,
  },
  {
    id: 'demo-tires',
    configId: 'demo',
    kind: 'tire-rotation',
    source: 'baseline',
    task: 'Tire rotation',
    intervalMiles: 5_000,
    intervalMonths: 6,
  },
  {
    id: 'demo-brakes',
    configId: 'demo',
    kind: 'brake-inspection',
    source: 'baseline',
    task: 'Brake inspection',
    intervalMiles: 12_000,
    intervalMonths: 12,
    severeMiles: 6_000,
    severeMonths: 6,
  },
  {
    id: 'demo-cabin',
    configId: 'demo',
    kind: 'cabin-air-filter',
    source: 'baseline',
    task: 'Cabin air filter',
    intervalMiles: 15_000,
    intervalMonths: 12,
    severeMiles: 7_500,
    severeMonths: 12,
  },
  {
    id: 'demo-engine-air',
    configId: 'demo',
    kind: 'engine-air-filter',
    source: 'baseline',
    task: 'Engine air filter',
    intervalMiles: 15_000,
    intervalMonths: 24,
    severeMiles: 7_500,
    severeMonths: 12,
  },
  {
    id: 'demo-brake-fluid',
    configId: 'demo',
    kind: 'brake-fluid',
    source: 'baseline',
    task: 'Brake fluid',
    intervalMiles: 30_000,
    intervalMonths: 24,
  },
  {
    id: 'demo-battery',
    configId: 'demo',
    kind: 'battery-test',
    source: 'baseline',
    task: '12-volt battery test',
    intervalMonths: 12,
  },
  {
    id: 'demo-plugs',
    configId: 'demo',
    kind: 'spark-plugs',
    source: 'baseline',
    task: 'Spark plugs',
    intervalMiles: 60_000,
  },
  {
    id: 'demo-transmission',
    configId: 'demo',
    kind: 'transmission-fluid',
    source: 'baseline',
    task: 'Transmission fluid',
    intervalMiles: 60_000,
    severeMiles: 30_000,
  },
  {
    id: 'demo-coolant',
    configId: 'demo',
    kind: 'engine-coolant',
    source: 'baseline',
    task: 'Engine coolant',
    intervalMiles: 60_000,
    intervalMonths: 60,
  },
  {
    id: 'demo-timing-belt',
    configId: 'demo',
    kind: 'timing-belt',
    source: 'baseline',
    task: 'Timing belt (if equipped)',
    intervalMiles: 60_000,
    intervalMonths: 72,
  },
]

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
      trim: 'XLE',
      engine: '2.5L 4-cyl',
      drivetrain: 'AWD',
      nickname: 'Demo car',
      severeDuty: false,
    },
  ]),
  odometer: memoryOdometer([
    { vehicleId: 'demo', date: '2026-04-02', miles: 24_150 },
    { vehicleId: 'demo', date: '2026-10-10', miles: 35_780 },
  ]),
  schedule: memorySchedule(DEMO_SCHEDULE),
  safety: memorySafety({ demo: DEMO_SAFETY }),
  records: memoryServiceRecords([
    {
      id: 'seed-1',
      vehicleId: 'demo',
      itemId: 'demo-oil',
      performedOn: '2026-07-01',
      odometerMiles: 30_000,
      costCents: 8_995,
      shop: 'Demo Garage',
    },
    {
      id: 'seed-2',
      vehicleId: 'demo',
      itemId: 'demo-tires',
      performedOn: '2026-03-14',
      odometerMiles: 23_400,
      costCents: 2_400,
      shop: 'Demo Garage',
    },
    {
      id: 'seed-3',
      vehicleId: 'demo',
      itemId: 'demo-cabin',
      performedOn: '2025-09-20',
      odometerMiles: 18_200,
      costCents: 3_898,
      notes: 'Did it myself',
    },
  ]),
})

type DemoRepositories = ReturnType<typeof createDemoRepositories>

/**
 * Ask without a backend: a stand-in model that quotes the car's stored facts, citing them, so the
 * screen behaves like the real one. It does not understand the question.
 */
export const createDemoAssistant = (repositories: DemoRepositories, clock: Clock) =>
  localAssistant({
    model: demoModel({ delayMs: 40 }),
    facts: async (vehicleId) => {
      const vehicle = await repositories.vehicles.get(vehicleId)
      if (!vehicle?.configId) return undefined
      return {
        vehicle,
        today: clock.today(),
        readings: await repositories.odometer.listForVehicle(vehicleId),
        schedule: await repositories.schedule.itemsForConfig(vehicle.configId),
        records: await repositories.records.listForVehicle(vehicleId),
        safety: DEMO_SAFETY,
        complaints: [],
      }
    },
  })
