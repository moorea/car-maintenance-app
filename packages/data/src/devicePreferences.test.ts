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
    expect(seen).toEqual([{ onboarded: false, aiSharingOwner: null }])
  })

  it('remembers each choice across launches and keeps the others', async () => {
    const storage = memoryStorage()
    const repo = storedDevicePreferences(storage, 'prefs')
    await repo.update({ onboarded: true })
    await repo.update({ aiSharingOwner: 'u1' })
    await repo.update({ aiSharingOwner: null })
    const seen = watchAll(storedDevicePreferences(storage, 'prefs'))
    await settle()
    expect(seen).toEqual([{ onboarded: true, aiSharingOwner: null }])
  })

  it('keeps stored choices when one changes before they have been read', async () => {
    const storage = memoryStorage({
      prefs: JSON.stringify({ onboarded: true, aiSharingOwner: 'u1' }),
    })
    const repo = storedDevicePreferences(storage, 'prefs')
    await repo.update({ aiSharingOwner: null })
    expect(JSON.parse(storage.items.get('prefs') ?? '')).toEqual({
      onboarded: true,
      aiSharingOwner: null,
    })
  })

  it('never reads a damaged value as permission to share', async () => {
    const storage = memoryStorage({ prefs: '{"aiSharingOwner":true' })
    const seen = watchAll(storedDevicePreferences(storage, 'prefs'))
    await settle()
    expect(seen).toEqual([{ onboarded: false, aiSharingOwner: null }])
  })

  it('never lets a later change undo an earlier one made at the same time', async () => {
    const storage = memoryStorage({
      prefs: JSON.stringify({ onboarded: false, aiSharingOwner: 'u1' }),
    })
    const repo = storedDevicePreferences(storage, 'prefs')
    await Promise.all([repo.update({ aiSharingOwner: null }), repo.update({ onboarded: true })])
    expect(JSON.parse(storage.items.get('prefs') ?? '')).toEqual({
      onboarded: true,
      aiSharingOwner: null,
    })
  })

  it('keeps saving after one save fails', async () => {
    let fail = true
    const storage = memoryStorage()
    const repo = storedDevicePreferences(
      {
        ...storage,
        setItem: async (key, value) => {
          if (fail) {
            fail = false
            throw new Error('disk full')
          }
          await storage.setItem(key, value)
        },
      },
      'prefs',
    )
    await expect(repo.update({ onboarded: true })).rejects.toThrow('disk full')
    await repo.update({ onboarded: true })
    expect(JSON.parse(storage.items.get('prefs') ?? '').onboarded).toBe(true)
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
    await expect(repo.update({ aiSharingOwner: 'u1' })).rejects.toThrow('disk full')
    expect(seen).toEqual([{ onboarded: false, aiSharingOwner: null }])
  })
})
