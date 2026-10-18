import type { IsoDate } from '../lib/date'
import type {
  AnswerSource,
  Attachment,
  AuthUser,
  DecodedVin,
  FillUp,
  MaintenanceItem,
  OdometerReading,
  PickedFile,
  QuoteLine,
  QuotePhoto,
  Renewal,
  SafetyReport,
  ServiceRecord,
  TireSet,
  Vehicle,
  VehicleId,
  Warranty,
} from '../domain/types'
import type { CareReport } from '../features/care-report/report'

/**
 * Ports are the only way core reaches storage, the network or the clock. The app supplies
 * SQLite/PowerSync and Supabase adapters; tests use the in-memory ones in `@car/core/testing`.
 */
export type Unsubscribe = () => void

export interface VehicleRepo {
  get(id: VehicleId): Promise<Vehicle | undefined>
  /** Calls `onChange` with the owner's vehicles now and after every change. */
  watchOwned(ownerId: string, onChange: (vehicles: Vehicle[]) => void): Unsubscribe
  /**
   * Saves a new car for `ownerId`, with its first odometer reading if given, in one write so the
   * reading never uploads without its car.
   */
  add(ownerId: string, vehicle: Vehicle, firstReading?: OdometerReading): Promise<void>
  /** Puts the car on the severe maintenance schedule, or back on the normal one. */
  setSevereDuty(id: VehicleId, severeDuty: boolean): Promise<void>
}

/** Looks up what a VIN is. Needs a connection. */
export interface VinDecoder {
  /** Resolves with the car, or throws VinDecodeError. `vin` is already valid and upper case. */
  decode(vin: string): Promise<DecodedVin>
}

/** Whether this device's copy of an owner's data has finished its first download. */
export interface SyncStatus {
  /**
   * Calls `onSynced` once a full sync of `ownerId`'s data has completed (immediately if it already
   * has). Another account's earlier sync on the same phone does not count.
   */
  onFirstSync(ownerId: string, onSynced: () => void): Unsubscribe
}

/** Passwordless email sign-in: the owner types their email, then the code they were sent. */
export interface AuthPort {
  /** Calls `onChange` with the current user (or null) now and on every sign-in or sign-out. */
  watchUser(onChange: (user: AuthUser | null) => void): Unsubscribe
  /** Emails a one-time code, creating the account if needed. Throws AuthError. */
  sendCode(email: string): Promise<void>
  /** Signs in with the emailed code. Throws AuthError. */
  verifyCode(email: string, code: string): Promise<void>
  /** Always ends signed out on this device, even offline; may still throw if the server was not told. */
  signOut(): Promise<void>
}

/** The owner's account itself, as opposed to signing in and out of it. */
export interface AccountPort {
  /**
   * Permanently deletes the signed-in owner's account and everything stored for it on the
   * server, then signs this phone out and erases its copy of their data, including changes not
   * uploaded yet. Needs a connection. Throws AuthError, leaving the account as it was, if the
   * server did not delete it.
   */
  deleteAccount(): Promise<void>
}

export interface ServiceRecordRepo {
  listForVehicle(vehicleId: VehicleId): Promise<ServiceRecord[]>
  /** Calls `onChange` with the full list now and after every change, like a live query. */
  watchForVehicle(vehicleId: VehicleId, onChange: (records: ServiceRecord[]) => void): Unsubscribe
  add(record: ServiceRecord): Promise<void>
}

export interface OdometerRepo {
  listForVehicle(vehicleId: VehicleId): Promise<OdometerReading[]>
  /** Calls `onChange` with the car's readings now and after every change, like a live query. */
  watchForVehicle(
    vehicleId: VehicleId,
    onChange: (readings: OdometerReading[]) => void,
  ): Unsubscribe
  add(reading: OdometerReading): Promise<void>
}

