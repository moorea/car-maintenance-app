import {
  createReminderScheduler,
  guardAiSharing,
  withFillUpReadings,
  type IdGenerator,
} from '@car/core'
import {
  demoOdometerReader,
  demoPriceEstimator,
  demoQuoteReader,
  memoryNotifier,
  memoryPhotoPicker,
  memoryPreferences,
  memoryReminderSettings,
} from '@car/core/testing'
import { randomUUID } from 'expo-crypto'
import { pdfReportExporter } from './careReport'
import { appDataFiles } from './dataFiles'
import { localClock } from './clock'
import {
  createDemoAssistant,
  createDemoRepositories,
  DEMO_ODOMETER_PHOTO_MILES,
  demoAttachments,
  demoVinDecoder,
} from './demo'
import { sampleFiles } from './sampleFiles'
import { systemFilePicker, systemFilePreview } from './files'

// The web build is a preview of the app on demo data (used for PR screenshots). PowerSync's
// native SQLite does not run in a browser, so it never uses the live backend.
const clock = localClock
const ids: IdGenerator = { next: () => randomUUID() }
const demo = createDemoRepositories()
const repositories = {
  ...demo,
  // Every fill-up's mileage is an odometer reading, as in the app.
  odometer: withFillUpReadings(demo.odometer, demo.fillUps),
  attachments: demoAttachments(sampleFiles()),
}
// Browsers cannot schedule notifications for a future date, so the preview pretends.
const notifier = memoryNotifier()
const reminderSettings = memoryReminderSettings()
// Starts fresh on every load, so the preview always opens on the introduction.
const preferences = memoryPreferences()
// `?new-owner` opens the preview signed out, as a first launch does, to show the introduction.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('new-owner'))
  void repositories.auth.signOut()
const ai = guardAiSharing(
  { preferences, auth: repositories.auth },
  {
    assistant: createDemoAssistant(repositories, clock),
    quoteReader: demoQuoteReader({ delayMs: 1_500 }),
    odometerReader: demoOdometerReader({ miles: DEMO_ODOMETER_PHOTO_MILES, delayMs: 1_500 }),
    priceEstimator: demoPriceEstimator({ delayMs: 1_500 }),
  },
)

export const deps = {
  clock,
  ids,
  vinDecoder: demoVinDecoder(),
  ...repositories,
  ...ai,
  // The preview has no camera; every photo reads as a sample dealer quote or the demo odometer.
  photos: memoryPhotoPicker(),
  notifier,
  reminderSettings,
  preferences,
  exporter: pdfReportExporter(),
  dataFiles: appDataFiles(),
  picker: systemFilePicker(),
  preview: systemFilePreview(),
  reminders: createReminderScheduler({
    ...repositories,
    clock,
    notifier,
    settings: reminderSettings,
  }),
}
