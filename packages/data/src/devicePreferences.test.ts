import type { DevicePreferences } from '@car/core'
import { describe, expect, it } from 'vitest'
import { storedDevicePreferences } from './devicePreferences'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => void items.set(key, value),
  }
}

const watchAll = (repo: ReturnType<typeof storedDevicePreferences>) => {
  const seen: DevicePreferences[] = []
  repo.watch((p) => seen.push(p))
  return seen
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('storedDevicePreferences', () => {
  it('starts with nothing seen and nothing shared on a new phone', async () => {
    const seen = watchAll(storedDevicePreferences(memoryStorage(), 'prefs'))
    await settle()
    expect(seen).toEqual([{ onboarded: false, aiSharing: false }])
  })

  it('remembers each choice across launches and keeps the others', async () => {
    const storage = memoryStorage()
    const repo = storedDevicePreferences(storage, 'prefs')
    await repo.update({ onboarded: true })
    await repo.update({ aiSharing: true })
    await repo.update({ aiSharing: false })
    const seen = watchAll(storedDevicePreferences(storage, 'prefs'))
    await settle()
    expect(seen).toEqual([{ onboarded: true, aiSharing: false }])
  })

  it('keeps stored choices when one changes before they have been read', async () => {
    const storage = memoryStorage({ prefs: JSON.stringify({ onboarded: true, aiSharing: true }) })
    const repo = storedDevicePreferences(storage, 'prefs')
    await repo.update({ aiSharing: false })
    expect(JSON.parse(storage.items.get('prefs') ?? '')).toEqual({
      onboarded: true,
      aiSharing: false,
    })
  })

  it('never reads a damaged value as permission to share', async () => {
    const storage = memoryStorage({ prefs: '{"aiSharing":"yes"' })
    const seen = watchAll(storedDevicePreferences(storage, 'prefs'))
    await settle()
    expect(seen).toEqual([{ onboarded: false, aiSharing: false }])
  })

  it('keeps the old choice when saving fails', async () => {
    const repo = storedDevicePreferences(
      {
        getItem: async () => null,
        setItem: async () => {
          throw new Error('disk full')
        },
      },
      'prefs',
    )
    await settle()
    const seen = watchAll(repo)
    await expect(repo.update({ aiSharing: true })).rejects.toThrow('disk full')
    expect(seen).toEqual([{ onboarded: false, aiSharing: false }])
  })
})
