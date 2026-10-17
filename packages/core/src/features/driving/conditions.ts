import type { MaintenanceItem } from '../../domain/types'
import { describeInterval } from '../car/model'

/** One question about how the car is driven. Any yes puts it on the severe schedule. */
export interface DrivingQuestion {
  id: DrivingConditionId
  question: string
  /** Examples under the question, so the owner recognises their own driving. */
  hint: string
  /** Why it is hard on the car, shown when the owner says yes. */
  why: string
}

export type DrivingConditionId = 'short-trips' | 'stop-and-go' | 'towing' | 'dust' | 'climate'

/**
 * The conditions owner's manuals call severe, as plain questions. Manuals differ in the details;
 * these are the ones nearly all of them share.
 */
export const DRIVING_QUESTIONS: DrivingQuestion[] = [
  {
    id: 'short-trips',
    question: 'Most trips are under 5 miles',
    hint: 'Or under 10 miles in freezing weather. School runs and errands count.',
    why: 'Short trips never get the oil hot enough to boil off water and fuel.',
  },
  {
    id: 'stop-and-go',
    question: 'Lots of stop-and-go traffic or idling',
    hint: 'Rush-hour commutes, deliveries, rideshare, or waiting with the engine running.',
    why: 'Stop-and-go traffic and idling wear the oil and brakes with few miles to show for it.',
  },
  {
    id: 'towing',
    question: 'Towing, a roof box or heavy loads',
    hint: 'A trailer, a camper, a full roof rack, or a bed full of gear.',
    why: 'Extra weight makes the engine, transmission and brakes work harder.',
  },
  {
    id: 'dust',
    question: 'Dusty, gravel, muddy or salted roads',
    hint: 'Dirt roads, construction sites, or winter roads treated with salt.',
    why: 'Dust clogs the filters, and mud and salt get into the brakes and suspension.',
  },
  {
    id: 'climate',
    question: 'Very hot or very cold weather, or mountains',
    hint: 'Summers over 90°F, winters below freezing, or steep climbs.',
    why: 'Extreme temperatures and long climbs run fluids hotter or thicker than usual.',
  },
]

export type DrivingAnswers = Partial<Record<DrivingConditionId, boolean>>

export interface DrivingAssessment {
  /** True when any condition applies. */
  severe: boolean
  /** Why, one line per condition that applies, in question order. */
  reasons: string[]
}

/** Which schedule fits the answers: severe if any condition applies, as owner's manuals say. */
export const assessDriving = (answers: DrivingAnswers): DrivingAssessment => {
  const reasons = DRIVING_QUESTIONS.filter((q) => answers[q.id] === true).map((q) => q.why)
  return { severe: reasons.length > 0, reasons }
}

/** One schedule item whose interval differs between normal and severe driving. */
export interface ScheduleDifference {
  task: string
  normal: string
  severe: string
}

/** The items that come due sooner on the severe schedule, with both intervals. */
export const severeDifferences = (items: MaintenanceItem[]): ScheduleDifference[] =>
  items
    .map((item) => ({
      task: item.task,
      normal: describeInterval(item, false),
      severe: describeInterval(item, true),
    }))
    .filter((d) => d.normal !== d.severe)
