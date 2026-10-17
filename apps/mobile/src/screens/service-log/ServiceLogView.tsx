import type { ServiceLogActions, ServiceLogState, ServiceRecord } from '@car/core'
import { Button, Column, ScrollView, Text } from '@expo/ui'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { TextField } from '../../ui/TextField'

type Props = ServiceLogState & Pick<ServiceLogActions, 'setField' | 'save'>

const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`

function RecordRow({ record }: { record: ServiceRecord }) {
  return (
    <Column spacing={2} style={{ paddingVertical: 10 }}>
      <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>{record.performedOn}</Text>
      <Note>
        {[
          record.odometerMiles !== undefined ? `${record.odometerMiles.toLocaleString()} mi` : null,
          record.shop,
          record.costCents !== undefined ? formatCost(record.costCents) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Note>
    </Column>
  )
}

/** Pure rendering of the service log model's state. */
export function ServiceLogView({
  status,
  records,
  draft,
  fieldErrors,
  saveError,
  setField,
  save,
}: Props) {
  if (status === 'loading') return <ActivityIndicator style={styles.center} />

  return (
    <Host style={styles.center}>
      <ScrollView>
        <Column spacing={12} style={{ padding: 16 }}>
          <Text textStyle={{ fontSize: 20, fontWeight: '700' }}>Log service</Text>
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
          />
          {saveError ? <ErrorText>{saveError}</ErrorText> : null}
          <Button
            label={status === 'saving' ? 'Saving…' : 'Save'}
            disabled={status === 'saving'}
            onPress={() => void save()}
          />
          <Text textStyle={{ fontSize: 20, fontWeight: '700' }}>History</Text>
          {records.length === 0 ? (
            <Note>No service logged yet.</Note>
          ) : (
            records.map((r) => <RecordRow key={r.id} record={r} />)
          )}
        </Column>
      </ScrollView>
    </Host>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1 },
})
