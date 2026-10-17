import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { RootScreen } from '../screens/root/RootScreen'
import { useColors } from '../theme'
import { deps } from './deps'
import { runReminders } from './reminders'

export function App() {
  const colors = useColors()
  // Reminders follow the signed-in owner's cars for as long as the app runs.
  useEffect(() => runReminders(deps.reminders), [])
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <RootScreen />
      </SafeAreaView>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