/** The warranties the owner has entered for their cars. Editable, unlike the service history. */
export interface WarrantyRepo {
  listForVehicle(vehicleId: VehicleId): Promise<Warranty[]>
  /** Calls `onChange` with the car's warranties now and after every change, like a live query. */
  watchForVehicle(vehicleId: VehicleId, onChange: (warranties: Warranty[]) => void): Unsubscribe
  /** Adds the warranty, or replaces the one with the same id. */
  save(warranty: Warranty): Promise<void>
  remove(id: string): Promise<void>
}

/** The car's fill-ups and charging sessions. Editable, unlike the service history. */
export interface FillUpRepo {
  /** The car's fill-ups, newest first. */
  listForVehicle(vehicleId: VehicleId): Promise<FillUp[]>
  /** Calls `onChange` with the car's fill-ups, newest first, now and after every change. */
  watchForVehicle(vehicleId: VehicleId, onChange: (fillUps: FillUp[]) => void): Unsubscribe
  /** Adds the fill-up, or replaces the one with the same id. */
  save(fillUp: FillUp): Promise<void>
  remove(id: string): Promise<void>
}

/** The tire sets the owner tracks for their cars. Editable, unlike the service history. */
export interface TireSetRepo {
  listForVehicle(vehicleId: VehicleId): Promise<TireSet[]>
  /** Calls `onChange` with the car's tire sets now and after every change, like a live query. */
  watchForVehicle(vehicleId: VehicleId, onChange: (sets: TireSet[]) => void): Unsubscribe
  /**
   * Adds each set, or replaces the one with the same id, in one write: swapping sets saves both,
   * and no one ever sees two sets on the car.
   */
  save(...sets: TireSet[]): Promise<void>
  remove(id: string): Promise<void>
}

/** The car's registration, inspection and insurance dates. Editable. */
export interface RenewalRepo {
  /** The car's renewals, soonest first. */
  listForVehicle(vehicleId: VehicleId): Promise<Renewal[]>
  /** Calls `onChange` with the car's renewals, soonest first, now and after every change. */
  watchForVehicle(vehicleId: VehicleId, onChange: (renewals: Renewal[]) => void): Unsubscribe
  /** Adds the renewal, or replaces the one with the same id. */
  save(renewal: Renewal): Promise<void>
  remove(id: string): Promise<void>
}

/** Turns a care report into a file the owner can send, such as a PDF in the share sheet. */
export interface CareReportExporter {
  /** Resolves once the owner has been offered the file, whether or not they sent it. */
  share(report: CareReport): Promise<void>
}

/**
 * Photos and PDFs attached to cars and services. The details sync like any other row; each file
 * uploads after it is attached and downloads to another phone the first time it is opened there.
 */
export interface AttachmentRepo {
  /** Everything attached to the car or its services, newest first. */
  listForVehicle(vehicleId: VehicleId): Promise<Attachment[]>
  /**
   * Calls `onChange` with everything attached to the car or its services, now and after every
   * change.
   */
  watchForVehicle(vehicleId: VehicleId, onChange: (attachments: Attachment[]) => void): Unsubscribe
  /** Keeps a copy of `file` on this phone and saves the attachment; works offline. */
  add(attachment: Attachment, file: PickedFile): Promise<void>
  /**
   * Resolves with a local URI of the file, downloading it first if this phone has no copy. Rejects
   * with AttachmentError.
   */
  open(attachment: Attachment): Promise<string>
  /** Deletes the attachment and its file, on this phone and on the server. */
  remove(attachment: Attachment): Promise<void>
}

/** Shows a file full screen in the system's viewer (Quick Look on iOS). */
export interface FilePreview {
  /**
   * Resolves once the viewer is showing. `file` gives the viewer its title and type, since the
   * copy on the phone is named by attachment id.
   */
  show(uri: string, file: { name: string; contentType: string }): Promise<void>
}

/** Where the owner gets a file from. */
export type FileSource = 'camera' | 'photos' | 'files'

