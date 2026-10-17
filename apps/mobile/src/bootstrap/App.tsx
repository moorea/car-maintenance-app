import { StatusBar } from 'expo-status-bar'
import { Text } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { ServiceLogScreen } from '../screens/service-log/ServiceLogScreen'
import { mode } from './deps'

export function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        {mode === 'demo' ? (
          <ServiceLogScreen vehicleId="demo" />
        ) : (
          // Records need a signed-in owner and a real vehicle; sign-in and onboarding come next.
          <Text style={{ padding: 16 }}>Sign-in is coming soon.</Text>
        )}
      </SafeAreaView>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
