import type {
  Attachment,
  AttachmentKind,
  ComplaintSummary,
  MaintenanceItem,
  OdometerReading,
  Recall,
  SafetyReport,
  ServiceRecord,
  Vehicle,
  Warranty,
  WarrantyKind,
} from '@car/core'

/** SQLite returns NULL for missing values; the domain uses absent properties. */
type Row = Record<string, unknown>

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const required = <T>(v: T | undefined, field: string): T => {
  if (v === undefined) throw new Error(`Row is missing ${field}`)
  return v
}

type UndefinedKeys<T> = { [K in keyof T]: undefined extends T[K] ? K : never }[keyof T]
/** Properties that may be undefined become optional, as exactOptionalPropertyTypes requires. */
type Defined<T> = Omit<T, UndefinedKeys<T>> & {
  [K in UndefinedKeys<T>]?: Exclude<T[K], undefined>
}

/** Drops undefined values so objects satisfy exactOptionalPropertyTypes. */
const defined = <T extends object>(o: T): Defined<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Defined<T>

// A malformed row falls back to blanks rather than throwing, so one bad car never hides the rest.
export const toVehicle = (r: Row): Vehicle =>
  defined({
    id: required(text(r.id), 'id'),
    configId: text(r.config_id),
    vin: text(r.vin),
    year: num(r.year) ?? 0,
    make: text(r.make) ?? '',
    model: text(r.model) ?? '',
    trim: text(r.trim),
    engine: text(r.engine),
    drivetrain: text(r.drivetrain),
    nickname: text(r.nickname) ?? '',
    severeDuty: r.severe_duty === 1,
  })

/** The columns the device writes for a new car. The server fills in config_id. */
export const fromVehicle = (ownerId: string, v: Vehicle) => ({
  id: v.id,
  owner_id: ownerId,
  vin: v.vin ?? null,
  year: v.year,
  make: v.make,
  model: v.model,
  trim: v.trim ?? null,
  engine: v.engine ?? null,
  drivetrain: v.drivetrain ?? null,
  nickname: v.nickname,
  severe_duty: v.severeDuty ? 1 : 0,
})

export const toServiceRecord = (r: Row): ServiceRecord =>
  defined({
    id: required(text(r.id), 'id'),
    vehicleId: required(text(r.vehicle_id), 'vehicle_id'),
    performedOn: required(text(r.performed_on), 'performed_on'),
    itemId: text(r.item_id),
    odometerMiles: num(r.odometer_miles),
    costCents: num(r.cost_cents),
    shop: text(r.shop),
    notes: text(r.notes),
  })

export const fromServiceRecord = (s: ServiceRecord) => ({
  id: s.id,
  vehicle_id: s.vehicleId,
  performed_on: s.performedOn,
  item_id: s.itemId ?? null,
  odometer_miles: s.odometerMiles ?? null,
  cost_cents: s.costCents ?? null,
  shop: s.shop ?? null,
  notes: s.notes ?? null,
})

const WARRANTY_KINDS = new Set<string>([
  'basic',
  'powertrain',
  'corrosion',
  'emissions',
  'hybrid-battery',
  'extended',
  'other',
] satisfies WarrantyKind[])

export const toWarranty = (r: Row): Warranty => {
  const kind = text(r.kind)
  return defined({
    id: required(text(r.id), 'id'),
    vehicleId: required(text(r.vehicle_id), 'vehicle_id'),
    // A kind added by a newer app version reads as "other" rather than hiding the warranty.
    kind: kind !== undefined && WARRANTY_KINDS.has(kind) ? (kind as WarrantyKind) : 'other',
    provider: text(r.provider),
    startsOn: required(text(r.starts_on), 'starts_on'),
    months: num(r.months),
    endMiles: num(r.end_miles),
    policyNumber: text(r.policy_number),
    notes: text(r.notes),
  })
}

