import type {
  Attachment,
  OdometerReading,
  PickedFile,
  ServiceRecord,
  Vehicle,
} from '../domain/types'
import type {
  AttachmentRepo,
  Clock,
  DataFiles,
  FillUpRepo,
  TireSetRepo,
  RenewalRepo,
  IdGenerator,
  OdometerRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  Unsubscribe,
  VehicleRepo,
  WarrantyRepo,
} from '../ports'
import {
  buildArchive,
  type CarData,
  type ExportedCar,
  type ExportedDocument,
  type OpenedArchive,
} from './archive'

/** Resolves with the first value a watch reports, then stops watching. */
export const firstValue = <T>(watch: (onChange: (value: T) => void) => Unsubscribe): Promise<T> =>
  new Promise((resolve) => {
    let settled = false
    let stop: Unsubscribe | undefined = undefined
    stop = watch((value) => {
      if (settled) return
      settled = true
      resolve(value)
      stop?.()
    })
    // The watch reported before it returned its unsubscribe.
    if (settled) stop()
  })

export interface ExportDeps {
  vehicles: Pick<VehicleRepo, 'watchOwned'>
  odometer: Pick<OdometerRepo, 'listForVehicle'>
  services: Pick<ServiceRecordRepo, 'listForVehicle'>
  attachments: Pick<AttachmentRepo, 'watchForVehicle' | 'open'>
  warranties: Pick<WarrantyRepo, 'listForVehicle'>
  fillUps: Pick<FillUpRepo, 'listForVehicle'>
  tireSets: Pick<TireSetRepo, 'listForVehicle'>
  renewals: Pick<RenewalRepo, 'listForVehicle'>
  schedule: ScheduleRepo
  files: Pick<DataFiles, 'read' | 'share'>
  clock: Clock
}

export interface ExportResult {
  cars: number
  services: number
  warranties: number
  fillUps: number
  tireSets: number
  renewals: number
  documents: number
  /** Documents left out because their file could not be read, usually offline. */
  missing: number
}

/** The name the share sheet offers: "Car data 2026-10-17.zip". */
export const exportFileName = (today: string) => `Car data ${today}.zip`

/**
 * Exports everything stored about the owner's cars as one zip and opens the share sheet with it.
 * Files this phone has no copy of are downloaded; those that cannot be are listed without the file.
 */
export const exportData = async (deps: ExportDeps, ownerId: string): Promise<ExportResult> => {
  const vehicles = await firstValue<Vehicle[]>((cb) => deps.vehicles.watchOwned(ownerId, cb))
  const cars: CarData[] = []
  const files = new Map<string, Uint8Array>()
  for (const vehicle of vehicles) {
    const [allReadings, services, attachments, warranties, fillUps, tireSets, renewals, items] =
      await Promise.all([
        deps.odometer.listForVehicle(vehicle.id),
        deps.services.listForVehicle(vehicle.id),
        firstValue<Attachment[]>((cb) => deps.attachments.watchForVehicle(vehicle.id, cb)),
        deps.warranties.listForVehicle(vehicle.id),
        deps.fillUps.listForVehicle(vehicle.id),
        deps.tireSets.listForVehicle(vehicle.id),
        deps.renewals.listForVehicle(vehicle.id),
        vehicle.configId ? deps.schedule.itemsForConfig(vehicle.configId) : Promise.resolve([]),
      ])
    // One at a time, so a garage of large files is never all downloading at once.
    for (const attachment of attachments) {
      try {
        files.set(attachment.id, await deps.files.read(await deps.attachments.open(attachment)))
      } catch {
        // Listed in the export without its file.
      }
    }
    // The app's readings include each fill-up's mileage (withFillUpReadings); the fill-ups carry
    // it themselves, so importing it as a reading too would make a copy that outlives an edit.
    const fromFillUps = new Set(fillUps.map((f) => `${f.filledOn}:${f.odometerMiles}`))
    const readings = allReadings.filter((r) => !fromFillUps.has(`${r.date}:${r.miles}`))
    cars.push({
      vehicle,
      readings,
      services,
      attachments,
      warranties,
      fillUps,
      tireSets,
      renewals,
      items,
    })
  }
  const today = deps.clock.today()
  const archive = buildArchive(cars, files, today)
  await deps.files.share(archive.bytes, exportFileName(today))
  return {
    cars: cars.length,
    services: cars.reduce((n, c) => n + c.services.length, 0),
    warranties: cars.reduce((n, c) => n + c.warranties.length, 0),
    fillUps: cars.reduce((n, c) => n + c.fillUps.length, 0),
    tireSets: cars.reduce((n, c) => n + c.tireSets.length, 0),
    renewals: cars.reduce((n, c) => n + c.renewals.length, 0),
    documents: cars.reduce((n, c) => n + c.attachments.length, 0),
    missing: archive.missing.length,
  }
}

