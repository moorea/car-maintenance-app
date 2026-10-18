import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { z } from 'zod'
import type {
  Attachment,
  FillUp,
  MaintenanceItem,
  Renewal,
  OdometerReading,
  ServiceRecord,
  Vehicle,
  Warranty,
} from '../domain/types'
import type { IsoDate } from '../lib/date'
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '../features/attachments/files'
import { RENEWAL_KIND_IDS } from '../schemas/renewal'
import { csv } from './csv'
import { NOTES_MAX, SHORT_TEXT_MAX } from '../schemas/text'

/**
 * A full copy of an owner's data as one zip, in open formats: `car-data.json` holds everything and
 * is what import reads; the CSV files are the same data for a spreadsheet; `documents/` holds every
 * attached file under a readable name. See ADR 0013.
 */
export const EXPORT_FORMAT = 'car-maintenance-export'
export const EXPORT_VERSION = 1
export const DATA_FILE = 'car-data.json'

/** One car and everything stored about it, as export reads it from the repositories. */
export interface CarData {
  vehicle: Vehicle
  readings: OdometerReading[]
  services: ServiceRecord[]
  attachments: Attachment[]
  warranties: Warranty[]
  /** Fill-ups and charging sessions. Their mileage is not repeated in `readings`. */
  fillUps: FillUp[]
  /** Registration, inspection and insurance dates. */
  renewals: Renewal[]
  /** The car's schedule, to name each service's item. */
  items: MaintenanceItem[]
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const text = (max: number) => z.string().max(max)

// Free text past the server's limits is cut to fit, so an export never fails to import. Cut by
// character, as Postgres counts, so an emoji is never split in half.
const clipped = (max: number) =>
  z
    .string()
    .transform((s) => Array.from(s).slice(0, max).join(''))
    .optional()

const exportedService = z.object({
  id: z.string().min(1),
  /** The schedule item it counts as; ids are stable for a config across schedule updates. */
  itemId: z.string().min(1).optional(),
  /** What the item is, such as "engine-oil", for a reader without this app's ids. */
  itemKind: z.string().optional(),
  task: z.string().optional(),
  performedOn: isoDate,
  odometerMiles: z.number().int().nonnegative().optional(),
  costCents: z.number().int().nonnegative().optional(),
  shop: clipped(SHORT_TEXT_MAX),
  notes: clipped(NOTES_MAX),
})

const exportedDocument = z.object({
  id: z.string().min(1),
  serviceId: z.string().min(1).optional(),
  kind: z.enum(['receipt', 'registration', 'inspection', 'insurance', 'other']),
  name: z.string().min(1).max(255),
  contentType: z.enum(ATTACHMENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  addedOn: isoDate,
  /** Its path in the zip, or null when the file could not be included. */
  file: z.string().min(1).nullable(),
})

const exportedWarranty = z
  .object({
    id: z.string().min(1),
    kind: z.enum([
      'basic',
      'powertrain',
      'corrosion',
      'emissions',
      'hybrid-battery',
      'extended',
      'other',
    ]),
    provider: clipped(SHORT_TEXT_MAX),
    startsOn: isoDate,
    months: z.number().int().min(1).max(1200).optional(),
    endMiles: z.number().int().min(1).max(2_000_000).optional(),
    policyNumber: clipped(SHORT_TEXT_MAX),
    notes: clipped(NOTES_MAX),
  })
  .refine((w) => w.months !== undefined || w.endMiles !== undefined, 'A warranty needs a limit')

const exportedFillUp = z.object({
  id: z.string().min(1),
  filledOn: isoDate,
  odometerMiles: z.number().int().min(0).max(2_000_000),
  energy: z.enum(['fuel', 'electric']),
  /** Gallons of fuel or kWh of charge. */
  quantity: z.number().positive().max(1_000),
  costCents: z.number().int().nonnegative().max(1_000_000).optional(),
  full: z.boolean(),
  missedPrevious: z.boolean(),
  station: clipped(SHORT_TEXT_MAX),
  notes: clipped(NOTES_MAX),
})

const exportedRenewal = z.object({
  id: z.string().min(1),
  kind: z.enum(RENEWAL_KIND_IDS),
  title: z.string().min(1).max(100).optional(),
  dueOn: isoDate,
  everyMonths: z.number().int().min(1).max(120).optional(),
  notes: clipped(NOTES_MAX),
})

const exportedCar = z.object({
  id: z.string().min(1),
  year: z.number().int(),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  trim: text(60).optional(),
  engine: text(60).optional(),
  drivetrain: text(60).optional(),
  vin: z.string().length(17).optional(),
  nickname: z.string().max(40),
  severeDuty: z.boolean(),
  odometer: z.array(z.object({ date: isoDate, miles: z.number().int().nonnegative() })),
  services: z.array(exportedService),
  documents: z.array(exportedDocument),
  warranties: z.array(exportedWarranty),
  // Exports made before fill-ups existed have none.
  fillUps: z.array(exportedFillUp).default([]),
  // Exports made before renewals existed have none.
  renewals: z.array(exportedRenewal).default([]),
})

const exportFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedOn: isoDate,
  cars: z.array(exportedCar),
})

