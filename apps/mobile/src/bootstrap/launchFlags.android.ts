import { requireOptionalNativeModule } from 'expo'

// apps/mobile/modules/launch-flags: reads the extras of the intent that launched the app.
const native = requireOptionalNativeModule<{ isSet(name: string): boolean }>('LaunchFlags')

/**
 * Whether the app was launched with a flag, as UI tests do. Maestro passes `launchApp` arguments
 * on Android as intent extras, which the app's launch-flags module keeps before JavaScript starts.
 */
export function launchFlag(name: string): boolean {
  try {
    return native?.isSet(name) ?? false
  } catch {
    return false
  }
}
