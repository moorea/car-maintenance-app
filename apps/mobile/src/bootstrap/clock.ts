import type { Clock } from '@car/core'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Today on the phone's own calendar. A UTC date would already be tomorrow on a US evening, which
 * would date a service logged that night wrongly and drop the next morning's reminder.
 */
export const localClock: Clock = {
  today: () => {
    const now = new Date()
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  },
}
