import type { ReminderSettings, ReminderSettingsRepo } from '@car/core'

const DEFAULTS: ReminderSettings = { enabled: false }

const parse = (raw: string | null): ReminderSettings => {
  try {
    const value: unknown = raw === null ? undefined : JSON.parse(raw)
    if (typeof value === 'object' && value !== null && 'enabled' in value)
      return { enabled: value.enabled === true }
  } catch {
    // A damaged value reads as the defaults rather than stopping reminders from loading.
  }
  return DEFAULTS
}

/**
 * Reminder settings kept on this phone under `key`, such as in AsyncStorage. They belong to the
 * device, not the account: notifications are scheduled here, and another phone asks again.
 */
export const storedReminderSettings = (
  storage: {
    getItem(key: string): Promise<string | null>
    setItem(key: string, value: string): Promise<void>
  },
  key: string,
): ReminderSettingsRepo => {
  let current: ReminderSettings | undefined
  const watchers = new Set<(settings: ReminderSettings) => void>()
  const loaded = storage.getItem(key).then(parse, () => DEFAULTS)
  void loaded.then((settings) => {
    // A change made before the stored value arrived wins.
    current ??= settings
    for (const w of watchers) w(current)
  })

  return {
    watch: (onChange) => {
      watchers.add(onChange)
      if (current) onChange(current)
      return () => watchers.delete(onChange)
    },
    // Saved before anyone is told, so a failed write never shows a setting that will not last.
    set: async (settings) => {
      await storage.setItem(key, JSON.stringify(settings))
      current = settings
      for (const w of watchers) w(current)
    },
  }
}
