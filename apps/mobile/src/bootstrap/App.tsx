import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { ServiceLogScreen } from '../screens/service-log/ServiceLogScreen'

export function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <ServiceLogScreen vehicleId="demo" />
      </SafeAreaView>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
