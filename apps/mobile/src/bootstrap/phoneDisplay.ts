import type { PhoneDisplay, PhoneFor3d } from '@car/core'
import * as Battery from 'expo-battery'
import { AccessibilityInfo, Platform } from 'react-native'

// Android phones older than Android 10 (2019) are too slow to turn the car smoothly.
const capable = Platform.OS !== 'android' || Number(Platform.Version) >= 29

/** Reduce Motion and Low Power Mode as the system reports them, and whether the phone is fast enough. */
export function systemPhoneDisplay(): PhoneDisplay {
  return {
    watch: (onChange) => {
      let phone: PhoneFor3d = { reduceMotion: false, lowPower: false, capable }
      let stopped = false
      const update = (change: Partial<PhoneFor3d>) => {
        if (stopped) return
        phone = { ...phone, ...change }
        onChange(phone)
      }
      // Reads both before the first answer, so the car never starts turning only to stop.
      void Promise.all([
        AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        Battery.isLowPowerModeEnabledAsync().catch(() => false),
      ]).then(([reduceMotion, lowPower]) => update({ reduceMotion, lowPower }))
      const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduceMotion) =>
        update({ reduceMotion }),
      )
      const power = Battery.addLowPowerModeListener(({ lowPowerMode }) =>
        update({ lowPower: lowPowerMode }),
      )
      return () => {
        stopped = true
        motion.remove()
        power.remove()
      }
    },
  }
}
