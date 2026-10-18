import type { LogEntry, LogGroup, ServiceLogActions, ServiceLogState } from '@car/core'
import { BottomSheet, Button, Column, Picker, Row, ScrollView, Spacer } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { SearchField } from '../../ui/SearchField'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { TextField } from '../../ui/TextField'
import { Card, FillColumn, GlassIconButton, Separator } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import { ActionMenu } from '../../ui/ActionMenu'
import {
  AttachMenu,
  AttachmentRows,
  AttachStatus,
  sourceActions,
  type AttachmentsProps,
} from '../attachments/AttachmentList'
import { Reflow } from '../../ui/Reflow'
import { Text } from '../../ui/Text'

type Props = ServiceLogState &
  Pick<
    ServiceLogActions,
    | 'setField'
    | 'save'
    | 'openForm'
    | 'closeForm'
    | 'setQuery'
    | 'addReceipt'
    | 'removeReceipt'
    | 'openEntry'
    | 'closeEntry'
  > & {
    carName: string
    /** What is attached to the car's services. */
    attachments: AttachmentsProps
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

/**
 * Pure rendering of the service log model: totals, history by month, the log form, and a sheet
 * with a logged service's receipts.
 */
export function ServiceLogView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column spacing={16} style={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE }}>
          <Row alignment="center">
            <Spacer flexible />
            <GlassIconButton symbol="plus" label="Log service" onPress={() => props.openForm()} />
          </Row>
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {props.carName.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Service log</Text>
          </Column>
          <Reflow spacing={10}>
            <Stat label={props.summary.spentLabel} value={props.summary.spent} />
            <Stat label="Services logged" value={String(props.summary.count)} />
          </Reflow>
          {props.receiptError && !props.adding ? <ErrorText>{props.receiptError}</ErrorText> : null}
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
      <BottomSheet
        isPresented={props.openEntryId !== undefined}
        onDismiss={props.closeEntry}
        snapPoints={['half', 'full']}
        contentPadding={0}
      >
        <EntrySheet {...props} />
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

function History({ groups, summary, query, attachments, openEntry }: Props) {
  if (summary.count === 0) return <Note>No services logged yet. Tap + to add one.</Note>
  if (groups.length === 0) return <Note>{`Nothing matches "${query.trim()}".`}</Note>
  return (
    <>
      {groups.map((g) => (
        <Group key={g.label} group={g} receipts={attachments.byService} onOpen={openEntry} />
      ))}
    </>
  )
}

interface GroupProps {
  group: LogGroup
  receipts: AttachmentsProps['byService']
  onOpen: (id: string) => void
}

function Group({ group, receipts, onOpen }: GroupProps) {
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
            <EntryRow
              entry={e}
              receipts={receipts[e.id]?.length ?? 0}
              onPress={() => onOpen(e.id)}
            />
          </Fragment>
        ))}
      </Card>
    </Column>
  )
}

interface EntryRowProps {
  entry: LogEntry
  receipts: number
  onPress?: () => void
}

function EntryRow({ entry, receipts, onPress }: EntryRowProps) {
  const colors = useColors()
  return (
    <Row
      alignment="center"
      spacing={12}
      style={{ paddingHorizontal: 16, paddingVertical: 12 }}
      {...(onPress ? { onPress } : {})}
    >
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
      <Column alignment="end" spacing={2}>
        {entry.cost ? (
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>{entry.cost}</Text>
        ) : null}
        {receipts > 0 ? (
          <Row alignment="center" spacing={3}>
            <Symbol name="receipt" size={12} color={colors.textSecondary} />
            <Text textStyle={{ fontSize: 12, color: colors.textSecondary }}>
              {receipts === 1 ? 'Receipt' : `${receipts} receipts`}
            </Text>
          </Row>
        ) : null}
      </Column>
    </Row>
  )
}

/** A logged service with its receipts and photos, where more can be attached. */
function EntrySheet({ groups, openEntryId, closeEntry, attachments }: Props) {
  const colors = useColors()
  const entry = groups.flatMap((g) => g.entries).find((e) => e.id === openEntryId)
  if (!entry) return null
  const items = attachments.byService[entry.id] ?? []
  return (
    <ScrollView>
      <Column spacing={14} style={{ padding: 16 }}>
        <Row alignment="center">
          <Spacer flexible />
          <Button variant="text" label="Done" onPress={closeEntry} />
        </Row>
        <Card padding={0}>
          <EntryRow entry={entry} receipts={0} />
        </Card>
        <Row alignment="center" style={{ paddingHorizontal: 4 }}>
          <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>RECEIPTS AND PHOTOS</Text>
          <Spacer flexible />
          <AttachMenu
            attach={attachments.attach}
            target={{ kind: 'receipt', serviceRecordId: entry.id }}
            label="Attach a receipt or photo"
            variant="icon"
          />
        </Row>
        {items.length > 0 ? (
          <AttachmentRows {...attachments} items={items} />
        ) : (
          <Note>Attach the receipt or a photo of the work, so it is here when you need it.</Note>
        )}
        <AttachStatus adding={attachments.adding} error={attachments.error} />
      </Column>
    </ScrollView>
  )
}

const OTHER = ''

function LogForm({
  draft,
  fieldErrors,
  saveError,
  status,
  tasks,
  receipts,
  receiptError,
  setField,
  save,
  closeForm,
  addReceipt,
  removeReceipt,
}: Props) {
  const colors = useColors()
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
          label={
            draft.itemId !== OTHER
              ? 'Notes (optional)'
              : tasks.length > 0
                ? 'Describe it'
                : 'What was done'
          }
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
        <Column spacing={4}>
          <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>Receipts and photos</Text>
          {receipts.map((r, i) => (
            <Row key={`${r.uri}-${i}`} alignment="center" spacing={8}>
              <Symbol
                name={r.contentType === 'application/pdf' ? 'document' : 'photo'}
                size={16}
                color={colors.accent}
              />
              <FillColumn>
                <Text textStyle={{ fontSize: 15 }}>{r.name}</Text>
              </FillColumn>
              <Button variant="text" label="Remove" onPress={() => removeReceipt(i)} />
            </Row>
          ))}
          <Row>
            <ActionMenu
              label="Add receipt"
              symbol="paperclip"
              variant="text"
              groups={[
                {
                  title: 'Add receipt',
                  symbol: 'paperclip',
                  actions: sourceActions((source) => void addReceipt(source)),
                },
              ]}
            />
          </Row>
          {receiptError ? <ErrorText>{receiptError}</ErrorText> : null}
        </Column>
        {saveError ? <ErrorText>{saveError}</ErrorText> : null}
      </Column>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
