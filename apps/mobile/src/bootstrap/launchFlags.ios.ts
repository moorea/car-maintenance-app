import { Settings } from 'react-native'

/**
 * Whether the app was launched with a flag, as UI tests do. iOS puts `-name value` launch
 * arguments in user defaults, where `Settings` reads them.
 */
export function launchFlag(name: string): boolean {
  const value: unknown = Settings.get(name)
  return value === true || value === 1 || value === 'true' || value === '1'
}
