import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  AssistantError,
  type AssistantErrorKind,
  type Bulletin,
  type MaintenanceItem,
  type OdometerReading,
  type QuotePhoto,
  type Recall,
  type ServiceRecord,
  type Vehicle,
} from '../../domain/types'
import { cancellation } from '../../lib/cancel'
import { formatCents } from '../../lib/format'
import { currentBulletins } from '../../lib/knownIssues'
import { MAX_QUOTE_PHOTO_BASE64 } from '../../schemas/quote'
import type {
  Clock,
  DevicePreferencesRepo,
  OdometerRepo,
  PhotoPicker,
  PriceEstimator,
  QuoteReader,
  SafetyRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  Unsubscribe,
  VehicleRepo,
} from '../../ports'
import { checkQuote, type QuoteCheck } from '../../quotes/checkQuote'
import { comparePrices, estimateRequestFor, type FairPrices } from '../../quotes/fairPrice'
import { formatQuoteText, parseQuoteText } from '../../quotes/parseQuote'
import { weighRepair, worthWeighing, type RepairWeighing } from '../../quotes/repairOrReplace'
import { formatCarValue, parseCarValue } from '../../schemas/carValue'
import { ZIP_PATTERN } from '../../schemas/priceEstimate'

/**
 * - `editing`: the owner is typing the quote's lines, or correcting what a photo read.
 * - `reading`: a photo is being read on the server.
 * - `checking`: the lines are being checked against the car's data.
 * - `checked`: the result is showing.
 */
export type QuoteStatus = 'editing' | 'reading' | 'checking' | 'checked'

/**
 * Fair prices for a checked quote, which the model estimates from labor times and local rates:
 * - `estimating`: the estimate is being made on the server.
 * - `ready`: each line's usual range, set against the shop's prices.
 * - `failed`: why it could not be made, in words.
 */
export type FairPricesState =
  | { status: 'estimating' }
  | { status: 'ready'; fair: FairPrices }
  | { status: 'failed'; error: string }

export interface QuoteCheckState {
  status: QuoteStatus
  /** "2021 Toyota RAV4", under the screen's title. */
  carTitle: string
  /**
   * True until the car has synced back with its configuration, when there is no schedule to check
   * against yet.
   */
  unmatched: boolean
  /** The quote's lines as text, one per line, each with its price if it has one. */
  draft: string
  /** True when the draft has a line to check and nothing else is running. */
  canCheck: boolean
  result?: QuoteCheck | undefined
  /**
   * Whether to pay for the quote or replace the car, weighed against what the owner thinks it is
   * worth. Present for a checked quote that is big for any car or for this one.
   */
  weighing?: RepairWeighing | undefined
  /** What the owner typed for the car's value, in dollars. Starts as the saved value. */
  valueDraft: string
  /** Why the value could not be saved. */
  valueError?: string | undefined
  /** What the owner typed for the ZIP code fair prices are estimated around. Starts as the saved one. */
  zipDraft: string
  /** True when a checked quote has a line worth pricing, the ZIP is valid and nothing is running. */
  canEstimate: boolean
  /** Absent until the owner asks for fair prices, and again once the quote is edited. */
  prices?: FairPricesState | undefined
  /** Why the last photo or check failed. Cleared by the next one. */
  error?: string | undefined
}

export interface QuoteCheckActions {
  start: () => void
  setDraft: (text: string) => void
  /** Photographs the quote with the camera, reads it and checks it. */
  takePhoto: () => Promise<void>
  /** Picks a photo of the quote from the library, reads it and checks it. */
  choosePhoto: () => Promise<void>
  /** Stops reading a photo, keeping the draft as it was. */
  cancelReading: () => void
  /** Checks the draft's lines. */
  check: () => Promise<void>
  /** Goes back to the lines to correct them, keeping them. */
  edit: () => void
  /** Clears the quote to check another. */
  startOver: () => void
  /** A question for Ask about one checked line, by its index. */
  questionFor: (index: number) => string | undefined
  /** Keeps up to five digits of what was typed, and drops prices estimated around another ZIP. */
  setZip: (text: string) => void
  /** Estimates the checked quote's fair prices around the ZIP, and saves the ZIP for next time. */
  estimatePrices: () => Promise<void>
  setValueDraft: (text: string) => void
  /** Saves the car's value as typed, or forgets it when the field is empty, and weighs again. */
  saveValue: () => Promise<void>
  dispose: () => void
}

