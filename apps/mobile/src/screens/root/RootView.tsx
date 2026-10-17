import type { SessionActions, SessionState, Vehicle } from '@car/core'
import { Button, Picker, Row, Spacer, Text } from '@expo/ui'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { AddCarScreen } from '../add-car/AddCarScreen'
import { CarScreen } from '../car/CarScreen'
import { SignInScreen } from '../sign-in/SignInScreen'
import { Host } from '../../ui/Host'

type Props = SessionState &
  Pick<SessionActions, 'signOut' | 'selectVehicle' | 'addCar' | 'cancelAddCar' | 'carAdded'>

/** Picks the screen for the session: sign-in, adding a car, or the selected car. */
export function RootView(props: Props) {
  const { status, user, vehicles, selectedVehicleId, addingCar, signOut } = props
  if (status === 'starting') return <ActivityIndicator style={styles.fill} />
  if (status === 'signed-out' || !user) return <SignInScreen />

  const vehicle = vehicles.find((v) => v.id === selectedVehicleId)
  const showCar = status === 'ready' && vehicle && !addingCar
  return (
    <View style={styles.fill}>
      <Host matchContents={{ vertical: true }}>
        <Row
          alignment="center"
          spacing={8}
          style={{ width: '100%', paddingHorizontal: 16, paddingVertical: 8 }}
        >
          {showCar ? (
            <CarPicker vehicles={vehicles} selected={vehicle} onSelect={props.selectVehicle} />
          ) : (
            <Text textStyle={{ fontSize: 18, fontWeight: '700' }}>Car Maintenance</Text>
          )}
          <Spacer flexible />
          {showCar ? <Button variant="text" label="Add car" onPress={props.addCar} /> : null}
          <Button variant="text" label="Sign out" onPress={() => void signOut()} />
        </Row>
      </Host>
      {showCar ? (
        <CarScreen vehicle={vehicle} />
      ) : status === 'syncing' ? (
        <View style={styles.fill}>
          <ActivityIndicator style={styles.spinner} />
          <Host matchContents={{ vertical: true }}>
            <Row style={{ padding: 16 }}>
              <Text textStyle={{ textAlign: 'center' }}>
                Getting your cars. This needs a connection the first time.
              </Text>
            </Row>
          </Host>
        </View>
      ) : (
        <AddCarScreen
          ownerId={user.id}
          onAdded={props.carAdded}
          onCancel={status === 'ready' ? props.cancelAddCar : undefined}
        />
      )}
    </View>
  )
}

/** The selected car's name, or a menu to switch cars when the owner has more than one. */
function CarPicker(props: {
  vehicles: Vehicle[]
  selected: Vehicle
  onSelect: (id: string) => void
}) {
  if (props.vehicles.length < 2) {
    return <Text textStyle={{ fontSize: 18, fontWeight: '700' }}>{props.selected.nickname}</Text>
  }
  return (
    <Picker selectedValue={props.selected.id} onValueChange={props.onSelect}>
      {props.vehicles.map((v) => (
        <Picker.Item key={v.id} label={v.nickname} value={v.id} />
      ))}
    </Picker>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spinner: { paddingTop: 32 },
})
