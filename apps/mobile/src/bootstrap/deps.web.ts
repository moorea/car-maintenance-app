import { createReminderScheduler, type IdGenerator } from '@car/core'
import {
  demoQuoteReader,
  memoryNotifier,
  memoryPhotoPicker,
  memoryReminderSettings,
} from '@car/core/testing'
import { randomUUID } from 'expo-crypto'
import { pdfReportExporter } from './careReport'
import { localClock } from './clock'
import {
  createDemoAssistant,
  createDemoRepositories,
  demoAttachments,
  demoVinDecoder,
} from './demo'
import { sampleFiles } from './sampleFiles'
import { systemFilePicker, systemFilePreview } from './files'

// The web build is a preview of the app on demo data (used for PR screenshots). PowerSync's
// native SQLite does not run in a browser, so it never uses the live backend.
const clock = localClock
const ids: IdGenerator = { next: () => randomUUID() }
const repositories = { ...createDemoRepositories(), attachments: demoAttachments(sampleFiles()) }
// Browsers cannot schedule notifications for a future date, so the preview pretends.
const notifier = memoryNotifier()
const reminderSettings = memoryReminderSettings()

export const deps = {
  clock,
  ids,
  vinDecoder: demoVinDecoder(),
  ...repositories,
  assistant: createDemoAssistant(repositories, clock),
  // The preview has no camera; every photo is a sample dealer quote.
  photos: memoryPhotoPicker(),
  quoteReader: demoQuoteReader({ delayMs: 1_500 }),
  notifier,
  reminderSettings,
  exporter: pdfReportExporter(),
  picker: systemFilePicker(),
  preview: systemFilePreview(),
  reminders: createReminderScheduler({
    ...repositories,
    clock,
    notifier,
    settings: reminderSettings,
  }),
}
