import type { ReminderScheduler } from '@car/core'
import { AppState } from 'react-native'

/**
 * Runs the reminder scheduler while the app is alive, planning again whenever the app returns to
 * the foreground: a new day or a permission changed in Settings does not announce itself.
 * Returns a function that stops it.
 */
export const runReminders = (scheduler: ReminderScheduler) => {
  scheduler.start()
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void scheduler.refresh()
  })
  return () => {
    sub.remove()
    scheduler.dispose()
  }
}
