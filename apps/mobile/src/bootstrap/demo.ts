import {
  memoryAttachments,
  memoryAccount,
  memoryAuth,
  memoryFillUps,
  memoryOdometer,
  memoryRenewals,
  memoryCustomItems,
  memorySafety,
  memorySchedule,
  memoryServiceRecords,
  memorySync,
  memoryVehicles,
  memoryVinDecoder,
  memoryWarranties,
  memoryTireSets,
  OWNER,
} from '@car/core/testing'
import { demoModel, localAssistant } from '@car/core/testing'
import { launchFlag } from './launchFlags'
import {
  addDays,
  daysBetween,
  type Attachment,
  type AttachmentRepo,
  type Clock,
  type FillUp,
  type MaintenanceItem,
  type OdometerReading,
  type SafetyReport,
  type ServiceRecord,
  type Vehicle,
} from '@car/core'

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

/** Who signs in on a first run (see `demoSignedOut`): a new owner with no cars yet. */
const NEW_OWNER = 'demo-new-owner'

const DEMO_CHECKED = '2026-10-17 12:00:00Z'

/**
 * Made-up recalls, complaints and bulletins for the demo car, shaped like NHTSA's. Not real
 * campaigns or bulletins.
 */
const DEMO_SAFETY: SafetyReport = {
  recallsCheckedAt: DEMO_CHECKED,
  complaintsCheckedAt: DEMO_CHECKED,
  bulletinsCheckedAt: DEMO_CHECKED,
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
      byMileage: [
        { from: 10_000, complaints: 3 },
        { from: 20_000, complaints: 5 },
        { from: 30_000, complaints: 9 },
        { from: 40_000, complaints: 6 },
        { from: 50_000, complaints: 2 },
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
      byMileage: [
        { from: 20_000, complaints: 1 },
        { from: 30_000, complaints: 3 },
        { from: 40_000, complaints: 1 },
      ],
    },
    {
      id: 'demo-c3',
      configId: 'demo',
      component: 'POWER TRAIN',
      complaints: 8,
      crashes: 0,
      fires: 0,
      injuries: 0,
      deaths: 0,
      latestFiledOn: '2026-05-21',
      recent: [
        {
          filedOn: '2026-05-21',
          summary: 'Sample complaint. The transmission shudders between 25 and 40 mph.',
        },
      ],
      byMileage: [
        { from: 30_000, complaints: 2 },
        { from: 40_000, complaints: 4 },
        { from: 60_000, complaints: 2 },
      ],
    },
  ],
  bulletins: [
    {
      id: 'demo-b1',
      configId: 'demo',
      nhtsaId: 900001,
      documentId: 'ZH1',
      kind: 'warranty',
      issuedOn: '2025-09-12',
      components: ['FUEL/PROPULSION SYSTEM'],
      system: 'Fuel / Fuel pump',
      summary:
        'COVERAGE FOR THE LOW PRESSURE FUEL PUMP IS EXTENDED TO 10 YEARS OR 150,000 MILES. THE ENGINE MAY HESITATE OR STALL IF THE PUMP FAILS. SAMPLE BULLETIN.',
    },
    {
      id: 'demo-b2',
      configId: 'demo',
      nhtsaId: 900002,
      documentId: 'T-SB-0042-25',
      kind: 'bulletin',
      issuedOn: '2025-04-03',
      components: ['POWER TRAIN'],
      system: 'Drivetrain / Automatic transmission',
      summary:
        'SOME VEHICLES MAY EXHIBIT A SHUDDER BETWEEN 25 AND 40 MPH. UPDATE THE TCM SOFTWARE AND RECHECK. SAMPLE BULLETIN.',
    },
    {
      id: 'demo-b3',
      configId: 'demo',
      nhtsaId: 900003,
      documentId: 'T-SB-0017-24',
      kind: 'bulletin',
      issuedOn: '2024-11-18',
      components: ['SERVICE BRAKES'],
      system: 'Brakes / Front brakes',
      summary:
        'A SQUEAL FROM THE FRONT BRAKES WHEN COLD MAY BE HEARD. INSTALL THE REVISED PAD SHIMS. SAMPLE BULLETIN.',
    },
    {
      id: 'demo-b4',
      configId: 'demo',
      nhtsaId: 900004,
      documentId: 'T-SB-0031-24',
      kind: 'software',
      issuedOn: '2024-06-07',
      components: ['ELECTRICAL SYSTEM'],
      system: 'Audio / Multimedia',
      summary:
        'THE MULTIMEDIA SCREEN MAY FREEZE ON START UP. UPDATE THE HEAD UNIT SOFTWARE. SAMPLE BULLETIN.',
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

/** Sample documents and a receipt for the demo car, for the web preview's screenshots. */
export const DEMO_ATTACHMENTS: Attachment[] = [
  {
    id: 'demo-insurance',
    vehicleId: 'demo',
    kind: 'insurance',
    name: 'Insurance card.pdf',
    contentType: 'application/pdf',
    sizeBytes: 182_000,
    addedOn: '2026-09-01',
  },
  {
    id: 'demo-registration',
    vehicleId: 'demo',
    kind: 'registration',
    name: 'Registration.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1_240_000,
    addedOn: '2026-03-02',
  },
  {
    id: 'demo-receipt',
    vehicleId: 'demo',
    serviceRecordId: 'seed-1',
    kind: 'receipt',
    name: 'Receipt.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 640_000,
    addedOn: '2026-07-01',
  },
]

/**
 * Attachments kept in memory. Opening one gives back the picked file's own URI, or the sample
 * file in `files` for the seeded ones; without `files` the demo starts with none.
 */
export const demoAttachments = (files?: Record<string, string>): AttachmentRepo => {
  const repo = memoryAttachments(files ? DEMO_ATTACHMENTS : [])
  return {
    ...repo,
    open: async (attachment) =>
      repo.files.get(attachment.id)?.uri ?? files?.[attachment.id] ?? repo.open(attachment),
  }
}

/** Sample data for running the app without a backend, e.g. before Supabase is set up. */
/** Where the demo car's odometer was on the days its readings and services say. */
const DEMO_MILEAGE: [date: string, miles: number][] = [
  ['2025-09-20', 18_200],
  ['2026-03-14', 23_400],
  ['2026-04-02', 24_150],
  ['2026-07-01', 30_000],
  ['2026-08-15', 33_400],
  ['2026-10-10', 35_780],
  ['2026-10-16', 36_080],
]

/** What a photo of the demo car's odometer reads, a little past its last reading. */
export const DEMO_ODOMETER_PHOTO_MILES = 36_412

const demoMilesOn = (date: string): number => {
  const after = DEMO_MILEAGE.findIndex(([d]) => d > date)
  const last = DEMO_MILEAGE.length - 1
  const [fromDate, fromMiles] = DEMO_MILEAGE[after < 0 ? last : Math.max(0, after - 1)] ?? ['', 0]
  const [toDate, toMiles] = DEMO_MILEAGE[after < 0 ? last : after] ?? ['', 0]
  const span = daysBetween(fromDate, toDate)
  return span === 0
    ? fromMiles
    : Math.round(fromMiles + ((toMiles - fromMiles) * daysBetween(fromDate, date)) / span)
}

/**
 * A year of fill-ups every tankful, at the mileage the car's readings show: better
 * economy in summer, prices that rise into summer, one top-up that did not fill the tank, and
 * the same two stations most of the time. An electric car gets charging sessions instead, mostly
 * at home and now and then at a fast charger.
 */
export const demoFillUps = (electric = false): FillUp[] => {
  const fills: FillUp[] = []
  let date = '2025-10-04'
  let lastMiles = demoMilesOn(date)
  for (let i = 0; date <= '2026-10-16'; i++) {
    const miles = demoMilesOn(date)
    const month = Number(date.slice(5, 7))
    const summer = Math.cos(((month - 7) / 12) * 2 * Math.PI)
    const partial = i === 21
    if (electric) {
      // Batteries go further in summer than in the cold.
      const milesPerKwh = 3.6 + 0.5 * summer + Math.sin(i * 2.3) * 0.15
      const kwh = i === 0 ? 55 : Math.round(((miles - lastMiles) / milesPerKwh) * 10) / 10
      const fast = i % 5 === 4
      fills.push({
        id: `demo-fuel-${i}`,
        vehicleId: 'demo',
        filledOn: date,
        odometerMiles: miles,
        energy: 'electric',
        quantity: kwh,
        costCents: Math.round(kwh * (fast ? 0.42 : 0.16) * 100),
        full: !partial,
        missedPrevious: false,
        station: fast ? 'Electrify America' : 'Home',
      })
    } else {
      const mpg = 29 + 2.5 * summer + Math.sin(i * 2.3) * 0.9
      const gallons = Math.round(((miles - lastMiles) / mpg) * 1000) / 1000
      const price = 3.35 + 0.25 * summer + Math.sin(i * 1.7) * 0.08
      fills.push({
        id: `demo-fuel-${i}`,
        vehicleId: 'demo',
        filledOn: date,
        odometerMiles: miles,
        energy: 'fuel',
        quantity: i === 0 ? 12.8 : gallons,
        costCents: Math.round((i === 0 ? 12.8 : gallons) * price * 100),
        full: !partial,
        missedPrevious: false,
        station: i % 3 === 2 ? 'Shell' : 'Costco',
      })
    }
    lastMiles = miles
    // About 330 to 390 miles a tank, or 180 to 220 a charge, so they come closer together while
    // it is driven more.
    const range = electric ? 200 + Math.sin(i * 1.3) * 20 : 360 + Math.sin(i * 1.3) * 30
    const perDay = Math.max(1, (demoMilesOn(addDays(date, 14)) - miles) / 14)
    date = addDays(date, Math.max(electric ? 2 : 4, Math.round(range / perDay)))
  }
  return fills
}

/**
 * An older second car for UI tests of a garage with two. Its oil change is overdue by mileage, so
 * it stays the car's next item whatever day the tests run.
 */
const SECOND_CAR: Vehicle = {
  id: 'demo-2',
  configId: 'demo',
  year: 2016,
  make: 'Honda',
  model: 'Civic',
  trim: 'LX',
  nickname: 'Commuter',
  severeDuty: false,
}

const SECOND_CAR_READINGS: OdometerReading[] = [
  { vehicleId: 'demo-2', date: '2026-03-01', miles: 81_200 },
  { vehicleId: 'demo-2', date: '2026-10-05', miles: 88_900 },
]

const SECOND_CAR_RECORDS: ServiceRecord[] = [
  {
    id: 'seed-2-1',
    vehicleId: 'demo-2',
    itemId: 'demo-oil',
    performedOn: '2026-05-01',
    odometerMiles: 82_000,
  },
  {
    id: 'seed-2-2',
    vehicleId: 'demo-2',
    itemId: 'demo-tires',
    performedOn: '2026-09-15',
    odometerMiles: 88_100,
  },
]

export const createDemoRepositories = () => {
  // Already signed in, so the demo opens on the sample car. After signing out, any email with
  // code 123456 signs back in as the same demo owner. UI tests can start signed out instead, to
  // walk through a first run: the introduction, then signing in as a new owner with no cars.
  const firstRun = launchFlag('demoSignedOut')
  // UI tests can add a second car, to show a garage with more than one.
  const twoCars = launchFlag('demoTwoCars')
  // Or make the demo car electric, to show the pages that speak of charging rather than fuel.
  const electric = launchFlag('demoElectric')
  const auth = memoryAuth({
    ...(firstRun ? {} : { user: { id: OWNER, email: 'demo@example.com' } }),
    userIdFor: () => (firstRun ? NEW_OWNER : OWNER),
  })
  const vehicles = memoryVehicles([
    {
      id: 'demo',
      configId: 'demo',
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      engine: electric ? 'Electric motor' : '2.5L 4-cyl',
      drivetrain: 'AWD',
      nickname: 'Demo car',
      severeDuty: false,
    },
    ...(twoCars ? [SECOND_CAR] : []),
  ])
  const odometer = memoryOdometer([
    { vehicleId: 'demo', date: '2026-04-02', miles: 24_150 },
    { vehicleId: 'demo', date: '2026-10-10', miles: 35_780 },
    ...(twoCars ? SECOND_CAR_READINGS : []),
  ])
  // The owner's own schedule items and intervals, applied to the demo car's schedule.
  const customItems = memoryCustomItems([
    // The owner stretched the engine air filter to the interval in their manual.
    {
      id: 'demo-own-engine-air',
      vehicleId: 'demo',
      replacesItemId: 'demo-engine-air',
      task: 'Engine air filter',
      intervalMiles: 20_000,
      intervalMonths: 24,
    },
  ])
  return {
    auth,
    // Deleting the demo account only signs out; the sample data stays for the next sign-in.
    account: memoryAccount(auth),
    sync: memorySync(),
    vehicles: {
      ...vehicles,
      // The server matches a new car to its schedule; the demo gives every car the sample one.
      // The mileage typed in becomes the car's first reading, as the real database stores it.
      add: async (ownerId: string, vehicle: Vehicle, firstReading?: OdometerReading) => {
        await vehicles.add(
          ownerId,
          { ...vehicle, configId: vehicle.configId ?? 'demo' },
          firstReading,
        )
        if (firstReading) await odometer.add(firstReading)
      },
    },
    odometer,
    fillUps: memoryFillUps(demoFillUps(electric)),
    customItems,
    schedule: memorySchedule(DEMO_SCHEDULE, customItems),
    safety: memorySafety({ demo: DEMO_SAFETY }),
    // Factory coverage as Toyota states it for a RAV4, from a sale in April 2022, plus a dealer's
    // add-on, so the demo shows coverage that has ended, is ending soon and has years left.
    warranties: memoryWarranties([
      {
        id: 'demo-w-basic',
        vehicleId: 'demo',
        kind: 'basic',
        provider: 'Toyota',
        startsOn: '2022-04-02',
        months: 36,
        endMiles: 36_000,
      },
      {
        id: 'demo-w-powertrain',
        vehicleId: 'demo',
        kind: 'powertrain',
        provider: 'Toyota',
        startsOn: '2022-04-02',
        months: 60,
        endMiles: 60_000,
      },
      {
        id: 'demo-w-corrosion',
        vehicleId: 'demo',
        kind: 'corrosion',
        provider: 'Toyota',
        startsOn: '2022-04-02',
        months: 60,
      },
      {
        id: 'demo-w-tires',
        vehicleId: 'demo',
        kind: 'other',
        provider: 'Demo Garage tire and wheel plan',
        startsOn: '2024-01-10',
        months: 36,
        policyNumber: 'TW-20431',
      },
    ]),
    // The set on the car is young; the stored winter set is six years old and due to go, so the
    // demo shows both what a set looks like and the warning.
    tireSets: memoryTireSets([
      {
        id: 'demo-tires-all-season',
        vehicleId: 'demo',
        name: 'All-season',
        brand: 'Michelin CrossClimate 2',
        size: '225/65R17',
        madeWeek: 11,
        madeYear: 2024,
        mounted: true,
        mountedAtMiles: 24_150,
        priorMiles: 9_800,
        treadDepth32nds: 7,
        treadCheckedOn: '2026-09-20',
      },
      {
        id: 'demo-tires-winter',
        vehicleId: 'demo',
        name: 'Winter',
        brand: 'Bridgestone Blizzak DM-V2',
        size: '225/65R17',
        madeWeek: 40,
        madeYear: 2020,
        mounted: false,
        priorMiles: 11_200,
        treadDepth32nds: 6,
        treadCheckedOn: '2026-04-02',
        notes: 'Stored at Demo Garage',
      },
    ]),
    // The registration is two weeks from expiring, the emissions test slipped by, and the
    // six-month insurance policy has months left: one of each state.
    renewals: memoryRenewals([
      {
        id: 'demo-r-registration',
        vehicleId: 'demo',
        kind: 'registration',
        dueOn: '2026-10-31',
        everyMonths: 12,
        notes: 'Plate 8DEM123. Renew at dmv.ca.gov or a DMV kiosk.',
      },
      {
        id: 'demo-r-emissions',
        vehicleId: 'demo',
        kind: 'emissions',
        dueOn: '2026-10-12',
        everyMonths: 24,
      },
      {
        id: 'demo-r-insurance',
        vehicleId: 'demo',
        kind: 'insurance',
        dueOn: '2027-02-28',
        everyMonths: 6,
        notes: 'Demo Mutual, policy DM-4471-02',
      },
    ]),
    attachments: demoAttachments(),
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
        id: 'seed-5',
        vehicleId: 'demo',
        itemId: 'demo-brakes',
        performedOn: '2026-03-14',
        odometerMiles: 23_400,
        shop: 'Demo Garage',
        notes: 'Checked with the tire rotation',
      },
      {
        id: 'seed-6',
        vehicleId: 'demo',
        itemId: 'demo-battery',
        performedOn: '2026-03-14',
        odometerMiles: 23_400,
        shop: 'Demo Garage',
      },
      {
        id: 'seed-7',
        vehicleId: 'demo',
        itemId: 'demo-brake-fluid',
        performedOn: '2025-04-12',
        odometerMiles: 12_900,
        costCents: 11_995,
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
      {
        id: 'seed-4',
        vehicleId: 'demo',
        itemId: 'demo-engine-air',
        performedOn: '2026-08-15',
        odometerMiles: 33_400,
        costCents: 2_199,
        notes: 'Did it myself',
      },
      ...(twoCars ? SECOND_CAR_RECORDS : []),
    ]),
  }
}

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
        schedule: await repositories.schedule.itemsForVehicle(vehicle),
        records: await repositories.records.listForVehicle(vehicleId),
        safety: DEMO_SAFETY,
        complaints: [],
      }
    },
  })
