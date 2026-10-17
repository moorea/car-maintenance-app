import type { MaintenanceItem, ScheduleSource } from '../domain/types'

/** The source of the app's own general intervals, used until a provider has the car's schedule. */
export const BASELINE_SOURCE: ScheduleSource = 'baseline'

/**
 * True when a schedule is the app's general guidance rather than the manufacturer's, so the app
 * must say so wherever it shows or quotes it.
 */
export const isGeneralGuidance = (items: readonly Pick<MaintenanceItem, 'source'>[]): boolean =>
  items.some((i) => i.source === BASELINE_SOURCE)
