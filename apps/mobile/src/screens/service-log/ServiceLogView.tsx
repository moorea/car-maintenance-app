import type { LogEntry, LogGroup, ServiceLogActions, ServiceLogState } from '@car/core'
import { BottomSheet, Button, Column, Picker, Row, ScrollView, Spacer, Text } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { SearchField } from '../../ui/SearchField'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { TextField } from '../../ui/TextField'
import { Card, FillColumn, GlassIconButton, Separator } from '../../ui/surfaces'

type Props = ServiceLogState &
  Pick<ServiceLogActions, 'setField' | 'save' | 'openForm' | 'closeForm' | 'setQuery'> & {
    carName: string
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

/** Pure rendering of the service log model: totals, history by month, and the log form. */
export function ServiceLogView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column spacing={16} style={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE }}>
          <Row alignment="center">
            <Spacer flexible />
            <GlassIconButton symbol="plus" onPress={() => props.openForm()} />
          </Row>
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {props.carName.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Service log</Text>
          </Column>
          <Row spacing={10}>
            <Stat label={props.summary.spentLabel} value={props.summary.spent} />
            <Stat label="Services logged" value={String(props.summary.count)} />
          </Row>
          {props.summary.count > 0 ? (
            <SearchField
              value={props.query}
              onChangeText={props.setQuery}
              placeholder="Search services, shops, notes"
            />
          ) : null}
          <History {...props} />
        </Column>
      </ScrollView>
      <BottomSheet
        isPresented={props.adding}
        onDismiss={props.closeForm}
        snapPoints={['full']}
        contentPadding={0}
      >
        <LogForm {...props} />
      </BottomSheet>
    </Host>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors()
  return (
    <FillColumn>
      <Card padding={14} spacing={2}>
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text>
        <Text textStyle={{ fontSize: 24, fontWeight: '700' }}>{value}</Text>
      </Card>
    </FillColumn>
  )
}

function History({ groups, summary, query }: Props) {
  if (summary.count === 0) return <Note>No services logged yet. Tap + to add one.</Note>
  if (groups.length === 0) return <Note>{`Nothing matches "${query.trim()}".`}</Note>
  return (
    <>
      {groups.map((g) => (
        <Group key={g.label} group={g} />
      ))}
    </>
  )
}

function Group({ group }: { group: LogGroup }) {
  const colors = useColors()
  return (
    <Column spacing={8}>
      <Text
        textStyle={{ ...OVERLINE, color: colors.textSecondary }}
        style={{ paddingHorizontal: 4 }}
      >
        {group.label.toUpperCase()}
      </Text>
      <Card padding={0}>
        {group.entries.map((e, i) => (
          <Fragment key={e.id}>
            {i > 0 ? <Separator inset={68} /> : null}
            <EntryRow entry={e} />
          </Fragment>
        ))}
      </Card>
    </Column>
  )
}

function EntryRow({ entry }: { entry: LogEntry }) {
  const colors = useColors()
  return (
    <Row alignment="center" spacing={12} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
      <Column
        alignment="center"
        style={{
          width: 40,
          paddingVertical: 5,
          borderRadius: 13,
          backgroundColor: colors.accentSubtle,
        }}
      >
        <Text textStyle={{ fontSize: 10, fontWeight: '700', color: colors.accent }}>
          {entry.month.toUpperCase()}
        </Text>
        <Text textStyle={{ fontSize: 16, fontWeight: '700', color: colors.accent }}>
          {entry.day}
        </Text>
      </Column>
      <FillColumn spacing={2}>
        <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{entry.what}</Text>
        {entry.where ? (
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{entry.where}</Text>
        ) : null}
      </FillColumn>
      {entry.cost ? (
        <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>{entry.cost}</Text>
      ) : null}
    </Row>
  )
}

const OTHER = ''

function LogForm({
  draft,
  fieldErrors,
  saveError,
  status,
  tasks,
  setField,
  save,
  closeForm,
}: Props) {
  return (
    <ScrollView>
      <Column spacing={12} style={{ padding: 16 }}>
        <Row alignment="center">
          <Button variant="text" label="Cancel" onPress={closeForm} />
          <Spacer flexible />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Log a service</Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={status === 'saving' ? 'Saving…' : 'Save'}
            disabled={status === 'saving'}
            onPress={() => void save()}
          />
        </Row>
        {tasks.length > 0 ? (
          <Column spacing={4}>
            <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>What was done</Text>
            <Picker
              selectedValue={draft.itemId}
              onValueChange={(v) => setField('itemId', String(v))}
            >
              {[
                ...tasks.map((t) => <Picker.Item key={t.id} label={t.task} value={t.id} />),
                <Picker.Item key="other" label="Something else" value={OTHER} />,
              ]}
            </Picker>
          </Column>
        ) : null}
        <TextField
          label={draft.itemId === OTHER ? 'What was done' : 'Notes (optional)'}
          value={draft.notes}
          onChangeText={(v) => setField('notes', v)}
          error={fieldErrors.notes}
          placeholder={draft.itemId === OTHER ? 'e.g. Wiper blades' : ''}
        />
        <TextField
          label="Date"
          value={draft.performedOn}
          onChangeText={(v) => setField('performedOn', v)}
          error={fieldErrors.performedOn}
          placeholder="YYYY-MM-DD"
        />
        <TextField
          label="Odometer (miles)"
          value={draft.odometerMiles}
          onChangeText={(v) => setField('odometerMiles', v)}
          error={fieldErrors.odometerMiles}
          keyboardType="number-pad"
        />
        <TextField
          label="Cost ($)"
          value={draft.cost}
          onChangeText={(v) => setField('cost', v)}
          error={fieldErrors.cost}
          keyboardType="decimal-pad"
        />
        <TextField
          label="Shop"
          value={draft.shop}
          onChangeText={(v) => setField('shop', v)}
          error={fieldErrors.shop}
          placeholder="Leave blank if you did it yourself"
        />
        {saveError ? <ErrorText>{saveError}</ErrorText> : null}
      </Column>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
