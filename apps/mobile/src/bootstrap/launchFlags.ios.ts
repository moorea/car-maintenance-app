import { Settings } from 'react-native'

/**
 * Whether the app was launched with a flag, as UI tests do. iOS puts `-name value` launch
 * arguments in user defaults, where `Settings` reads them. A `--name value` argument lands under
 * `-name`, so both are checked.
 */
export function launchFlag(name: string): boolean {
  return [name, `-${name}`].some((key) => {
    const value: unknown = Settings.get(key)
    return value === true || value === 1 || value === 'true' || value === '1'
  })
}
