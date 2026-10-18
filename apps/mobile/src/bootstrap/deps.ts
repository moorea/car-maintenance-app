import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createReminderScheduler,
  guardAiSharing,
  withFillUpReadings,
  type IdGenerator,
} from '@car/core'
import { demoOdometerReader, demoPriceEstimator, demoQuoteReader } from '@car/core/testing'
import { nhtsaVinDecoder, storedDevicePreferences, storedReminderSettings } from '@car/data'
import { randomUUID } from 'expo-crypto'
import { pdfReportExporter } from './careReport'
import { appDataFiles } from './dataFiles'
import { localClock } from './clock'
import { backendConfig } from './config'
import { createDemoAssistant, createDemoRepositories, DEMO_ODOMETER_PHOTO_MILES } from './demo'
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
const chosen = config ? createLiveRepositories(config) : demoRepositories()
// Every fill-up's mileage is an odometer reading, for every screen and for reminders.
const repositories = { ...chosen, odometer: withFillUpReadings(chosen.odometer, chosen.fillUps) }

function demoRepositories() {
  const demo = createDemoRepositories()
  return {
    ...demo,
    // The assistant sees fill-up mileage too, as the live server does.
    assistant: createDemoAssistant(
      { ...demo, odometer: withFillUpReadings(demo.odometer, demo.fillUps) },
      clock,
    ),
    quoteReader: demoQuoteReader({ delayMs: 1_500 }),
    // A little past the demo car's last reading, as a photo taken today would show.
    odometerReader: demoOdometerReader({ miles: DEMO_ODOMETER_PHOTO_MILES, delayMs: 1_500 }),
    priceEstimator: demoPriceEstimator({ delayMs: 1_500 }),
  }
}

// Reminders are planned and scheduled on the phone, so they work offline and need no push server.
const notifier = expoNotifier()
const reminderSettings = storedReminderSettings(AsyncStorage, 'car-maintenance-reminders')
// Seen the introduction, and allowed Ask to share with Anthropic: both belong to this phone.
const preferences = storedDevicePreferences(AsyncStorage, 'car-maintenance-preferences')
// Nothing reaches Anthropic unless the signed-in owner allowed it, whichever screen asks.
const ai = guardAiSharing({ preferences, auth: repositories.auth }, repositories)

export const deps = {
  clock,
  ids,
  // NHTSA's lookup is free and needs no account, so demo mode uses it too.
  vinDecoder: nhtsaVinDecoder(),
  ...repositories,
  ...ai,
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
