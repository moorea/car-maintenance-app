import type { Clock, IdGenerator } from '@car/core'
import { randomUUID } from 'expo-crypto'
import { createDemoRepositories, demoVinDecoder } from './demo'

// The web build is a preview of the app on demo data (used for PR screenshots). PowerSync's
// native SQLite does not run in a browser, so it never uses the live backend.
const clock: Clock = { today: () => new Date().toISOString().slice(0, 10) }
const ids: IdGenerator = { next: () => randomUUID() }

export const deps = { clock, ids, vinDecoder: demoVinDecoder(), ...createDemoRepositories() }
