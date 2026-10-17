import type { Clock, IdGenerator } from '@car/core'
import { randomUUID } from 'expo-crypto'
import { backendConfig } from './config'
import { createDemoRepositories } from './demo'
import { createLiveRepositories } from './live'

// The composition root: the only place that picks adapters. Screens only ever see ports.
const clock: Clock = { today: () => new Date().toISOString().slice(0, 10) }
// Ids are UUIDs so rows created offline never collide once uploaded to Postgres.
const ids: IdGenerator = { next: () => randomUUID() }

const config = backendConfig()

/** 'live' when backend settings are present; otherwise the app runs on demo data. */
export const mode = config ? 'live' : 'demo'

export const deps = {
  clock,
  ids,
  ...(config ? createLiveRepositories(config) : createDemoRepositories()),
}
