import type { SessionActions, SessionState } from '@car/core'
import { Button, Column, Host, Row, Spacer, Text } from '@expo/ui'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
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
      <Host matchContents={{ vertical: true }}>
        <Row
          alignment="center"
          style={{ width: '100%', paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text textStyle={{ fontSize: 18, fontWeight: '700' }}>
            {vehicle?.nickname ?? 'Your car'}
          </Text>
          <Spacer flexible />
          <Button variant="text" label="Sign out" onPress={() => void signOut()} />
        </Row>
      </Host>
      {status === 'ready' && vehicle ? (
        <ServiceLogScreen vehicleId={vehicle.id} />
      ) : (
        <View style={styles.fill}>
          {status === 'syncing' ? <ActivityIndicator style={styles.spinner} /> : null}
          <Host style={styles.fill}>
            <Column spacing={16} alignment="center" style={{ padding: 16 }}>
              <Text textStyle={{ textAlign: 'center' }}>
                {status === 'syncing'
                  ? 'Getting your cars. This needs a connection the first time.'
                  : `You're signed in as ${user?.email ?? 'you'}. Adding your car is coming next.`}
              </Text>
              <Spacer flexible />
            </Column>
          </Host>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spinner: { paddingTop: 32 },
})