export type QuoteCheckModel = StoreApi<QuoteCheckState & QuoteCheckActions>

export interface QuoteCheckDeps {
  vehicle: Pick<
    Vehicle,
    | 'id'
    | 'year'
    | 'make'
    | 'model'
    | 'trim'
    | 'engine'
    | 'severeDuty'
    | 'configId'
    | 'valueCents'
    | 'valuedOn'
  >
  vehicles: Pick<VehicleRepo, 'setValue'>
  schedule: ScheduleRepo
  records: ServiceRecordRepo
  odometer: OdometerRepo
  safety: SafetyRepo
  clock: Clock
  photos: PhotoPicker
  reader: QuoteReader
  estimator: PriceEstimator
  preferences: DevicePreferencesRepo
}

const READ_ERRORS: Record<AssistantErrorKind, string> = {
  offline: "You're offline. Reading a photo needs a connection, but you can type the lines.",
  'signed-out': 'Sign in again to read photos.',
  'not-found': 'Something went wrong. Try again.',
  'rate-limited': "You've used the assistant a lot today. Type the lines, or try tomorrow.",
  unavailable: "Reading photos isn't available right now. Type the lines instead.",
  declined: "That photo couldn't be read. Try another, or type the lines.",
  'not-allowed':
    'Reading photos is turned off in Account. Turn on sharing with Anthropic, or type the lines.',
  unknown: 'Something went wrong reading the photo. Try again, or type the lines.',
}

const ESTIMATE_ERRORS: Record<AssistantErrorKind, string> = {
  offline: "You're offline. Estimating fair prices needs a connection.",
  'signed-out': 'Sign in again to estimate fair prices.',
  'not-found': 'Something went wrong. Try again.',
  'rate-limited': "You've used the assistant a lot today. Try again tomorrow.",
  unavailable: "Estimating fair prices isn't available right now.",
  declined: "These lines couldn't be priced. Try rewording them.",
  'not-allowed':
    'Fair prices are turned off in Account. Turn on sharing with Anthropic to use them.',
  unknown: 'Something went wrong estimating fair prices. Try again.',
}

const canCheck = (status: QuoteStatus, unmatched: boolean, draft: string) =>
  status === 'editing' && !unmatched && parseQuoteText(draft).length > 0

/**
 * Screen model for checking a shop's quote: the owner photographs or types the shop's list, and
 * each line is checked against the car's schedule, service log and recalls.
 */
