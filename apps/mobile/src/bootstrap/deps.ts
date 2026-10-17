import AsyncStorage from '@react-native-async-storage/async-storage'
import { createReminderScheduler, type IdGenerator } from '@car/core'
import { demoQuoteReader } from '@car/core/testing'
import { nhtsaVinDecoder, storedDevicePreferences, storedReminderSettings } from '@car/data'
import { randomUUID } from 'expo-crypto'
import { pdfReportExporter } from './careReport'
import { appDataFiles } from './dataFiles'
import { localClock } from './clock'
import { backendConfig } from './config'
import { createDemoAssistant, createDemoRepositories } from './demo'
import { createLiveRepositories } from './live'
import { systemFilePicker, systemFilePreview } from './files'
import { expoNotifier } from './notifications'
import { expoPhotoPicker } from './photos'

// The composition root: the only place that picks adapters. Screens only ever see ports.
const clock = localClock
// Ids are UUIDs so rows created offline never collide once uploaded to Postgres.
const ids: IdGenerator = { next: () => randomUUID() }

// Live when backend settings are present; otherwise the app runs on demo data.
const config = backendConfig()
const repositories = config ? createLiveRepositories(config) : demoRepositories()

function demoRepositories() {
  const demo = createDemoRepositories()
  return {
    ...demo,
    assistant: createDemoAssistant(demo, clock),
    quoteReader: demoQuoteReader({ delayMs: 1_500 }),
  }
}

// Reminders are planned and scheduled on the phone, so they work offline and need no push server.
const notifier = expoNotifier()
const reminderSettings = storedReminderSettings(AsyncStorage, 'car-maintenance-reminders')
// Seen the introduction, and allowed Ask to share with Anthropic: both belong to this phone.
const preferences = storedDevicePreferences(AsyncStorage, 'car-maintenance-preferences')

export const deps = {
  clock,
  ids,
  // NHTSA's lookup is free and needs no account, so demo mode uses it too.
  vinDecoder: nhtsaVinDecoder(),
  ...repositories,
  notifier,
  reminderSettings,
  preferences,
  exporter: pdfReportExporter(),
  dataFiles: appDataFiles(),
  picker: systemFilePicker(),
  preview: systemFilePreview(),
  photos: expoPhotoPicker(),
  reminders: createReminderScheduler({
    ...repositories,
    clock,
    notifier,
    settings: reminderSettings,
    log: (message, error) => console.warn(message, error),
  }),
}