const same = (a: string | undefined, b: string | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * Whether an exported car is already in the garage: the same VIN, or for a car without one, the
 * same year, make, model and nickname. Importing the same export twice then adds nothing.
 */
const isSameCar = (exported: ExportedCar, car: Vehicle) =>
  exported.vin
    ? same(exported.vin, car.vin)
    : exported.year === car.year &&
      same(exported.make, car.make) &&
      same(exported.model, car.model) &&
      same(exported.nickname, car.nickname)

/** What importing an export would do, shown for the owner to confirm. */
export interface ImportPlan {
  /** The cars that would be added. */
  adding: ExportedCar[]
  /** The cars already in the garage, which are left as they are. */
  skipping: ExportedCar[]
}

export const planImport = (archive: OpenedArchive, garage: readonly Vehicle[]): ImportPlan => {
  const adding: ExportedCar[] = []
  const skipping: ExportedCar[] = []
  for (const car of archive.data.cars) {
    ;(garage.some((v) => isSameCar(car, v)) ? skipping : adding).push(car)
  }
  return { adding, skipping }
}

const toVehicle = (car: ExportedCar, id: string): Vehicle => ({
  id,
  year: car.year,
  make: car.make,
  model: car.model,
  ...(car.trim && { trim: car.trim }),
  ...(car.engine && { engine: car.engine }),
  ...(car.drivetrain && { drivetrain: car.drivetrain }),
  ...(car.vin && { vin: car.vin }),
  nickname: car.nickname,
  severeDuty: car.severeDuty,
  ...(car.valueCents !== undefined &&
    car.valuedOn !== undefined && { valueCents: car.valueCents, valuedOn: car.valuedOn }),
})

export interface ImportDeps {
  vehicles: Pick<VehicleRepo, 'watchOwned' | 'add'>
  odometer: Pick<OdometerRepo, 'add'>
  services: Pick<ServiceRecordRepo, 'add'>
  attachments: Pick<AttachmentRepo, 'add'>
  warranties: Pick<WarrantyRepo, 'save'>
  fillUps: Pick<FillUpRepo, 'save'>
  tireSets: Pick<TireSetRepo, 'save'>
  renewals: Pick<RenewalRepo, 'save'>
  files: Pick<DataFiles, 'stage'>
  ids: IdGenerator
}

export interface ImportResult {
  cars: number
  services: number
  warranties: number
  fillUps: number
  tireSets: number
  renewals: number
  documents: number
  /** Cars left out because they were already in the garage. */
  skipped: number
  /** Documents left out because the export did not include their file. */
  missing: number
}

/**
 * Adds the export's cars that are not already in the garage, with their odometer readings,
 * services, warranties, fill-ups, tire sets, renewals and documents, under new ids: the originals
 * may still exist in another account. Works offline; everything uploads like anything the owner
 * adds.
 */
export const importData = async (
  deps: ImportDeps,
  ownerId: string,
  archive: OpenedArchive,
): Promise<ImportResult> => {
  const garage = await firstValue<Vehicle[]>((cb) => deps.vehicles.watchOwned(ownerId, cb))
  const plan = planImport(archive, garage)
  const result: ImportResult = {
    cars: 0,
    services: 0,
    warranties: 0,
    fillUps: 0,
    tireSets: 0,
    renewals: 0,
    documents: 0,
    skipped: plan.skipping.length,
    missing: 0,
  }
  for (const car of plan.adding) {
    // Files first: writing them is what most often fails (a full disk), and a car added without
    // its documents would be skipped by the next import, leaving them out for good.
    const documents: { document: ExportedDocument; bytes: Uint8Array; file: PickedFile }[] = []
    for (const document of car.documents) {
      const bytes = document.file ? archive.file(document.file) : undefined
      if (!bytes || bytes.length === 0) {
        result.missing++
        continue
      }
      documents.push({ document, bytes, file: await deps.files.stage(bytes, document) })
    }

    const vehicle = toVehicle(car, deps.ids.next())
    const readings: OdometerReading[] = car.odometer.map((r) => ({
      vehicleId: vehicle.id,
      date: r.date,
      miles: r.miles,
    }))
    const [firstReading, ...laterReadings] = readings
    await deps.vehicles.add(ownerId, vehicle, firstReading)
    result.cars++
    for (const reading of laterReadings) await deps.odometer.add(reading)

    const serviceIds = new Map<string, string>()
    for (const s of car.services) {
      const record: ServiceRecord = {
        id: deps.ids.next(),
        vehicleId: vehicle.id,
        // Item ids are stable for a configuration, and the car matches the same one again. A link
        // the server does not know is dropped on upload, keeping the service.
        ...(s.itemId && { itemId: s.itemId }),
        performedOn: s.performedOn,
        ...(s.odometerMiles !== undefined && { odometerMiles: s.odometerMiles }),
        ...(s.costCents !== undefined && { costCents: s.costCents }),
        ...(s.shop && { shop: s.shop }),
        ...(s.notes && { notes: s.notes }),
      }
      await deps.services.add(record)
      serviceIds.set(s.id, record.id)
      result.services++
    }

    for (const w of car.warranties) {
      await deps.warranties.save({
        id: deps.ids.next(),
        vehicleId: vehicle.id,
        kind: w.kind,
        ...(w.provider && { provider: w.provider }),
        startsOn: w.startsOn,
        ...(w.months !== undefined && { months: w.months }),
        ...(w.endMiles !== undefined && { endMiles: w.endMiles }),
        ...(w.policyNumber && { policyNumber: w.policyNumber }),
        ...(w.notes && { notes: w.notes }),
      })
      result.warranties++
    }

    for (const f of car.fillUps) {
      await deps.fillUps.save({
        id: deps.ids.next(),
        vehicleId: vehicle.id,
        filledOn: f.filledOn,
        odometerMiles: f.odometerMiles,
        energy: f.energy,
        quantity: f.quantity,
        ...(f.costCents !== undefined && { costCents: f.costCents }),
        full: f.full,
        missedPrevious: f.missedPrevious,
        ...(f.station && { station: f.station }),
        ...(f.notes && { notes: f.notes }),
      })
      result.fillUps++
    }

    // Only one set can be on the car, even if a hand-edited export says otherwise.
    const mounted = car.tireSets.find((t) => t.mounted)
    for (const t of car.tireSets) {
      const onCar = t === mounted
      await deps.tireSets.save({
        id: deps.ids.next(),
        vehicleId: vehicle.id,
        name: t.name,
        ...(t.brand && { brand: t.brand }),
        ...(t.size && { size: t.size }),
        ...(t.madeWeek !== undefined &&
          t.madeYear !== undefined && {
            madeWeek: t.madeWeek,
            madeYear: t.madeYear,
          }),
        mounted: onCar,
        ...(onCar && t.mountedAtMiles !== undefined && { mountedAtMiles: t.mountedAtMiles }),
        priorMiles: t.priorMiles,
        ...(t.treadDepth32nds !== undefined &&
          t.treadCheckedOn && {
            treadDepth32nds: t.treadDepth32nds,
            treadCheckedOn: t.treadCheckedOn,
          }),
        ...(t.notes && { notes: t.notes }),
      })
      result.tireSets++
    }

    for (const r of car.renewals) {
      await deps.renewals.save({
        id: deps.ids.next(),
        vehicleId: vehicle.id,
        kind: r.kind,
        ...(r.title && { title: r.title }),
        dueOn: r.dueOn,
        ...(r.everyMonths !== undefined && { everyMonths: r.everyMonths }),
        ...(r.notes && { notes: r.notes }),
      })
      result.renewals++
    }

    for (const { document: d, bytes, file } of documents) {
      const serviceRecordId = d.serviceId ? serviceIds.get(d.serviceId) : undefined
      await deps.attachments.add(
        {
          id: deps.ids.next(),
          vehicleId: vehicle.id,
          ...(serviceRecordId && { serviceRecordId }),
          kind: d.kind,
          name: d.name,
          contentType: d.contentType,
          sizeBytes: bytes.length,
          addedOn: d.addedOn,
        },
        file,
      )
      result.documents++
    }
  }
  return result
}
