import type { IsoDate } from '../lib/date'

export type VehicleId = string
export type MaintenanceItemId = string

/** What the owner's car is. A VIN decode or the owner fills it in; it picks the shared config. */
export interface VehicleDescription {
  year: number
  make: string
  model: string
  trim?: string
  /** Such as "2.0L 4-cyl" or "Electric". */
  engine?: string
  /** Such as "FWD" or "AWD". */
  drivetrain?: string
}

export interface Vehicle extends VehicleDescription {
  id: VehicleId
  /**
   * The shared configuration (schedule, recalls) the server matched from the description. Absent
   * until a newly added car has uploaded and synced back.
   */
  configId?: string
  vin?: string
  nickname: string
  severeDuty: boolean
}

/** What a VIN decodes to. */
export interface DecodedVin extends VehicleDescription {
  vin: string
}

export type VinDecodeErrorKind = 'not-found' | 'network' | 'unknown'

/** A VIN lookup failure the screen can explain. Adapters translate their own errors into these. */
export class VinDecodeError extends Error {
  constructor(
    readonly kind: VinDecodeErrorKind,
    message: string = kind,
  ) {
    super(message)
    this.name = 'VinDecodeError'
  }
}

export interface OdometerReading {
  vehicleId: VehicleId
  date: IsoDate
  miles: number
}

/**
 * Where a configuration's schedule came from: `baseline` for the app's general intervals, or the
 * name of the data provider that supplied the manufacturer's schedule.
 */
export type ScheduleSource = 'baseline' | (string & {})

/** One schedule line for a vehicle configuration. Either interval may be absent. */
export interface MaintenanceItem {
  id: MaintenanceItemId
  configId: string
  task: string
  /** What the item is, the same across providers, such as "engine-oil". */
  kind?: string
  /** Absent for items stored before schedules had providers. */
  source?: ScheduleSource
  intervalMiles?: number
  intervalMonths?: number
  severeMiles?: number
  severeMonths?: number
}

export interface ServiceRecord {
  id: string
  vehicleId: VehicleId
  itemId?: MaintenanceItemId
  performedOn: IsoDate
  odometerMiles?: number
  costCents?: number
  shop?: string
  notes?: string
}

/** What a fill-up put in the car: fuel by the gallon, or charge by the kilowatt-hour. */
export type EnergyKind = 'fuel' | 'electric'

/**
 * A fill-up at the pump or a charging session. Its odometer reading counts as one of the car's
 * readings. Editable and deletable, and can be entered late, out of order.
 */
export interface FillUp {
  id: string
  vehicleId: VehicleId
  filledOn: IsoDate
  odometerMiles: number
  energy: EnergyKind
  /** Gallons of fuel or kWh of charge. */
  quantity: number
  /** The total paid; absent when free or not known. */
  costCents?: number
  /**
   * The tank was filled, or the battery charged to the owner's usual limit. Economy is measured
   * from one full fill-up to the next, adding up the partial ones between.
   */
  full: boolean
  /**
   * At least one fill-up before this one was not logged, so the distance since the last logged
   * one says nothing about economy.
   */
  missedPrevious: boolean
  station?: string
  notes?: string
}

/** What a warranty covers. Factory warranties usually come as several of these at once. */
export type WarrantyKind =
  'basic' | 'powertrain' | 'corrosion' | 'emissions' | 'hybrid-battery' | 'extended' | 'other'

/**
 * One warranty coverage on a car, as the owner typed it from the paperwork. It ends at its time
 * limit or its mileage limit, whichever comes first; it has at least one of the two.
 */
export interface Warranty {
  id: string
  vehicleId: VehicleId
  kind: WarrantyKind
  /** Who honours it: the manufacturer, or an extended-warranty company. */
  provider?: string
  /** When coverage started: the in-service date for a factory warranty. */
  startsOn: IsoDate
  /** Length from `startsOn`, in months. */
  months?: number
  /** The odometer reading at which coverage ends, such as 36,000. */
  endMiles?: number
  /** Contract or policy number, for a claim. */
  policyNumber?: string
  notes?: string
}

/**
 * What an attached file is. Receipts and photos belong to a logged service; the rest are the car's
 * own documents.
 */
export type AttachmentKind = 'receipt' | 'registration' | 'insurance' | 'other'

/** A photo or PDF the owner attached to a car, or to a service in its log. */
export interface Attachment {
  id: string
  vehicleId: VehicleId
  /** The service it belongs to; absent for the car's own documents. */
  serviceRecordId?: string
  kind: AttachmentKind
  /** The file's name, such as "IMG_2041.jpg" or "Insurance card.pdf". */
  name: string
  /** One of ATTACHMENT_TYPES. */
  contentType: string
  sizeBytes: number
  addedOn: IsoDate
}

/** A photo or file the owner just took or picked, still where the system put it. */
export interface PickedFile {
  uri: string
  name: string
  contentType: string
  sizeBytes: number
}

/**
 * - `offline`: the file is not on this phone yet and there is no connection to download it.
 * - `not-uploaded`: it was attached on another phone that has not uploaded it yet.
 * - `denied`: the owner has not let the app use the camera or photos.
 */
export type AttachmentErrorKind = 'offline' | 'not-uploaded' | 'denied' | 'unknown'

/** Why a file could not be picked or shown. Adapters translate their own errors into these. */
export class AttachmentError extends Error {
  constructor(
    readonly kind: AttachmentErrorKind,
    message: string = kind,
  ) {
    super(message)
    this.name = 'AttachmentError'
  }
}

/**
 * An NHTSA safety recall for a configuration's model year. It may not cover every car of that
 * year, and says nothing about whether this car has been fixed; NHTSA's VIN lookup says that.
 */
