import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { RootScreen } from '../screens/root/RootScreen'
import { useColors } from '../theme'

export function App() {
  const colors = useColors()
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <RootScreen />
      </SafeAreaView>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
