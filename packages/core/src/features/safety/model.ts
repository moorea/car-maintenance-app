import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  Bulletin,
  ComplaintSummary,
  OdometerReading,
  Recall,
  SafetyReport,
  ServiceRecord,
  Vehicle,
} from '../../domain/types'
import {
  byBulletinImportance,
  describeMileageWindow,
  groupBulletins,
  hasMileageData,
  issuesNearMileage,
  mayBeFree,
  type BulletinGroup,
  type NearbyIssue,
} from '../../lib/knownIssues'
import { recallLookupUrl } from '../../lib/nhtsa'
import type { Clock, OdometerRepo, SafetyRepo, ServiceRecordRepo, Unsubscribe } from '../../ports'
import { currentOdometer } from '../garage/odometer'

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
  /** "Toyota", for sentences about the manufacturer's bulletins. */
  make: string
  /** False until NHTSA's manufacturer communications have been imported for the model year. */
  bulletinsChecked: boolean
  /** Warranty extensions and service campaigns, which may make a repair free. */
  extensions: Bulletin[]
  /** The other bulletins by part of the car, the biggest group first. */
  bulletinGroups: BulletinGroup[]
  /** What owners reported around this car's mileage. */
  nearby: NearbyIssues
}

/**
 * - `no-odometer`: the car has no reading, so its mileage is unknown.
 * - `no-data`: no complaint of the model year has a mileage yet.
 * - `ready`: `issues` lists what owners reported in the window (possibly nothing).
 */
export interface NearbyIssues {
  status: 'no-odometer' | 'no-data' | 'ready'
  /** "80,000–100,000 mi". */
  window?: string | undefined
  issues: NearbyIssue[]
}

export interface SafetyActions {
  start: () => void
  /** Opens or closes a recall or complaint summary. */
  toggle: (id: string) => void
  dispose: () => void
}

export type SafetyModel = StoreApi<SafetyState & SafetyActions>

export interface SafetyDeps {
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'configId' | 'vin'>
  safety: SafetyRepo
  /** For the car's mileage, which picks the complaints near it. */
  odometer: OdometerRepo
  records: ServiceRecordRepo
  clock: Clock
}

const urgency = (r: Recall) => (r.parkIt ? 2 : r.parkOutside ? 1 : 0)

const byUrgencyThenNewest = (a: Recall, b: Recall) =>
  urgency(b) - urgency(a) ||
  (b.reportedOn ?? '').localeCompare(a.reportedOn ?? '') ||
  a.campaign.localeCompare(b.campaign)

const byMostComplaints = (a: ComplaintSummary, b: ComplaintSummary) =>
  b.complaints - a.complaints || a.component.localeCompare(b.component)

const nearbyIssues = (report: SafetyReport, miles: number | undefined): NearbyIssues => {
  if (!hasMileageData(report.complaints)) return { status: 'no-data', issues: [] }
  if (miles === undefined) return { status: 'no-odometer', issues: [] }
  const near = issuesNearMileage(report.complaints, report.bulletins ?? [], miles)
  return {
    status: 'ready',
    window: describeMileageWindow(near.from, near.to),
    issues: near.issues,
  }
}

/** Screen model for a car's NHTSA recalls, manufacturer bulletins and owner complaints. */
export const createSafetyModel = (deps: SafetyDeps): SafetyModel => {
  const { id: vehicleId, configId, vin, year, make, model } = deps.vehicle
  const unsubscribes: Unsubscribe[] = []
  let report: SafetyReport | undefined
  let readings: OdometerReading[] = []
  let records: ServiceRecord[] = []

  return createStore<SafetyState & SafetyActions>()((set) => {
    const show = () => {
      if (!report) return
      const bulletins = [...(report.bulletins ?? [])].sort(byBulletinImportance)
      set({
        status: report.recallsCheckedAt === undefined ? 'checking' : 'ready',
        recalls: [...report.recalls].sort(byUrgencyThenNewest),
        complaintsChecked: report.complaintsCheckedAt !== undefined,
        complaints: [...report.complaints].sort(byMostComplaints),
        bulletinsChecked: report.bulletinsCheckedAt !== undefined,
        extensions: bulletins.filter(mayBeFree),
        bulletinGroups: groupBulletins(bulletins.filter((b) => !mayBeFree(b))),
        nearby: nearbyIssues(report, currentOdometer(readings, records, deps.clock.today()).miles),
      })
    }

    return {
      status: configId === undefined ? 'unmatched' : 'loading',
      recalls: [],
      complaintsChecked: false,
      complaints: [],
      expanded: [],
      lookupUrl: recallLookupUrl(vin),
      modelYear: `${year} ${make} ${model}`,
      make,
      bulletinsChecked: false,
      extensions: [],
      bulletinGroups: [],
      nearby: { status: 'no-data', issues: [] },

      toggle: (id) =>
        set((s) => ({
          expanded: s.expanded.includes(id)
            ? s.expanded.filter((e) => e !== id)
            : [...s.expanded, id],
        })),

      start: () => {
        if (unsubscribes.length > 0 || configId === undefined) return
        // A new odometer reading moves the car into another mileage window.
        unsubscribes.push(
          deps.odometer.watchForVehicle(vehicleId, (r) => {
            readings = r
            show()
          }),
          deps.records.watchForVehicle(vehicleId, (r) => {
            records = r
            show()
          }),
          deps.safety.watchForConfig(configId, (r) => {
            report = r
            show()
          }),
        )
      },

      dispose: () => {
        for (const stop of unsubscribes.splice(0)) stop()
      },
    }
  })
}
