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
}

/** What NHTSA knows about a configuration's model year. */
export interface SafetyReport {
  /** When NHTSA was last asked about recalls. Absent until the first check after a car is added. */
  recallsCheckedAt?: string
  /** When NHTSA was last asked about complaints. */
  complaintsCheckedAt?: string
  recalls: Recall[]
  complaints: ComplaintSummary[]
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
  crash: boolean
  fire: boolean
  injuries: number
  deaths: number
}

/** What a stored fact an answer cites is. */
export type AnswerSourceKind =
  'car' | 'schedule' | 'service' | 'recall' | 'complaints' | 'complaint'

/** A stored fact about the owner's car that an assistant answer was drawn from. */
export interface AnswerSource {
  kind: AnswerSourceKind
  /** Identifies the fact within its kind, such as a recall's campaign number. */
  id: string
  /** A few words for the chip under the answer, such as "Recall 23V123000". */
  label: string
}

export type AssistantErrorKind =
  'offline' | 'signed-out' | 'not-found' | 'rate-limited' | 'unavailable' | 'declined' | 'unknown'

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
