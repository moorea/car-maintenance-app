import type { AppTab, SessionActions, SessionState, Vehicle } from '@car/core'
import { Button, Row } from '@expo/ui'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { AccountScreen } from '../account/AccountScreen'
import { AddCarScreen } from '../add-car/AddCarScreen'
import { AiSharingGate } from '../ai-sharing/AiSharingScreen'
import { AskScreen } from '../ask/AskScreen'
import { CarScreen } from '../car/CarScreen'
import { DrivingScreen } from '../driving/DrivingScreen'
import { GarageScreen } from '../garage/GarageScreen'
import { QuoteCheckScreen } from '../quote-check/QuoteCheckScreen'
import { ReminderOfferGate } from '../reminder-offer/ReminderOfferScreen'
import { RemindersScreen } from '../reminders/RemindersScreen'
import { ServiceLogScreen } from '../service-log/ServiceLogScreen'
import { SignInScreen } from '../sign-in/SignInScreen'
import { TroubleCodesScreen } from '../trouble-codes/TroubleCodesScreen'
import { WarrantyScreen } from '../warranty/WarrantyScreen'
import { FuelScreen } from '../fuel/FuelScreen'
import { TiresScreen } from '../tires/TiresScreen'
import { RenewalsScreen } from '../renewals/RenewalsScreen'
import { YourDataScreen } from '../your-data/YourDataScreen'
import { askModelFor } from '../../models/askModels'
import { Host } from '../../ui/Host'
import { TabBar, type TabBarItem } from '../../ui/TabBar'
import { Text } from '../../ui/Text'

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
    | 'remindersOffered'
  >

const TABS: TabBarItem<AppTab>[] = [
  { key: 'garage', label: 'Garage', symbol: 'garage' },
  { key: 'log', label: 'Log', symbol: 'log' },
  { key: 'car', label: 'Car', symbol: 'car' },
]

const CAR_PAGES = new Set<AppTab>(['warranty', 'fuel', 'driving', 'tires', 'renewals'])

/** Picks the screen for the session: sign-in, adding a car, or the tabs for the selected car. */
export function RootView(props: Props) {
  const { status, user, vehicles, selectedVehicleId, addingCar } = props
  if (status === 'starting') return <ActivityIndicator style={styles.fill} />
  if (status === 'signed-out' || !user) return <SignInScreen />

  const vehicle = vehicles.find((v) => v.id === selectedVehicleId)
  if (status === 'ready' && vehicle && !addingCar) {
    const tabs = (
      <View style={styles.fill}>
        <TabContent {...props} vehicle={vehicle} />
        {/* Ask, the quote checker and the code lookup fill the screen with their own back button. */}
        {props.tab === 'ask' || props.tab === 'quote' || props.tab === 'codes' ? null : (
          <TabBar
            tabs={TABS}
            // The car's own pages (warranty, fuel, driving, tires, renewals) keep its tab selected.
            selected={CAR_PAGES.has(props.tab) ? 'car' : props.tab}
            onSelect={props.openTab}
            action={{
              symbol: 'ask',
              label: 'Ask',
              onPress: () => props.openTab('ask'),
              selected: false,
            }}
          />
        )}
      </View>
    )
    // Reminders become useful the moment there is a car, so they are offered then, once per phone.
    if (props.offerRemindersFor !== vehicle.id) return tabs
    return (
      <ReminderOfferGate
        carName={vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        onDone={props.remindersOffered}
      >
        {tabs}
      </ReminderOfferGate>
    )
  }
  // Without a car there is no garage to open the account from, yet the owner must still be able
  // to sign out or delete it (App Store guideline 5.1.1(v)), so it opens over the first screens.
  if (props.tab === 'account') {
    return (
      <AccountScreen
        onBack={() => props.openTab('garage')}
        // Until the first sync is done the garage looks empty, so an import would add every car
        // again and an export would leave them out.
        onYourData={status === 'no-vehicles' ? () => props.openTab('data') : undefined}
      />
    )
  }
  // An owner starting over can bring back the cars they exported before adding any.
  if (props.tab === 'data' && status === 'no-vehicles') {
    return <YourDataScreen onBack={() => props.openTab('account')} />
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
          onTroubleCodes={() => props.openTab('codes')}
          onWarranty={() => props.openTab('warranty')}
          onFuel={() => props.openTab('fuel')}
          onTires={() => props.openTab('tires')}
          onDriving={() => props.openTab('driving')}
          onRenewals={() => props.openTab('renewals')}
        />
      )
    case 'renewals':
      return <RenewalsScreen vehicle={vehicle} onBack={() => props.openTab('car')} />
    case 'fuel':
      return <FuelScreen vehicle={vehicle} onBack={() => props.openTab('car')} />
    case 'tires':
      return <TiresScreen vehicle={vehicle} onBack={() => props.openTab('car')} />
    case 'driving':
      return <DrivingScreen vehicle={vehicle} onBack={() => props.openTab('car')} />
    case 'warranty':
      return <WarrantyScreen vehicle={vehicle} onBack={() => props.openTab('car')} />
    case 'ask':
      return (
        <AiSharingGate feature="ask" onBack={props.back}>
          <AskScreen vehicle={vehicle} onBack={props.back} />
        </AiSharingGate>
      )
    case 'quote':
      return (
        <AiSharingGate feature="quote" onBack={props.back}>
          <QuoteCheckScreen
            vehicle={vehicle}
            onBack={props.back}
            onAsk={(question) => askAbout(props, vehicle, question)}
          />
        </AiSharingGate>
      )
    case 'codes':
      return (
        <TroubleCodesScreen
          vehicle={vehicle}
          onBack={props.back}
          onAsk={(question) => askAbout(props, vehicle, question)}
        />
      )
    case 'reminders':
      return <RemindersScreen />
    case 'account':
      return (
        <AccountScreen
          onReminders={() => props.openTab('reminders')}
          onYourData={() => props.openTab('data')}
        />
      )
    case 'data':
      return <YourDataScreen onBack={() => props.openTab('account')} />
  }
}

/** Opens Ask with a question from another screen, such as one line of a quote. */
function askAbout(props: Props, vehicle: Vehicle, question: string) {
  props.openTab('ask')
  const ask = askModelFor(vehicle).getState()
  // While Ask is still answering, the question waits in the composer to send.
  if (ask.status === 'ready') ask.ask(question)
  else ask.setDraft(question)
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spinner: { paddingTop: 32 },
})
