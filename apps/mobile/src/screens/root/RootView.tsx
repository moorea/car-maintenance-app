import type { SessionActions, SessionState } from '@car/core'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../ui/Button'
import { ServiceLogScreen } from '../service-log/ServiceLogScreen'
import { SignInScreen } from '../sign-in/SignInScreen'

type Props = SessionState & Pick<SessionActions, 'signOut'>

/** Picks the screen for the session: sign-in, a prompt to add a car, or the selected car. */
export function RootView({ status, user, vehicles, selectedVehicleId, signOut }: Props) {
  if (status === 'starting') return <ActivityIndicator style={styles.fill} />
  if (status === 'signed-out') return <SignInScreen />

  const vehicle = vehicles.find((v) => v.id === selectedVehicleId)
  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Text style={styles.title}>{vehicle?.nickname ?? 'Your car'}</Text>
        <Button variant="link" label="Sign out" onPress={() => void signOut()} />
      </View>
      {status === 'ready' && vehicle ? (
        <ServiceLogScreen vehicleId={vehicle.id} />
      ) : (
        <Text style={styles.empty}>
          You're signed in as {user?.email ?? 'you'}. Adding your car is coming next.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: { fontSize: 18, fontWeight: '700' },
  empty: { padding: 16, fontSize: 15, color: '#444' },
})
