import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  AssistantError,
  type AssistantErrorKind,
  type QuotePhoto,
  type Recall,
  type Vehicle,
} from '../../domain/types'
import { cancellation } from '../../lib/cancel'
import { formatCents } from '../../lib/format'
import { MAX_QUOTE_PHOTO_BASE64 } from '../../schemas/quote'
import type {
  Clock,
  OdometerRepo,
  PhotoPicker,
  QuoteReader,
  SafetyRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  Unsubscribe,
} from '../../ports'
import { checkQuote, type QuoteCheck } from '../../quotes/checkQuote'
import { formatQuoteText, parseQuoteText } from '../../quotes/parseQuote'

/**
 * - `editing`: the owner is typing the quote's lines, or correcting what a photo read.
 * - `reading`: a photo is being read on the server.
 * - `checking`: the lines are being checked against the car's data.
 * - `checked`: the result is showing.
 */
export type QuoteStatus = 'editing' | 'reading' | 'checking' | 'checked'

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
  dispose: () => void
}

export type QuoteCheckModel = StoreApi<QuoteCheckState & QuoteCheckActions>

export interface QuoteCheckDeps {
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'severeDuty' | 'configId'>
  schedule: ScheduleRepo
  records: ServiceRecordRepo
  odometer: OdometerRepo
  safety: SafetyRepo
  clock: Clock
  photos: PhotoPicker
  reader: QuoteReader
}

const READ_ERRORS: Record<AssistantErrorKind, string> = {
  offline: "You're offline. Reading a photo needs a connection, but you can type the lines.",
  'signed-out': 'Sign in again to read photos.',
  'not-found': 'Something went wrong. Try again.',
  'rate-limited': "You've used the assistant a lot today. Type the lines, or try tomorrow.",
  unavailable: "Reading photos isn't available right now. Type the lines instead.",
  declined: "That photo couldn't be read. Try another, or type the lines.",
  unknown: 'Something went wrong reading the photo. Try again, or type the lines.',
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
  let stopSafety: Unsubscribe | undefined
  let reading: { cancel: () => void } | undefined
  // True while the camera or photo picker is open, so a second tap does not open another.
  let picking = false
  let disposed = false

  return createStore<QuoteCheckState & QuoteCheckActions>()((set, get) => {
    const editing = (patch: Partial<QuoteCheckState> = {}) => {
      const draft = patch.draft ?? get().draft
      set({
        status: 'editing',
        result: undefined,
        ...patch,
        canCheck: canCheck('editing', unmatched, draft),
      })
    }

    const check = async () => {
      if (!canCheck(get().status, unmatched, get().draft) || !vehicle.configId) return
      const lines = parseQuoteText(get().draft)
      set({ status: 'checking', canCheck: false, error: undefined })
      try {
        const [items, records, readings] = await Promise.all([
          deps.schedule.itemsForConfig(vehicle.configId),
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
          lines,
          today: deps.clock.today(),
        })
        set({ status: 'checked', result })
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

      start: () => {
        if (stopSafety || !vehicle.configId) return
        disposed = false
        stopSafety = deps.safety.watchForConfig(vehicle.configId, (report) => {
          recalls = report.recalls
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

      dispose: () => {
        disposed = true
        reading?.cancel()
        reading = undefined
        stopSafety?.()
        stopSafety = undefined
      },
    }
  })
}
