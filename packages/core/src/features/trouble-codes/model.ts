import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ComplaintSummary, Recall, Vehicle } from '../../domain/types'
import {
  lookupCode,
  MAX_CODES,
  mostUrgent,
  parseCodes,
  type CodeLookup,
  type CodeUrgency,
} from '../../codes/lookupCode'
import type { Clock, OdometerRepo, SafetyRepo, Unsubscribe } from '../../ports'

/** What the codes add up to: how urgent the worst of them is, and what to do. */
export interface CodeResult {
  urgency: CodeUrgency
  /** True when the owner said the light is flashing, which overrides the codes. */
  flashing: boolean
  headline: string
  advice: string
  codes: CodeLookup[]
}

export interface TroubleCodesState {
  /** `editing` while the owner types the codes; `checked` while the result shows. */
  status: 'editing' | 'checked'
  /** "2021 Toyota RAV4", under the screen's title. */
  carTitle: string
  /** The codes as typed, such as "P0420, P0171". */
  draft: string
  /** Whether the check-engine light is flashing rather than steady. */
  flashing: boolean
  /** True when the draft has a code to look up. */
  canCheck: boolean
  result?: CodeResult | undefined
  /** Why the draft could not be looked up, such as a typo in a code. */
  error?: string | undefined
}

export interface TroubleCodesActions {
  start: () => void
  setDraft: (text: string) => void
  setFlashing: (flashing: boolean) => void
  /** Looks up the draft's codes. */
  check: () => void
  /** Goes back to the codes, keeping them. */
  edit: () => void
  /** Clears the codes to look up others. */
  startOver: () => void
  /** A question for Ask about one looked-up code. */
  questionFor: (code: string) => string | undefined
  dispose: () => void
}

export type TroubleCodesModel = StoreApi<TroubleCodesState & TroubleCodesActions>

export interface TroubleCodesDeps {
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'configId'>
  safety: SafetyRepo
  odometer: OdometerRepo
  clock: Clock
}

const OUTCOMES: Record<CodeUrgency, { headline: string; advice: string }> = {
  stop: {
    headline: 'Stop driving',
    advice:
      'Pull over when it’s safe and turn the engine off. Driving on can cause serious damage, so have it towed.',
  },
  soon: {
    headline: 'Get it checked this week',
    advice:
      'You can drive gently for a few days. Book a shop soon: left alone, this can damage other parts or leave you stranded.',
  },
  later: {
    headline: 'Safe to drive for now',
    advice:
      'Nothing here needs you to stop. Fix it at your next service. Until then it will fail an emissions inspection.',
  },
}

const FLASHING = {
  headline: 'Stop driving',
  advice:
    'A flashing light means the engine is misfiring badly enough to overheat the catalytic converter. Pull over when it’s safe and have it towed, or drive slowly and only as far as you must.',
}

const canCheck = (draft: string) => parseCodes(draft).codes.length > 0

const invalidMessage = (invalid: string[]) =>
  `${invalid.map((t) => `“${t}”`).join(', ')} ${invalid.length === 1 ? 'isn’t a trouble code' : 'aren’t trouble codes'}. Codes are a letter and four characters, like P0420.`

/**
 * Screen model for looking up check-engine codes: the owner types the codes a scan tool or parts
 * store read, and each one is explained with how urgent it is and any recall or complaints about
 * the same part. Works offline: the codes are in a table on the phone.
 */
export const createTroubleCodesModel = (deps: TroubleCodesDeps): TroubleCodesModel => {
  const { vehicle } = deps
  let recalls: Recall[] = []
  let complaints: ComplaintSummary[] = []
  let miles: number | undefined
  let stops: Unsubscribe[] = []

  return createStore<TroubleCodesState & TroubleCodesActions>()((set, get) => ({
    status: 'editing',
    carTitle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    draft: '',
    flashing: false,
    canCheck: false,

    start: () => {
      if (stops.length > 0) return
      stops.push(
        deps.odometer.watchForVehicle(vehicle.id, (readings) => {
          const latest = [...readings].sort((a, b) => b.date.localeCompare(a.date))[0]
          miles = latest?.miles
        }),
      )
      if (vehicle.configId !== undefined)
        stops.push(
          deps.safety.watchForConfig(vehicle.configId, (report) => {
            recalls = report.recalls
            complaints = report.complaints
          }),
        )
    },

    setDraft: (draft) => {
      if (get().status !== 'editing') return
      set({ draft, canCheck: canCheck(draft), error: undefined })
    },

    setFlashing: (flashing) => set({ flashing }),

    check: () => {
      const { draft, flashing } = get()
      const { codes, invalid } = parseCodes(draft)
      if (invalid.length > 0) return set({ error: invalidMessage(invalid) })
      if (codes.length === 0) return
      if (codes.length > MAX_CODES)
        return set({ error: `Look up at most ${MAX_CODES} codes at a time.` })
      const ctx = {
        make: vehicle.make,
        year: vehicle.year,
        currentYear: Number(deps.clock.today().slice(0, 4)),
        miles,
        recalls,
        complaints,
      }
      const looked = codes.map((c) => lookupCode(c, ctx))
      const urgency = flashing ? 'stop' : mostUrgent(looked.map((l) => l.urgency))
      const outcome = flashing ? FLASHING : OUTCOMES[urgency]
      set({
        status: 'checked',
        error: undefined,
        result: { urgency, flashing, ...outcome, codes: looked },
      })
    },

    edit: () => {
      if (get().status === 'checked') set({ status: 'editing', result: undefined })
    },

    startOver: () =>
      set({
        status: 'editing',
        draft: '',
        flashing: false,
        canCheck: false,
        result: undefined,
        error: undefined,
      }),

    questionFor: (code) => {
      const result = get().result
      const found = result?.codes.find((c) => c.code === code)
      if (!found) return undefined
      const meaning = found.known ? `, “${found.title}”` : ''
      const light = result?.flashing ? 'flashing' : 'on'
      return `My check-engine light is ${light} with code ${found.code}${meaning}. What usually causes it on my car, and is it safe to drive?`
    },

    dispose: () => {
      for (const stop of stops) stop()
      stops = []
    },
  }))
}
