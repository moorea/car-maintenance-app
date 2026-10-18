import type { RemindersActions, RemindersState, UpcomingReminder } from '@car/core'
import { Column, Row, ScrollView, Switch } from '@expo/ui'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { Host } from '../../ui/Host'
import { Note } from '../../ui/Note'
import { GlassIconButton } from '../../ui/surfaces'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { TITLE_TOP } from '../../ui/layout'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = RemindersState &
  Pick<RemindersActions, 'setOn' | 'openSettings'> & {
    onBack: () => void
  }

const HEADING = { fontSize: 20, fontWeight: '700' } as const
const LABEL = { fontSize: 13, fontWeight: '600' } as const

/** Pure rendering of the reminders model: the on/off switch and what is coming up. */
export function RemindersView(props: Props) {
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={12}
          style={{ padding: 16, paddingTop: TITLE_TOP, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Row>
            <GlassIconButton symbol="back" label="Back" onPress={props.onBack} />
          </Row>
          <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Reminders</Text>
          <Switch
            label="Service reminders"
            value={props.on}
            disabled={props.status !== 'ready'}
            onValueChange={(on) => void props.setOn(on)}
          />
          <Note>
            Two weeks before each service is due and on the day; a month and a week before each
            registration, inspection or insurance date and on the day; and a month and a week before
            a warranty ends. They're worked out on this phone, so they arrive even without signal.
          </Note>
          {props.blocked ? (
            <Column spacing={8}>
              <Text>Notifications are turned off for this app in your phone's settings.</Text>
              <Button variant="outlined" label="Open Settings" onPress={props.openSettings} />
            </Column>
          ) : null}
          {props.on ? <ComingUp upcoming={props.upcoming} /> : null}
        </Column>
      </ScrollView>
    </Host>
  )
}

function ComingUp({ upcoming }: { upcoming: UpcomingReminder[] }) {
  return (
    <Column spacing={12}>
      <Text textStyle={HEADING}>Coming up</Text>
      {upcoming.length === 0 ? (
        <Note>Nothing is due in the coming months.</Note>
      ) : (
        upcoming.map((r) => (
          <Column key={r.id} spacing={2}>
            <Text textStyle={LABEL}>{`${r.when} · ${r.title}`}</Text>
            <Text>{r.body}</Text>
          </Column>
        ))
      )}
    </Column>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
