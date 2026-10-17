import type { DevicePreferences, DevicePreferencesRepo } from '@car/core'

const DEFAULTS: DevicePreferences = { onboarded: false, aiSharing: false }

const parse = (raw: string | null): DevicePreferences => {
  try {
    const value: unknown = raw === null ? undefined : JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>
      // Only an explicit true counts, so a damaged value never shares anything.
      return { onboarded: v.onboarded === true, aiSharing: v.aiSharing === true }
    }
  } catch {
    // A damaged value reads as the defaults.
  }
  return DEFAULTS
}

/**
 * Device preferences kept on this phone under `key`, such as in AsyncStorage: whether the
 * introduction was seen, and whether the owner allowed sharing with the assistant's model.
 */
export const storedDevicePreferences = (
  storage: {
    getItem(key: string): Promise<string | null>
    setItem(key: string, value: string): Promise<void>
  },
  key: string,
): DevicePreferencesRepo => {
  let current: DevicePreferences | undefined
  const watchers = new Set<(preferences: DevicePreferences) => void>()
  const loaded = storage.getItem(key).then(parse, () => DEFAULTS)
  void loaded.then((preferences) => {
    // A change made before the stored value arrived wins.
    current ??= preferences
    for (const w of watchers) w(current)
  })

  return {
    watch: (onChange) => {
      watchers.add(onChange)
      if (current) onChange(current)
      return () => watchers.delete(onChange)
    },
    // Saved before anyone is told, so a failed write never shows a choice that will not last.
    update: async (change) => {
      const next = { ...(current ?? (await loaded)), ...change }
      await storage.setItem(key, JSON.stringify(next))
      current = next
      for (const w of watchers) w(current)
    },
  }
}