/** The system camera, photo library and file picker. */
export interface FilePicker {
  /**
   * Resolves with the photo or file, or undefined if the owner cancelled. Rejects with
   * AttachmentError('denied') when the owner has refused access.
   */
  pick(source: FileSource): Promise<PickedFile | undefined>
}

/** Files moving between the app and the rest of the phone, for exporting and importing data. */
export interface DataFiles {
  /** The bytes of a file on this phone, by a URI such as AttachmentRepo.open resolves with. */
  read(uri: string): Promise<Uint8Array>
  /**
   * Saves `bytes` as a file called `name` and offers it in the share sheet (Save to Files, AirDrop,
   * Mail). Resolves once the sheet closes, whether or not the owner sent it anywhere.
   */
  share(bytes: Uint8Array, name: string): Promise<void>
  /** Opens the file picker for a zip; resolves with its bytes, or undefined if cancelled. */
  pickArchive(): Promise<Uint8Array | undefined>
  /** Writes `bytes` to a temporary file that AttachmentRepo.add can keep a copy of. */
  stage(bytes: Uint8Array, file: { name: string; contentType: string }): Promise<PickedFile>
}

export interface ScheduleRepo {
  itemsForConfig(configId: string): Promise<MaintenanceItem[]>
}

/** Recalls and complaints for a configuration, which the server fetches from NHTSA. */
export interface SafetyRepo {
  /** Calls `onChange` with the configuration's report now and after every change. */
  watchForConfig(configId: string, onChange: (report: SafetyReport) => void): Unsubscribe
}

export interface Clock {
  today(): IsoDate
}

export interface IdGenerator {
  next(): string
}

/** Whether the owner lets this app show notifications. Only the OS can change a denial. */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined'

/** A notification scheduled on this device for a calendar date, at an hour of the local day. */
export interface LocalNotification {
  /** Stable for the same reminder, so rescheduling replaces rather than duplicates it. */
  id: string
  date: IsoDate
  /** Hour of the day on the phone's own clock, 0 to 23. */
  hour: number
  title: string
  body: string
  /** The car it is about, so tapping it can open that car. */
  vehicleId: VehicleId
}

/** Notifications scheduled on this device. Works offline; nothing is sent from a server. */
export interface Notifier {
  permission(): Promise<NotificationPermission>
  /** Shows the system prompt if the owner has not answered it yet; resolves with the outcome. */
  requestPermission(): Promise<NotificationPermission>
  /** The reminders this app has scheduled and that have not been shown yet. */
  scheduled(): Promise<LocalNotification[]>
  /** Schedules a notification, replacing any with the same id. */
  schedule(notification: LocalNotification): Promise<void>
  cancel(id: string): Promise<void>
  /** Opens this app's page in the system settings, where a denial can be undone. */
  openSettings(): Promise<void>
  /**
   * Calls `onOpen` with the car a reminder is about when the owner taps it, including the tap
   * that launched the app.
   */
  watchOpened(onOpen: (vehicleId: VehicleId) => void): Unsubscribe
}

/** The owner's reminder choices, kept on this device. */
export interface ReminderSettings {
  enabled: boolean
}

export interface ReminderSettingsRepo {
  /** Calls `onChange` with the settings now and after every change. */
  watch(onChange: (settings: ReminderSettings) => void): Unsubscribe
  set(settings: ReminderSettings): Promise<void>
}

/** Choices kept on this device that belong to the person holding it, not to an account. */
export interface DevicePreferences {
  /** The first-run introduction has been seen or skipped on this phone. */
  onboarded: boolean
  /**
   * The account id of the owner who allowed Ask and the quote checker to send their question,
   * their car's records or a photo of a quote to Anthropic, which runs the model that answers
   * (App Store guideline 5.1.2(i)). Null until someone says yes. Holding the id means someone
   * else signing in on this phone is asked again.
   */
  aiSharingOwner: string | null
}