export const createQuoteCheckModel = (deps: QuoteCheckDeps): QuoteCheckModel => {
  const { vehicle } = deps
  const unmatched = vehicle.configId === undefined
  let recalls: Recall[] = []
  let bulletins: Bulletin[] = []
  let stopSafety: Unsubscribe | undefined
  let reading: { cancel: () => void } | undefined
  let estimating: { cancel: () => void } | undefined
  let stopPreferences: Unsubscribe | undefined
  // The ZIP saved on this phone, offered until the owner types another.
  let zipTouched = false
  // True while the camera or photo picker is open, so a second tap does not open another.
  let picking = false
  let disposed = false
  // The car's value as last saved here, and the data the last check used, to weigh again.
  let value = { valueCents: vehicle.valueCents, valuedOn: vehicle.valuedOn }
  let checkedWith:
    { items: MaintenanceItem[]; records: ServiceRecord[]; readings: OdometerReading[] } | undefined

  return createStore<QuoteCheckState & QuoteCheckActions>()((set, get) => {
    const stopEstimating = () => {
      estimating?.cancel()
      estimating = undefined
    }

    const editing = (patch: Partial<QuoteCheckState> = {}) => {
      const draft = patch.draft ?? get().draft
      stopEstimating()
      set({
        status: 'editing',
        result: undefined,
        weighing: undefined,
        prices: undefined,
        canEstimate: false,
        ...patch,
        canCheck: canCheck('editing', unmatched, draft),
      })
    }

    const canEstimate = (
      result: QuoteCheck | undefined,
      zip: string,
      prices: FairPricesState | undefined,
    ) =>
      result !== undefined &&
      prices?.status !== 'estimating' &&
      ZIP_PATTERN.test(zip) &&
      estimateRequestFor(vehicle, zip, result) !== undefined

    const estimatePrices = async () => {
      const { status, result, zipDraft: zip, prices } = get()
      if (status !== 'checked' || !result || !canEstimate(result, zip, prices)) return
      const request = estimateRequestFor(vehicle, zip, result)
      if (!request) return
      const { signal, cancel } = cancellation()
      estimating = { cancel }
      set({ prices: { status: 'estimating' }, canEstimate: false })
      try {
        const estimate = await deps.estimator.estimate(request, signal)
        if (signal.aborted) return
        estimating = undefined
        const ready: FairPricesState = {
          status: 'ready',
          fair: comparePrices(result, estimate, zip),
        }
        set({ prices: ready, canEstimate: canEstimate(result, zip, ready) })
        // Only a convenience for next time, so a failed save changes nothing on screen.
        deps.preferences.update({ zip }).catch(() => {})
      } catch (e) {
        if (signal.aborted) return
        estimating = undefined
        const kind = e instanceof AssistantError ? e.kind : 'unknown'
        const failed: FairPricesState = { status: 'failed', error: ESTIMATE_ERRORS[kind] }
        set({ prices: failed, canEstimate: canEstimate(result, zip, failed) })
      }
    }

    // `keep` weighs a quote already being weighed even if a new value makes it small, so the card
    // the owner is typing in does not vanish under them.
    const weigh = (result: QuoteCheck | undefined, keep = false): RepairWeighing | undefined => {
      if (!result || !checkedWith) return undefined
      const quoteCents = result.lines.reduce((sum, l) => sum + (l.priceCents ?? 0), 0)
      if (!keep && !worthWeighing(quoteCents, value.valueCents)) return undefined
      return weighRepair({
        vehicle: { ...vehicle, ...value },
        ...checkedWith,
        quoteCents,
        coveredItemIds: result.coveredItemIds,
        today: deps.clock.today(),
      })
    }

    const check = async () => {
      if (!canCheck(get().status, unmatched, get().draft) || !vehicle.configId) return
      const lines = parseQuoteText(get().draft)
      set({ status: 'checking', canCheck: false, error: undefined })
      try {
        const [items, records, readings] = await Promise.all([
          deps.schedule.itemsForVehicle(vehicle),
          deps.records.listForVehicle(vehicle.id),
          deps.odometer.listForVehicle(vehicle.id),
        ])
        if (disposed) return
        const result = checkQuote({
          vehicle,
          items,
          records,
          readings,
          recalls,
          bulletins,
          lines,
          today: deps.clock.today(),
        })
        checkedWith = { items, records, readings }
        set({
          status: 'checked',
          result,
          weighing: weigh(result),
          valueError: undefined,
          canEstimate: canEstimate(result, get().zipDraft, undefined),
        })
      } catch (e) {
        if (disposed) return
        editing({ error: e instanceof Error ? e.message : 'Could not check the quote' })
      }
    }

    const readPhoto = async (pick: () => Promise<QuotePhoto | undefined>) => {
      if (picking || get().status === 'reading' || get().status === 'checking' || unmatched) return
      let photo: QuotePhoto | undefined
      picking = true
      try {
        photo = await pick()
      } catch {
        editing({
          error: "Couldn't open the photo. Check that the app may use your camera and photos.",
        })
        return
      } finally {
        picking = false
      }
      if (!photo || disposed) return
      if (photo.base64.length > MAX_QUOTE_PHOTO_BASE64) {
        editing({
          error: 'That photo is too large to read. Try a closer photo, or type the lines.',
        })
        return
      }
      const { signal, cancel } = cancellation()
      reading = { cancel }
      set({ status: 'reading', canCheck: false, error: undefined, result: undefined })
      try {
        const lines = await deps.reader.read(photo, signal)
        if (signal.aborted) return
        reading = undefined
        if (lines.length === 0) {
          editing({
            error:
              "Couldn't find any work listed in that photo. Try a closer photo, or type the lines.",
          })
          return
        }
        editing({ draft: formatQuoteText(lines) })
        await check()
      } catch (e) {
        if (signal.aborted) return
        reading = undefined
        const kind = e instanceof AssistantError ? e.kind : 'unknown'
        editing({ error: READ_ERRORS[kind] })
      }
    }

    return {
      status: 'editing',
      carTitle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      unmatched,
      draft: '',
      canCheck: false,
      valueDraft: vehicle.valueCents === undefined ? '' : formatCarValue(vehicle.valueCents),
      zipDraft: '',
      canEstimate: false,

      start: () => {
        if (stopSafety || !vehicle.configId) return
        disposed = false
        stopPreferences = deps.preferences.watch(({ zip }) => {
          if (zipTouched || zip === null || zip === get().zipDraft) return
          // Another car's quote saved a new ZIP: prices for the old one no longer match the field.
          stopEstimating()
          set({
            zipDraft: zip,
            prices: undefined,
            canEstimate: canEstimate(get().result, zip, undefined),
          })
        })
        stopSafety = deps.safety.watchForConfig(vehicle.configId, (report) => {
          recalls = report.recalls
          bulletins = currentBulletins(report.bulletins ?? [])
        })
      },

      setDraft: (draft) => {
        if (get().status !== 'editing') return
        set({ draft, canCheck: canCheck('editing', unmatched, draft) })
      },

      takePhoto: () => readPhoto(() => deps.photos.take()),
      choosePhoto: () => readPhoto(() => deps.photos.choose()),

      cancelReading: () => {
        if (get().status !== 'reading') return
        reading?.cancel()
        reading = undefined
        editing()
      },

      check,

      edit: () => {
        if (get().status === 'checked') editing()
      },

      startOver: () => {
        reading?.cancel()
        reading = undefined
        editing({ draft: '', error: undefined })
      },

      questionFor: (index) => {
        const line = get().result?.lines.find((l) => l.index === index)
        if (!line) return undefined
        const price = line.priceCents === undefined ? '' : ` for ${formatCents(line.priceCents)}`
        return `A shop recommended "${line.text}"${price}. Does my car need it now?`
      },

      setZip: (text) => {
        const zipDraft = text.replace(/\D/g, '').slice(0, 5)
        zipTouched = true
        if (zipDraft === get().zipDraft) return
        stopEstimating()
        set({
          zipDraft,
          prices: undefined,
          canEstimate: canEstimate(get().result, zipDraft, undefined),
        })
      },

      estimatePrices,

      setValueDraft: (valueDraft) => set({ valueDraft, valueError: undefined }),

      saveValue: async () => {
        const parsed = parseCarValue(get().valueDraft)
        if (!parsed.ok) {
          set({ valueError: parsed.error })
          return
        }
        const today = deps.clock.today()
        const next =
          parsed.cents === undefined
            ? { valueCents: undefined, valuedOn: undefined }
            : { valueCents: parsed.cents, valuedOn: today }
        try {
          await deps.vehicles.setValue(
            vehicle.id,
            parsed.cents === undefined ? undefined : { cents: parsed.cents, valuedOn: today },
          )
        } catch (e) {
          if (!disposed)
            set({ valueError: e instanceof Error ? e.message : 'Could not save the value' })
          return
        }
        if (disposed) return
        value = next
        set({
          valueDraft: parsed.cents === undefined ? '' : formatCarValue(parsed.cents),
          valueError: undefined,
          weighing: weigh(get().result, get().weighing !== undefined),
        })
      },

      dispose: () => {
        disposed = true
        reading?.cancel()
        reading = undefined
        stopEstimating()
        stopSafety?.()
        stopSafety = undefined
        stopPreferences?.()
        stopPreferences = undefined
      },
    }
  })
}
