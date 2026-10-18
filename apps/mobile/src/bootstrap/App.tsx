import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { SafeAreaProvider, SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { RootScreen } from '../screens/root/RootScreen'
import { useColors } from '../theme'
import { deps } from './deps'
import { runReminders } from './reminders'

// On iOS the app runs to the bottom edge, so lists scroll on behind the floating tab bar as in the
// mockups; screens without the tab bar keep clear of the home indicator with `BottomSafeArea`.
const EDGES: Edge[] =
  Platform.OS === 'ios' ? ['top', 'left', 'right'] : ['top', 'right', 'bottom', 'left']

export function App() {
  const colors = useColors()
  // Reminders follow the signed-in owner's cars for as long as the app runs.
  useEffect(() => runReminders(deps.reminders), [])
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={EDGES} style={{ flex: 1, backgroundColor: colors.background }}>
        <RootScreen />
      </SafeAreaView>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
