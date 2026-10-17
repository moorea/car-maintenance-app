import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ComplaintSummary, Recall, Vehicle } from '../../domain/types'
import { recallLookupUrl } from '../../lib/nhtsa'
import type { SafetyRepo, Unsubscribe } from '../../ports'

/**
 * - `loading`: waiting for the local database.
 * - `unmatched`: the car has not synced back with its configuration yet, so nothing is known.
 * - `checking`: the server has not asked NHTSA about this model year yet.
 * - `ready`: recalls are known (possibly none).
 */
export type SafetyStatus = 'loading' | 'unmatched' | 'checking' | 'ready'

export interface SafetyState {
  status: SafetyStatus
  /** Recalls that say not to drive or to park outside first, then newest first. */
  recalls: Recall[]
  /** False until the server has asked NHTSA about complaints. */
  complaintsChecked: boolean
  /** Components with the most complaints first. */
  complaints: ComplaintSummary[]
  /** Ids of the recalls and complaint summaries the owner has opened. */
  expanded: string[]
  /** Where the owner checks which recalls apply to their car and whether they were fixed. */
  lookupUrl: string
  /** What NHTSA was asked about, such as "2021 Toyota RAV4", so an empty list says what it covers. */
  modelYear: string
}

export interface SafetyActions {
  start: () => void
  /** Opens or closes a recall or complaint summary. */
  toggle: (id: string) => void
  dispose: () => void
}

export type SafetyModel = StoreApi<SafetyState & SafetyActions>

export interface SafetyDeps {
  vehicle: Pick<Vehicle, 'year' | 'make' | 'model' | 'configId' | 'vin'>
  safety: SafetyRepo
}

const urgency = (r: Recall) => (r.parkIt ? 2 : r.parkOutside ? 1 : 0)

const byUrgencyThenNewest = (a: Recall, b: Recall) =>
  urgency(b) - urgency(a) ||
  (b.reportedOn ?? '').localeCompare(a.reportedOn ?? '') ||
  a.campaign.localeCompare(b.campaign)

const byMostComplaints = (a: ComplaintSummary, b: ComplaintSummary) =>
  b.complaints - a.complaints || a.component.localeCompare(b.component)

/** Screen model for a car's NHTSA recalls and owner complaints. */
export const createSafetyModel = (deps: SafetyDeps): SafetyModel => {
  const { configId, vin, year, make, model } = deps.vehicle
  let unsubscribe: Unsubscribe | undefined

  return createStore<SafetyState & SafetyActions>()((set) => ({
    status: configId === undefined ? 'unmatched' : 'loading',
    recalls: [],
    complaintsChecked: false,
    complaints: [],
    expanded: [],
    lookupUrl: recallLookupUrl(vin),
    modelYear: `${year} ${make} ${model}`,

    toggle: (id) =>
      set((s) => ({
        expanded: s.expanded.includes(id)
          ? s.expanded.filter((e) => e !== id)
          : [...s.expanded, id],
      })),

    start: () => {
      if (unsubscribe || configId === undefined) return
      unsubscribe = deps.safety.watchForConfig(configId, (report) =>
        set({
          status: report.recallsCheckedAt === undefined ? 'checking' : 'ready',
          recalls: [...report.recalls].sort(byUrgencyThenNewest),
          complaintsChecked: report.complaintsCheckedAt !== undefined,
          complaints: [...report.complaints].sort(byMostComplaints),
        }),
      )
    },

    dispose: () => {
      unsubscribe?.()
      unsubscribe = undefined
    },
  }))
}
