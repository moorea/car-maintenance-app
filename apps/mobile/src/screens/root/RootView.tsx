import type { AppTab, SessionActions, SessionState, Vehicle } from '@car/core'
import { Button, Row, Text } from '@expo/ui'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { AccountScreen } from '../account/AccountScreen'
import { AddCarScreen } from '../add-car/AddCarScreen'
import { AskScreen } from '../ask/AskScreen'
import { CarScreen } from '../car/CarScreen'
import { GarageScreen } from '../garage/GarageScreen'
import { QuoteCheckScreen } from '../quote-check/QuoteCheckScreen'
import { RemindersScreen } from '../reminders/RemindersScreen'
import { ServiceLogScreen } from '../service-log/ServiceLogScreen'
import { SignInScreen } from '../sign-in/SignInScreen'
import { WarrantyScreen } from '../warranty/WarrantyScreen'
import { askModelFor } from '../../models/askModels'
import { Host } from '../../ui/Host'
import { TabBar, type TabBarItem } from '../../ui/TabBar'

type Props = SessionState &
  Pick<
    SessionActions,
    | 'openTab'
    | 'back'
    | 'openCar'
    | 'logService'
    | 'logRequestHandled'
    | 'addCar'
    | 'cancelAddCar'
    | 'carAdded'
  >

const TABS: TabBarItem<AppTab>[] = [
  { key: 'garage', label: 'Garage', symbol: 'garage' },
  { key: 'log', label: 'Log', symbol: 'log' },
  { key: 'car', label: 'Car', symbol: 'car' },
]

/** Picks the screen for the session: sign-in, adding a car, or the tabs for the selected car. */
export function RootView(props: Props) {
  const { status, user, vehicles, selectedVehicleId, addingCar } = props
  if (status === 'starting') return <ActivityIndicator style={styles.fill} />
  if (status === 'signed-out' || !user) return <SignInScreen />

  const vehicle = vehicles.find((v) => v.id === selectedVehicleId)
  if (status === 'ready' && vehicle && !addingCar) {
    return (
      <View style={styles.fill}>
        <TabContent {...props} vehicle={vehicle} />
        {/* Ask and the quote checker fill the screen with their own back button, as in the mockup. */}
        {props.tab === 'ask' || props.tab === 'quote' ? null : (
          <TabBar
            tabs={TABS}
            // The warranty page belongs to the car, so the car's tab stays selected there.
            selected={props.tab === 'warranty' ? 'car' : props.tab}
            onSelect={props.openTab}
            action={{ symbol: 'ask', onPress: () => props.openTab('ask'), selected: false }}
          />
        )}
      </View>
    )
  }
  // Without a car there is no garage to open the account from, yet the owner must still be able
  // to sign out or delete it (App Store guideline 5.1.1(v)), so it opens over the first screens.
  if (props.tab === 'account') {
    return <AccountScreen onBack={() => props.openTab('garage')} />
  }
  if (status === 'syncing') {
    return (
      <View style={styles.fill}>
        <ActivityIndicator style={styles.spinner} />
        <Host matchContents={{ vertical: true }}>
          <Row style={{ padding: 16 }}>
            <Text textStyle={{ textAlign: 'center' }}>
              Getting your cars. This needs a connection the first time.
            </Text>
          </Row>
          <Button variant="text" label="Account" onPress={() => props.openTab('account')} />
        </Host>
      </View>
    )
  }
  return (
    <AddCarScreen
      ownerId={user.id}
      onAdded={props.carAdded}
      onCancel={status === 'ready' ? props.cancelAddCar : undefined}
      onAccount={status === 'ready' ? undefined : () => props.openTab('account')}
    />
  )
}

function TabContent(props: Props & { vehicle: Vehicle }) {
  const { vehicle } = props
  switch (props.tab) {
    case 'garage':
      return (
        <GarageScreen
          vehicles={props.vehicles}
          vehicle={vehicle}
          onOpenCar={props.openCar}
          onAddCar={props.addCar}
          onReminders={() => props.openTab('reminders')}
          onLogService={props.logService}
          onAsk={() => props.openTab('ask')}
          onAccount={() => props.openTab('account')}
        />
      )
    case 'log':
      return (
        <ServiceLogScreen
          vehicle={vehicle}
          request={props.logRequest}
          onRequestHandled={props.logRequestHandled}
        />
      )
    case 'car':
      return (
        <CarScreen
          vehicle={vehicle}
          onCheckQuote={() => props.openTab('quote')}
          onWarranty={() => props.openTab('warranty')}
        />
      )
    case 'warranty':
      return <WarrantyScreen vehicle={vehicle} onBack={() => props.openTab('car')} />
    case 'ask':
      return <AskScreen vehicle={vehicle} onBack={props.back} />
    case 'quote':
      return (
        <QuoteCheckScreen
          vehicle={vehicle}
          onBack={props.back}
          onAsk={(question) => {
            props.openTab('ask')
            const ask = askModelFor(vehicle).getState()
            // While Ask is still answering, the question waits in the composer to send.
            if (ask.status === 'ready') ask.ask(question)
            else ask.setDraft(question)
          }}
        />
      )
    case 'reminders':
      return <RemindersScreen />
    case 'account':
      return <AccountScreen onReminders={() => props.openTab('reminders')} />
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spinner: { paddingTop: 32 },
})