export type ExportedCar = z.infer<typeof exportedCar>
export type ExportedService = z.infer<typeof exportedService>
export type ExportedDocument = z.infer<typeof exportedDocument>
export type ExportedWarranty = z.infer<typeof exportedWarranty>
export type ExportedFillUp = z.infer<typeof exportedFillUp>
export type ExportedRenewal = z.infer<typeof exportedRenewal>
export type ExportFile = z.infer<typeof exportFile>

/** A car's name in the export: its nickname, or year, make and model. */
const carLabel = (v: Vehicle) => v.nickname.trim() || `${v.year} ${v.make} ${v.model}`

/** A name safe as a zip folder or file on every system. */
const safeName = (name: string) =>
  name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-')
    .slice(0, 100)
    // Windows refuses names that end in a dot or a space.
    .replace(/^[.\s]+|[.\s]+$/g, '') || 'Untitled'

/**
 * Gives each name a unique version, adding " (2)" and so on to repeats: before the extension for
 * file names.
 */
const uniquely = (files = false) => {
  const used = new Set<string>()
  return (name: string) => {
    const dot = files ? name.lastIndexOf('.') : -1
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
    let candidate = name
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`
    used.add(candidate.toLowerCase())
    return candidate
  }
}

/** "Oil change.pdf" stays as is; a file without its extension gets one from its type. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}
const withExtension = (name: string, contentType: string) => {
  const extension = EXTENSIONS[contentType]
  return extension &&
    !name.toLowerCase().endsWith(`.${extension}`) &&
    !(extension === 'jpg' && /\.jpe?g$/i.test(name))
    ? `${name}.${extension}`
    : name
}

const dollars = (cents: number | undefined) => (cents === undefined ? '' : (cents / 100).toFixed(2))

const README = (exportedOn: IsoDate) => `Your car data, exported on ${exportedOn}.

car-data.json   Everything below in one file. Importing this zip into the app reads it.
cars.csv        Your cars.
service-log.csv Every logged service, with its cost in US dollars.
odometer.csv    Every odometer reading, in miles.
warranties.csv  Every warranty, with when and at what mileage it ends.
fill-ups.csv    Every fill-up and charging session: gallons or kWh, and its cost in US dollars.
renewals.csv    Every registration, inspection and insurance date, and how often it repeats.
documents.csv   Every attached receipt, registration, inspection report, insurance card or file.
documents/      The files themselves, in a folder per car.

The CSV files open in Numbers, Excel or Google Sheets. Dates are YYYY-MM-DD.
`

export interface BuiltArchive {
  /** The zip's bytes. */
  bytes: Uint8Array
  /** Attachments whose file was not available, so the zip lists them without the file. */
  missing: Attachment[]
}

/**
 * Builds the export zip. `files` has each attachment's bytes by id; an attachment without them
 * is listed with a null file. Only the files are compressed lightly: photos and PDFs are already
 * compressed, so trying harder only costs time.
 */
export const buildArchive = (
  cars: readonly CarData[],
  files: ReadonlyMap<string, Uint8Array>,
  exportedOn: IsoDate,
): BuiltArchive => {
  const carName = uniquely()
  const missing: Attachment[] = []
  const zip: Zippable = {}
  const rows = {
    cars: [
      [
        'car',
        'year',
        'make',
        'model',
        'trim',
        'engine',
        'drivetrain',
        'vin',
        'nickname',
        'severe_duty',
      ],
    ],
    services: [['car', 'date', 'service', 'odometer_miles', 'cost_usd', 'shop', 'notes', 'files']],
    odometer: [['car', 'date', 'miles']],
    documents: [['car', 'kind', 'name', 'added_on', 'service_date', 'file']],
    warranties: [
      ['car', 'kind', 'provider', 'starts_on', 'months', 'end_miles', 'policy_number', 'notes'],
    ],
    fillUps: [
      [
        'car',
        'date',
        'odometer_miles',
        'energy',
        'quantity',
        'unit',
        'cost_usd',
        'full',
        'missed_previous',
        'station',
        'notes',
      ],
    ],
    renewals: [['car', 'kind', 'name', 'due_on', 'every_months', 'notes']],
  }

  const exported: ExportedCar[] = cars.map(
    ({ vehicle: v, readings, services, attachments, warranties, fillUps, renewals, items }) => {
      const label = carName(safeName(carLabel(v)))
      const fileName = uniquely(true)
      const itemById = new Map(items.map((i) => [i.id, i]))
      const serviceById = new Map(services.map((s) => [s.id, s]))

      const documents: ExportedDocument[] = [...attachments]
        .sort((a, b) => a.addedOn.localeCompare(b.addedOn))
        .map((a) => {
          const bytes = files.get(a.id)
          let file: string | null = null
          if (bytes) {
            file = `documents/${label}/${fileName(safeName(withExtension(a.name, a.contentType)))}`
            zip[file] = [bytes, { level: 0 }]
          } else {
            missing.push(a)
          }
          const service = a.serviceRecordId ? serviceById.get(a.serviceRecordId) : undefined
          rows.documents.push([
            label,
            a.kind,
            a.name,
            a.addedOn,
            service?.performedOn ?? '',
            file ?? '',
          ])
          return {
            id: a.id,
            ...(a.serviceRecordId && { serviceId: a.serviceRecordId }),
            kind: a.kind,
            name: a.name,
            contentType: a.contentType as ExportedDocument['contentType'],
            sizeBytes: a.sizeBytes,
            addedOn: a.addedOn,
            file,
          }
        })

      const sortedServices = [...services].sort((a, b) =>
        a.performedOn.localeCompare(b.performedOn),
      )
      for (const s of sortedServices) {
        const files = documents.filter((d) => d.serviceId === s.id && d.file).map((d) => d.file)
        rows.services.push([
          label,
          s.performedOn,
          (s.itemId && itemById.get(s.itemId)?.task) ?? '',
          s.odometerMiles?.toString() ?? '',
          dollars(s.costCents),
          s.shop ?? '',
          s.notes ?? '',
          files.join('; '),
        ])
      }
      const sortedReadings = [...readings].sort((a, b) => a.date.localeCompare(b.date))
      for (const r of sortedReadings) rows.odometer.push([label, r.date, String(r.miles)])
      const sortedWarranties = [...warranties].sort((a, b) => a.startsOn.localeCompare(b.startsOn))
      for (const w of sortedWarranties)
        rows.warranties.push([
          label,
          w.kind,
          w.provider ?? '',
          w.startsOn,
          w.months?.toString() ?? '',
          w.endMiles?.toString() ?? '',
          w.policyNumber ?? '',
          w.notes ?? '',
        ])
      const sortedFillUps = [...fillUps].sort(
        (a, b) => a.filledOn.localeCompare(b.filledOn) || a.odometerMiles - b.odometerMiles,
      )
      for (const f of sortedFillUps)
        rows.fillUps.push([
          label,
          f.filledOn,
          String(f.odometerMiles),
          f.energy,
          String(f.quantity),
          f.energy === 'fuel' ? 'gal' : 'kWh',
          dollars(f.costCents),
          f.full ? 'yes' : 'no',
          f.missedPrevious ? 'yes' : 'no',
          f.station ?? '',
          f.notes ?? '',
        ])
      const sortedRenewals = [...renewals].sort(
        (a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id),
      )
      for (const r of sortedRenewals)
        rows.renewals.push([
          label,
          r.kind,
          r.title ?? '',
          r.dueOn,
          r.everyMonths !== undefined ? String(r.everyMonths) : '',
          r.notes ?? '',
        ])
      rows.cars.push([
        label,
        String(v.year),
        v.make,
        v.model,
        v.trim ?? '',
        v.engine ?? '',
        v.drivetrain ?? '',
        v.vin ?? '',
        v.nickname,
        v.severeDuty ? 'yes' : 'no',
      ])

      return {
        id: v.id,
        year: v.year,
        make: v.make,
        model: v.model,
        ...(v.trim && { trim: v.trim }),
        ...(v.engine && { engine: v.engine }),
        ...(v.drivetrain && { drivetrain: v.drivetrain }),
        ...(v.vin && { vin: v.vin }),
        nickname: v.nickname,
        severeDuty: v.severeDuty,
        odometer: sortedReadings.map((r) => ({ date: r.date, miles: r.miles })),
        services: sortedServices.map((s) => {
          const item = s.itemId ? itemById.get(s.itemId) : undefined
          return {
            id: s.id,
            ...(s.itemId && { itemId: s.itemId }),
            ...(item?.kind && { itemKind: item.kind }),
            ...(item && { task: item.task }),
            performedOn: s.performedOn,
            ...(s.odometerMiles !== undefined && { odometerMiles: s.odometerMiles }),
            ...(s.costCents !== undefined && { costCents: s.costCents }),
            ...(s.shop && { shop: s.shop }),
            ...(s.notes && { notes: s.notes }),
          }
        }),
        documents,
        warranties: sortedWarranties.map((w) => ({
          id: w.id,
          kind: w.kind,
          ...(w.provider && { provider: w.provider }),
          startsOn: w.startsOn,
          ...(w.months !== undefined && { months: w.months }),
          ...(w.endMiles !== undefined && { endMiles: w.endMiles }),
          ...(w.policyNumber && { policyNumber: w.policyNumber }),
          ...(w.notes && { notes: w.notes }),
        })),
        fillUps: sortedFillUps.map((f) => ({
          id: f.id,
          filledOn: f.filledOn,
          odometerMiles: f.odometerMiles,
          energy: f.energy,
          quantity: f.quantity,
          ...(f.costCents !== undefined && { costCents: f.costCents }),
          full: f.full,
          missedPrevious: f.missedPrevious,
          ...(f.station && { station: f.station }),
          ...(f.notes && { notes: f.notes }),
        })),
        renewals: sortedRenewals.map((r) => ({
          id: r.id,
          kind: r.kind,
          ...(r.title && { title: r.title }),
          dueOn: r.dueOn,
          ...(r.everyMonths !== undefined && { everyMonths: r.everyMonths }),
          ...(r.notes && { notes: r.notes }),
        })),
      }
    },
  )

  const data: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedOn,
    cars: exported,
  }
  zip['README.txt'] = strToU8(README(exportedOn))
  zip[DATA_FILE] = strToU8(`${JSON.stringify(data, null, 2)}\n`)
  zip['cars.csv'] = strToU8(csv(rows.cars))
  zip['service-log.csv'] = strToU8(csv(rows.services))
  zip['odometer.csv'] = strToU8(csv(rows.odometer))
  zip['warranties.csv'] = strToU8(csv(rows.warranties))
  zip['fill-ups.csv'] = strToU8(csv(rows.fillUps))
  zip['renewals.csv'] = strToU8(csv(rows.renewals))
  zip['documents.csv'] = strToU8(csv(rows.documents))
  return { bytes: zipSync(zip, { level: 6 }), missing }
}

/**
 * - `not-an-export`: not a zip, or a zip without car-data.json.
 * - `newer-version`: made by a newer version of the app; update to import it.
 * - `damaged`: car-data.json is there but not what the app writes.
 */
export type ImportErrorKind = 'not-an-export' | 'newer-version' | 'damaged'

export class ImportError extends Error {
  constructor(
    readonly kind: ImportErrorKind,
    message: string = kind,
  ) {
    super(message)
    this.name = 'ImportError'
  }
}

export interface OpenedArchive {
  data: ExportFile
  /** A document's file from the zip, or undefined if the zip does not have it. */
  file(path: string): Uint8Array | undefined
}

/** Reads an export zip. Throws ImportError if it is not one this version of the app can import. */
export const readArchive = (bytes: Uint8Array): OpenedArchive => {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch (e) {
    throw new ImportError('not-an-export', String(e))
  }
  const json = entries[DATA_FILE]
  if (!json) throw new ImportError('not-an-export', `No ${DATA_FILE} in the zip`)
  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(json))
  } catch (e) {
    throw new ImportError('damaged', String(e))
  }
  const header = z
    .object({ format: z.literal(EXPORT_FORMAT), version: z.number() })
    .safeParse(parsed)
  if (!header.success) throw new ImportError('not-an-export', 'Not a car data export')
  if (header.data.version > EXPORT_VERSION)
    throw new ImportError('newer-version', `Export version ${header.data.version}`)
  const result = exportFile.safeParse(parsed)
  if (!result.success) throw new ImportError('damaged', result.error.message)
  return { data: result.data, file: (path) => entries[path] }
}