export interface DevicePreferencesRepo {
  /** Calls `onChange` with the preferences once they are read, and after every change. */
  watch(onChange: (preferences: DevicePreferences) => void): Unsubscribe
  /** Saves the given preferences, keeping the others. */
  update(change: Partial<DevicePreferences>): Promise<void>
}

/** The part of the platform's AbortSignal that core relies on; core has no DOM types. */
export interface CancelSignal {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void): void
  removeEventListener(type: 'abort', listener: () => void): void
}

/** One question to the assistant about one of the owner's cars. */
export interface AskRequest {
  vehicleId: VehicleId
  /** Continues an earlier conversation about the same car; absent to start a new one. */
  conversationId?: string
  question: string
}

/** What arrives while an answer streams in. */
export type AnswerEvent =
  /** The conversation this question belongs to, sent first. */
  | { type: 'conversation'; id: string }
  /** The next piece of the answer's text. */
  | { type: 'text'; text: string }
  /** A stored fact the answer has just cited. */
  | { type: 'source'; source: AnswerSource }
  /**
   * Forget the answer so far: the model declined partway and another model is answering from
   * the start.
   */
  | { type: 'reset' }

/** The AI assistant, answering from what is stored about the owner's car. Needs a connection. */
export interface Assistant {
  /**
   * Streams the answer to `onEvent` and resolves once it is complete. Rejects with
   * AssistantError. Once `signal` aborts it stops calling `onEvent` and may settle either way.
   */
  ask(
    request: AskRequest,
    onEvent: (event: AnswerEvent) => void,
    signal?: CancelSignal,
  ): Promise<void>
}

/** One turn of a conversation as the model sees it. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

/** A stored fact handed to the model as a citable document. */
export interface ModelDocument {
  /** Short, shown to the model; the model can cite the text but not the title. */
  title: string
  text: string
}

export interface ModelRequest {
  system: string
  /** Facts the model may cite, by their index in this list. */
  documents: ModelDocument[]
  /** The conversation so far, ending with the owner's question. */
  turns: ChatTurn[]
}

export type ModelEvent =
  | { type: 'text'; text: string }
  /** The text since the previous event is drawn from `documents[documentIndex]`. */
  | { type: 'citation'; documentIndex: number }
  /** The model declined partway and a fallback model starts the answer again. */
  | { type: 'reset' }

/**
 * - `end`: the model finished its answer.
 * - `max-tokens`: the answer was cut off at the length limit.
 * - `declined`: the model's safety checks declined to answer.
 */
export type ModelStopReason = 'end' | 'max-tokens' | 'declined'

/** A language model that answers from documents with citations. Runs on the server. */
export interface LanguageModel {
  /** Streams the answer to `onEvent`. Throws AssistantError for failures the owner should see. */
  stream(
    request: ModelRequest,
    onEvent: (event: ModelEvent) => void,
    signal?: CancelSignal,
  ): Promise<ModelStopReason>
}

/** Reads the lines of a shop's quote from a photo, on the server. Needs a connection. */
export interface QuoteReader {
  /**
   * Resolves with the quote's lines in order, empty when the photo shows no quote. Rejects with
   * AssistantError, since it shares the assistant's service and daily limit.
   */
  read(photo: QuotePhoto, signal?: CancelSignal): Promise<QuoteLine[]>
}

/** Reads the miles from a photo of the car's odometer, on the server. Needs a connection. */
export interface OdometerReader {
  /**
   * Resolves with the whole miles the odometer shows, or undefined when the photo shows no
   * odometer it can read. Rejects with AssistantError, since it shares the assistant's service and
   * daily limit.
   */
  read(photo: QuotePhoto, signal?: CancelSignal): Promise<number | undefined>
}

/** The phone's camera and photo library. */
export interface PhotoPicker {
  /** Opens the camera; resolves with the photo, or undefined if the owner cancelled. */
  take(): Promise<QuotePhoto | undefined>
  /** Opens the photo library; resolves with the photo, or undefined if the owner cancelled. */
  choose(): Promise<QuotePhoto | undefined>
}
