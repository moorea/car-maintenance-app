import type { AddCarActions, AddCarState } from '@car/core'
import { Column, Row, ScrollView, Spacer, Switch } from '@expo/ui'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { GlassIconButton } from '../../ui/surfaces'
import { TextField } from '../../ui/TextField'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = AddCarState &
  Pick<
    AddCarActions,
    'setVin' | 'lookUpVin' | 'enterManually' | 'back' | 'setField' | 'setSevereDuty' | 'save'
  > & {
    onCancel?: (() => void) | undefined
    /** Opens the account, so an owner with no car can still sign out or delete it. */
    onAccount?: (() => void) | undefined
  }

const TITLE = { fontSize: 24, fontWeight: '700' } as const

/** Pure rendering of the add car model: the VIN step, then the details to check and save. */
export function AddCarView(props: Props) {
  return (
    <Host style={{ flex: 1 }}>
      <ScrollView>
        <Column spacing={16} style={{ padding: 16 }}>
          {props.onAccount ? (
            <Row alignment="center">
              <Spacer flexible />
              <GlassIconButton symbol="person" label="Account" onPress={props.onAccount} />
            </Row>
          ) : null}
          {props.step === 'vin' ? <VinStep {...props} /> : <DetailsStep {...props} />}
        </Column>
      </ScrollView>
    </Host>
  )
}

function VinStep({
  vin,
  busy,
  fieldErrors,
  error,
  setVin,
  lookUpVin,
  enterManually,
  onCancel,
}: Props) {
  return (
    <>
      {/* Without a way back, this is the first car: the first thing a new owner does. */}
      <Text textStyle={TITLE}>{onCancel ? 'Add your car' : 'Add your first car'}</Text>
      <Text>
        Enter your VIN and we'll look up the exact model, so your schedule and recalls match your
        car. No VIN to hand? Enter the year, make and model instead.
      </Text>
      <TextField
        label="VIN"
        value={vin}
        onChangeText={setVin}
        error={fieldErrors.vin}
        placeholder="17 letters and numbers"
        autoCapitalize="characters"
      />
      <Note>
        It's on the dashboard by the windshield on the driver's side, on the driver's door frame,
        and on your registration and insurance card.
      </Note>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label={busy ? 'Looking up…' : 'Look up VIN'}
        disabled={busy}
        onPress={() => void lookUpVin()}
      />
      <Button
        variant="text"
        label="Enter year, make and model instead"
        disabled={busy}
        onPress={enterManually}
      />
      {onCancel ? (
        <Button variant="text" label="Cancel" disabled={busy} onPress={onCancel} />
      ) : null}
    </>
  )
}

function DetailsStep(props: Props) {
  const { decoded, draft, severeDuty, busy, fieldErrors, error, setField } = props
  const found = decoded && [decoded.engine, decoded.drivetrain].filter(Boolean).join(' · ')
  const defaultName = [draft.year, draft.make, draft.model].filter(Boolean).join(' ')
  return (
    <>
      <Text textStyle={TITLE}>{decoded ? 'Is this your car?' : 'Your car'}</Text>
      {decoded ? <Note>{`From VIN ${decoded.vin}${found ? `. ${found}` : ''}`}</Note> : null}
      <TextField
        label="Year"
        value={draft.year}
        onChangeText={(v) => setField('year', v)}
        error={fieldErrors.year}
        placeholder="e.g. 2019"
        keyboardType="number-pad"
      />
      <TextField
        label="Make"
        value={draft.make}
        onChangeText={(v) => setField('make', v)}
        error={fieldErrors.make}
        placeholder="e.g. Toyota"
        autoCapitalize="words"
      />
      <TextField
        label="Model"
        value={draft.model}
        onChangeText={(v) => setField('model', v)}
        error={fieldErrors.model}
        placeholder="e.g. RAV4"
        autoCapitalize="words"
      />
      <TextField
        label="Trim (optional)"
        value={draft.trim}
        onChangeText={(v) => setField('trim', v)}
        error={fieldErrors.trim}
        placeholder="e.g. XLE"
        autoCapitalize="words"
      />
      <TextField
        label="Current mileage (optional)"
        value={draft.odometerMiles}
        onChangeText={(v) => setField('odometerMiles', v)}
        error={fieldErrors.odometerMiles}
        placeholder="e.g. 36000"
        keyboardType="number-pad"
      />
      <Note>
        It's on your dashboard. What's due and when your reminders come both follow your mileage, so
        adding it now gets them right from the start.
      </Note>
      <TextField
        label="Nickname (optional)"
        value={draft.nickname}
        onChangeText={(v) => setField('nickname', v)}
        error={fieldErrors.nickname}
        placeholder={defaultName || 'My car'}
        autoCapitalize="words"
      />
      <Switch value={severeDuty} onValueChange={props.setSevereDuty} label="Severe driving" />
      <Note>
        Mostly short trips, stop-and-go traffic, towing, dusty roads or extreme heat. Uses the
        shorter service intervals.
      </Note>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label={busy ? 'Saving…' : 'Save car'}
        disabled={busy}
        onPress={() => void props.save()}
      />
      <Button variant="text" label="Back" disabled={busy} onPress={props.back} />
    </>
  )
}
