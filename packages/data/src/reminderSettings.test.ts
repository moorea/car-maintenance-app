import type { ReminderSettings } from '@car/core'
import { describe, expect, it } from 'vitest'
import { storedReminderSettings } from './reminderSettings'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => void items.set(key, value),
  }
}

const watchAll = (repo: ReturnType<typeof storedReminderSettings>) => {
  const seen: ReminderSettings[] = []
  repo.watch((s) => seen.push(s))
  return seen
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('storedReminderSettings', () => {
  it('reads reminders as off on a phone that never turned them on', async () => {
    const seen = watchAll(storedReminderSettings(memoryStorage(), 'reminders'))
    await settle()
    expect(seen).toEqual([{ enabled: false }])
  })

  it('remembers turning reminders on across launches', async () => {
    const storage = memoryStorage()
    await storedReminderSettings(storage, 'reminders').set({ enabled: true })
    const seen = watchAll(storedReminderSettings(storage, 'reminders'))
    await settle()
    expect(seen).toEqual([{ enabled: true }])
  })

  it('tells watchers about a change straight away', async () => {
    const repo = storedReminderSettings(memoryStorage(), 'reminders')
    await settle()
    const seen = watchAll(repo)
    await repo.set({ enabled: true })
    expect(seen).toEqual([{ enabled: false }, { enabled: true }])
  })

  it('treats a damaged stored value as off', async () => {
    const seen = watchAll(
      storedReminderSettings(memoryStorage({ reminders: '{oops' }), 'reminders'),
    )
    await settle()
    expect(seen).toEqual([{ enabled: false }])
  })
})
