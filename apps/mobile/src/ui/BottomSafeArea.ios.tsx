import { createContext, useContext, type ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Set inside a BottomSafeArea that already keeps clear of the home indicator, so one nested in it
// does not add the room twice.
const Inset = createContext(false)

interface Props {
  children: ReactNode
  /** False for a screen under the tab bar, whose lists run on to the bottom edge. */
  inset?: boolean
}

/**
 * Keeps a screen without the tab bar clear of the home indicator. On iOS the app is laid out to
 * the bottom edge (`App`), so lists scroll on behind the floating tab bar as in the mockups;
 * a screen with its own bottom controls, such as Ask's composer, needs the room back.
 */
export function BottomSafeArea({ children, inset = true }: Props) {
  const { bottom } = useSafeAreaInsets()
  const outer = useContext(Inset)
  const pad = inset && !outer
  return (
    <Inset.Provider value={outer || pad}>
      <View style={{ flex: 1, paddingBottom: pad ? bottom : 0 }}>{children}</View>
    </Inset.Provider>
  )
}