export interface Recall {
  id: string
  configId: string
  /** NHTSA campaign number, such as "23V123000". */
  campaign: string
  /** NHTSA's component, upper case, such as "ELECTRICAL SYSTEM: WIRING". */
  component?: string
  summary: string
  consequence?: string
  remedy?: string
  notes?: string
  reportedOn?: IsoDate
  /** NHTSA says not to drive the car until it is fixed. */
  parkIt: boolean
  /** NHTSA says to park outside and away from buildings until it is fixed (fire risk). */
  parkOutside: boolean
  /** The fix is a software update sent over the air. */
  overTheAir: boolean
}

/** Owner complaints filed with NHTSA about one component of a configuration's model year. */
export interface ComplaintSummary {
  id: string
  configId: string
  /** NHTSA's component, upper case, such as "ENGINE". */
  component: string
  complaints: number
  crashes: number
  fires: number
  injuries: number
  deaths: number
  latestFiledOn?: IsoDate
  /** Up to three of the newest complaints, newest first. */
  recent: { filedOn?: IsoDate; summary: string }[]
  /**
   * How many of these complaints happened at each mileage, in bands of `MILEAGE_BAND` miles from
   * `from`, lowest first. Only complaints whose owner gave a mileage count. Absent until NHTSA's
   * complaint files have been imported for the model year.
   */
  byMileage?: MileageBand[]
}

/** Complaints that happened between `from` and `from + MILEAGE_BAND` miles. */
export interface MileageBand {
  from: number
  complaints: number
}

/**
 * What a manufacturer communication to its dealers is:
 * - `bulletin`: a technical service bulletin, the repair instructions for a known problem.
 * - `warranty`: a warranty extension or special coverage, so the repair may be free.
 * - `campaign`: a service campaign, a fix the manufacturer offers that is not a safety recall.
 * - `software`: a software or over-the-air update.
 * - `emissions`: about emissions equipment, which has its own federal warranty.
 * - `other`: anything else, such as a letter to owners or dealers.
 */
export type BulletinKind = 'bulletin' | 'warranty' | 'campaign' | 'software' | 'emissions' | 'other'

/**
 * A manufacturer communication (a technical service bulletin, warranty extension or similar)
 * that the manufacturer filed with NHTSA for a configuration's model year. Like a recall it may
 * not cover every car of that year.
 */
export interface Bulletin {
  id: string
  configId: string
  /** NHTSA's number for it. */
  nhtsaId: number
  /** The manufacturer's own number, such as "19-047", which a dealer looks it up by. */
  documentId?: string
  kind: BulletinKind
  /** When the manufacturer sent it to dealers. */
  issuedOn?: IsoDate
  /** NHTSA's top-level components, upper case, such as "ENGINE". */
  components: string[]
  /** The manufacturer's own name for the part of the car, such as "Engine / Cooling". */
  system?: string
  summary: string
}

/** What NHTSA knows about a configuration's model year. */
export interface SafetyReport {
  /** When NHTSA was last asked about recalls. Absent until the first check after a car is added. */
  recallsCheckedAt?: string
  /** When NHTSA was last asked about complaints. */
  complaintsCheckedAt?: string
  recalls: Recall[]
  complaints: ComplaintSummary[]
  /** When NHTSA's manufacturer communications were last imported for this model year. */
  bulletinsCheckedAt?: string
  /** Absent where bulletins are not stored, such as in older tests. */
  bulletins?: Bulletin[]
}

/** The signed-in person, as far as the app needs to know. */
export interface AuthUser {
  id: string
  email?: string
}

export type AuthErrorKind =
  'invalid-email' | 'invalid-code' | 'rate-limited' | 'network' | 'unknown'

/** A sign-in failure the screen can explain. Adapters translate their own errors into these. */
export class AuthError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message: string = kind,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

/** One owner complaint filed with NHTSA, as the server keeps it for the assistant. */
export interface Complaint {
  /** NHTSA's ODI number, which identifies the complaint. */
  odiNumber: number
  /** NHTSA's components, upper case, such as "ENGINE". */
  components: string[]
  summary: string
  filedOn?: IsoDate
  /** The odometer when it happened, as the owner told NHTSA. */
  miles?: number
  crash: boolean
  fire: boolean
  injuries: number
  deaths: number
}

/** What a stored fact an answer cites is. */
export type AnswerSourceKind =
  'car' | 'schedule' | 'service' | 'recall' | 'bulletin' | 'complaints' | 'complaint'

/** A stored fact about the owner's car that an assistant answer was drawn from. */
export interface AnswerSource {
  kind: AnswerSourceKind
  /** Identifies the fact within its kind, such as a recall's campaign number. */
  id: string
  /** A few words for the chip under the answer, such as "Recall 23V123000". */
  label: string
}

export type AssistantErrorKind =
  | 'offline'
  | 'signed-out'
  | 'not-found'
  | 'rate-limited'
  | 'unavailable'
  | 'declined'
  /** The owner has not allowed sharing with Anthropic; nothing was sent. */
  | 'not-allowed'
  | 'unknown'

/** Why a question got no answer. Adapters translate their own errors into these. */
export class AssistantError extends Error {
  constructor(
    readonly kind: AssistantErrorKind,
    message: string = kind,
  ) {
    super(message)
    this.name = 'AssistantError'
  }
}

/** One line of a shop's quote or recommendation list, as the owner typed it or a photo read it. */
export interface QuoteLine {
  /** The work as the shop wrote it, such as "Front brake pads & rotors". */
  text: string
  /** The line's price, when the quote shows one. */
  priceCents?: number
}

/** A photo of a shop's quote, as the phone's camera or photo library returned it. */
export interface QuotePhoto {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** The image file, base64-encoded, without a `data:` prefix. */
  base64: string
}
