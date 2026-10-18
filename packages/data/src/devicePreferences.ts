import type { DevicePreferences, DevicePreferencesRepo } from '@car/core'

const DEFAULTS: DevicePreferences = {
  onboarded: false,
  aiSharingOwner: null,
  remindersOffered: false,
  historyDismissed: [],
}

const parse = (raw: string | null): DevicePreferences => {
  try {
    const value: unknown = raw === null ? undefined : JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>
      return {
        onboarded: v.onboarded === true,
        // Only an account id counts, so a damaged value never shares anything.
        aiSharingOwner:
          typeof v.aiSharingOwner === 'string' && v.aiSharingOwner !== '' ? v.aiSharingOwner : null,
        remindersOffered: v.remindersOffered === true,
        historyDismissed: Array.isArray(v.historyDismissed)
          ? v.historyDismissed.filter((id): id is string => typeof id === 'string')
          : [],
      }
    }
  } catch {
    // A damaged value reads as the defaults.
  }
  return DEFAULTS
}

/**
 * Device preferences kept on this phone under `key`, such as in AsyncStorage: whether the
 * introduction was seen, who allowed sharing with the assistant's model, whether reminders
 * were offered, and which cars' history the owner chose not to fill in.
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
  // Updates run one at a time, each on top of the last one saved, so two close together (such
  // as turning sharing off while the introduction finishes) never undo each other.
  let queue: Promise<unknown> = loaded

  return {
    watch: (onChange) => {
      watchers.add(onChange)
      if (current) onChange(current)
      return () => watchers.delete(onChange)
    },
    // Saved before anyone is told, so a failed write never shows a choice that will not last.
    update: (change) => {
      const run = queue.then(async () => {
        const next = { ...(current ?? (await loaded)), ...change }
        await storage.setItem(key, JSON.stringify(next))
        current = next
        for (const w of watchers) w(current)
      })
      queue = run.catch(() => {})
      return run
    },
  }
}
