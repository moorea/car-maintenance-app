import { createReminderScheduler, type Clock, type IdGenerator } from '@car/core'
import { memoryNotifier, memoryReminderSettings } from '@car/core/testing'
import { randomUUID } from 'expo-crypto'
import { createDemoRepositories, demoVinDecoder } from './demo'

// The web build is a preview of the app on demo data (used for PR screenshots). PowerSync's
// native SQLite does not run in a browser, so it never uses the live backend.
const clock: Clock = { today: () => new Date().toISOString().slice(0, 10) }
const ids: IdGenerator = { next: () => randomUUID() }
const repositories = createDemoRepositories()
// Browsers cannot schedule notifications for a future date, so the preview pretends.
const notifier = memoryNotifier()
const reminderSettings = memoryReminderSettings()

export const deps = {
  clock,
  ids,
  vinDecoder: demoVinDecoder(),
  ...repositories,
  notifier,
  reminderSettings,
  reminders: createReminderScheduler({
    ...repositories,
    clock,
    notifier,
    settings: reminderSettings,
  }),
}
