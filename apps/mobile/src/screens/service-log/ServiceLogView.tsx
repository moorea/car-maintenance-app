import type { ServiceLogActions, ServiceLogState, ServiceRecord } from '@car/core'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { TextField } from '../../ui/TextField'

type Props = ServiceLogState & Pick<ServiceLogActions, 'setField' | 'save'>

const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`

function RecordRow({ record }: { record: ServiceRecord }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{record.performedOn}</Text>
      <Text style={styles.rowMeta}>
        {[
          record.odometerMiles !== undefined ? `${record.odometerMiles.toLocaleString()} mi` : null,
          record.shop,
          record.costCents !== undefined ? formatCost(record.costCents) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
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
    <FlatList
      contentContainerStyle={styles.container}
      data={records}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <RecordRow record={item} />}
      ListHeaderComponent={
        <View style={styles.form}>
          <Text style={styles.heading}>Log service</Text>
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
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            disabled={status === 'saving'}
            onPress={() => void save()}
          >
            <Text style={styles.buttonText}>{status === 'saving' ? 'Saving…' : 'Save'}</Text>
          </Pressable>
          <Text style={styles.heading}>History</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.rowMeta}>No service logged yet.</Text>}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  container: { padding: 16 },
  form: { marginBottom: 8 },
  heading: { fontSize: 20, fontWeight: '700', marginVertical: 12 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#c8c8c8' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  button: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  error: { color: '#c62828', marginBottom: 8 },
})
