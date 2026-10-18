import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Keeps a screen without the tab bar clear of the home indicator. On iOS the app is laid out to
 * the bottom edge (`App`), so lists scroll on behind the floating tab bar as in the mockups;
 * a screen with its own bottom controls, such as Ask's composer, needs the room back.
 */
export function BottomSafeArea({ children }: { children: ReactNode }) {
  const { bottom } = useSafeAreaInsets()
  return <View style={{ flex: 1, paddingBottom: bottom }}>{children}</View>
}