export const fromWarranty = (w: Warranty) => ({
  id: w.id,
  vehicle_id: w.vehicleId,
  kind: w.kind,
  provider: w.provider ?? null,
  starts_on: w.startsOn,
  months: w.months ?? null,
  end_miles: w.endMiles ?? null,
  policy_number: w.policyNumber ?? null,
  notes: w.notes ?? null,
})

const KINDS: readonly AttachmentKind[] = ['receipt', 'registration', 'insurance', 'other']
const kind = (v: unknown): AttachmentKind => KINDS.find((k) => k === v) ?? 'other'

export const toAttachment = (r: Row): Attachment =>
  defined({
    id: required(text(r.id), 'id'),
    vehicleId: required(text(r.vehicle_id), 'vehicle_id'),
    serviceRecordId: text(r.service_record_id),
    kind: kind(r.kind),
    name: text(r.name) ?? '',
    contentType: text(r.content_type) ?? '',
    sizeBytes: num(r.size_bytes) ?? 0,
    addedOn: text(r.added_on) ?? '',
  })

/** The columns the device writes for a new attachment, given the owner of its car. */
export const fromAttachment = (ownerId: string, a: Attachment) => ({
  id: a.id,
  owner_id: ownerId,
  vehicle_id: a.vehicleId,
  service_record_id: a.serviceRecordId ?? null,
  kind: a.kind,
  name: a.name,
  content_type: a.contentType,
  size_bytes: a.sizeBytes,
  added_on: a.addedOn,
})

export const toOdometerReading = (r: Row): OdometerReading => ({
  vehicleId: required(text(r.vehicle_id), 'vehicle_id'),
  date: required(text(r.read_on), 'read_on'),
  miles: required(num(r.miles), 'miles'),
})

export const toMaintenanceItem = (r: Row): MaintenanceItem =>
  defined({
    id: required(text(r.id), 'id'),
    configId: required(text(r.config_id), 'config_id'),
    task: required(text(r.task), 'task'),
    kind: text(r.kind),
    source: text(r.source),
    intervalMiles: num(r.interval_miles),
    intervalMonths: num(r.interval_months),
    severeMiles: num(r.severe_miles),
    severeMonths: num(r.severe_months),
  })

export const toRecall = (r: Row): Recall =>
  defined({
    id: required(text(r.id), 'id'),
    configId: required(text(r.config_id), 'config_id'),
    campaign: text(r.campaign) ?? '',
    component: text(r.component),
    summary: text(r.summary) ?? '',
    consequence: text(r.consequence),
    remedy: text(r.remedy),
    notes: text(r.notes),
    reportedOn: text(r.reported_on),
    parkIt: r.park_it === 1,
    parkOutside: r.park_outside === 1,
    overTheAir: r.over_the_air === 1,
  })

/** `recent` is JSON text; anything unreadable in it is left out. */
const recentComplaints = (json: unknown): ComplaintSummary['recent'] => {
  let parsed: unknown
  try {
    parsed = typeof json === 'string' ? JSON.parse(json) : []
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const { filed_on: filedOn, summary } = item as Record<string, unknown>
    if (typeof summary !== 'string') return []
    return [defined({ filedOn: text(filedOn), summary })]
  })
}

export const toComplaintSummary = (r: Row): ComplaintSummary =>
  defined({
    id: required(text(r.id), 'id'),
    configId: required(text(r.config_id), 'config_id'),
    component: text(r.component) ?? '',
    complaints: num(r.complaints) ?? 0,
    crashes: num(r.crashes) ?? 0,
    fires: num(r.fires) ?? 0,
    injuries: num(r.injuries) ?? 0,
    deaths: num(r.deaths) ?? 0,
    latestFiledOn: text(r.latest_filed_on),
    recent: recentComplaints(r.recent),
  })

/** A configuration's report from its row (for the check times) and its recalls and complaints. */
export const toSafetyReport = (
  config: Row,
  recalls: Recall[],
  complaints: ComplaintSummary[],
): SafetyReport =>
  defined({
    recallsCheckedAt: text(config.recalls_checked_at),
    complaintsCheckedAt: text(config.complaints_checked_at),
    recalls,
    complaints,
  })
