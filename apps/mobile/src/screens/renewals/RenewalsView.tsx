import type { RenewalRow, RenewalsActions, RenewalsState, RenewalState } from '@car/core'
import { BottomSheet, Column, Picker, Row, ScrollView, Spacer } from '@expo/ui'
import type { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Reflow } from '../../ui/Reflow'
import { Symbol } from '../../ui/Symbol'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { Text } from '../../ui/Text'
import { DateField } from '../../ui/DateField'
import { TextField } from '../../ui/TextField'
import { Card, FillColumn, GlassIconButton, PillButton } from '../../ui/surfaces'
import {
  AttachMenu,
  AttachmentRows,
  AttachStatus,
  type AttachmentsProps,
} from '../attachments/AttachmentList'
import { Button } from '../../ui/Button'

type Props = RenewalsState &
  Pick<
    RenewalsActions,
    'openNew' | 'openEdit' | 'setField' | 'closeForm' | 'save' | 'remove' | 'markRenewed'
  > & {
    carName: string
    documents: AttachmentsProps
    onBack: () => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const STATUS_COLOR: Record<RenewalState, ColorRole> = {
  overdue: 'warning',
  'due-soon': 'accent',
  upcoming: 'textSecondary',
}

/** What to call a renewal's paperwork on its attach button. */
const DOCUMENT_NAME: Record<string, string> = {
  registration: 'registration',
  inspection: 'inspection report',
  insurance: 'insurance card',
}

/** Pure rendering of a car's renewal dates, their paperwork, and the add and edit sheet. */
export function RenewalsView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={16}
          style={{ padding: 16, paddingTop: 60, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Row alignment="center">
            <GlassIconButton symbol="back" label="Back" onPress={props.onBack} />
            <Spacer flexible />
            <GlassIconButton symbol="plus" label="Add a date" onPress={() => props.openNew()} />
          </Row>
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {props.carName.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Renewals</Text>
          </Column>
          <Text textStyle={{ color: colors.textSecondary }}>
            Registration, inspection and insurance dates. With reminders on, you hear about each a
            month ahead, a week ahead and on the day.
          </Text>

          {props.notice ? (
            <Card fill="accentSubtle" padding={14}>
              <Row alignment="center" spacing={10}>
                <Symbol name="checkmark" size={18} color={colors.accent} />
                <FillColumn>
                  <Text textStyle={{ fontSize: 15 }}>{props.notice}</Text>
                </FillColumn>
              </Row>
            </Card>
          ) : null}
          {props.error ? <ErrorText>{props.error}</ErrorText> : null}

          {props.rows.length === 0 ? (
            <Card>
              <Note>
                Add the dates from your registration card, inspection sticker and insurance policy
                so they never sneak up on you.
              </Note>
            </Card>
          ) : (
            props.rows.map((row) => <RenewalCard key={row.id} {...props} row={row} />)
          )}
          <AttachStatus adding={props.documents.adding} error={props.documents.error} />

          {props.suggestions.length > 0 ? (
            <Section title="ADD">
              <Reflow spacing={8}>
                {props.suggestions.map((s) => (
                  <PillButton
                    key={s.kind}
                    label={s.label}
                    onPress={() => props.openNew(s.kind)}
                    fill="neutralSubtle"
                    text="accent"
                  />
                ))}
              </Reflow>
            </Section>
          ) : null}
        </Column>
      </ScrollView>
      <BottomSheet
        isPresented={props.form !== undefined}
        onDismiss={props.closeForm}
        snapPoints={['full']}
        contentPadding={0}
      >
        <RenewalForm {...props} />
      </BottomSheet>
    </Host>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors()
  return (
    <Column spacing={8}>
      <Text
        textStyle={{ ...OVERLINE, color: colors.textSecondary }}
        style={{ paddingHorizontal: 4 }}
      >
        {title}
      </Text>
      {children}
    </Column>
  )
}

function RenewalCard(props: Props & { row: RenewalRow }) {
  const { row, documents } = props
  const colors = useColors()
  const color = colors[STATUS_COLOR[row.state]]
  const papers = row.documentKind ? (documents.documentsByKind[row.documentKind] ?? []) : []
  const details = [row.repeat, row.notes].filter(Boolean).join(' · ')
  return (
    <Card padding={14} spacing={10}>
      <Row alignment="center" spacing={12}>
        <Symbol
          name={row.state === 'overdue' ? 'warning' : 'calendar'}
          size={22}
          color={color}
          leading
        />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{row.title}</Text>
          <Text
            textStyle={{
              fontSize: 15,
              fontWeight: row.state === 'upcoming' ? '400' : '600',
              color,
            }}
          >
            {row.status}
          </Text>
        </FillColumn>
        <Button variant="text" label="Edit" onPress={() => props.openEdit(row.id)} />
      </Row>
      {details ? <Note>{details}</Note> : null}
      {papers.length > 0 ? <AttachmentRows {...documents} items={papers} /> : null}
      <Reflow alignment="center" spacing={8}>
        {row.canRenew ? (
          <PillButton
            label="Renewed"
            onPress={() => void props.markRenewed(row.id)}
            fill="accent"
            text="onAccent"
          />
        ) : null}
        {row.documentKind ? (
          <AttachMenu
            attach={documents.attach}
            target={{ kind: row.documentKind }}
            label={`Attach ${DOCUMENT_NAME[row.documentKind] ?? 'a document'}`}
            variant="text"
          />
        ) : null}
      </Reflow>
    </Card>
  )
}

function RenewalForm({ form, kinds, repeats, setField, save, remove, closeForm }: Props) {
  const colors = useColors()
  if (!form) return null
  const { draft, fieldErrors: errors, saving } = form
  return (
    <ScrollView>
      <Column spacing={12} style={{ padding: 16 }}>
        <Row alignment="center">
          <Button variant="text" label="Cancel" disabled={saving} onPress={closeForm} />
          <Spacer flexible />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>
            {form.renewing ? 'Next date' : form.id ? 'Edit date' : 'Add a date'}
          </Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={saving ? 'Saving…' : 'Save'}
            disabled={saving}
            onPress={() => void save()}
          />
        </Row>
        {form.renewing ? (
          <Note>
            This one doesn’t repeat on a schedule, so enter the date on the new paperwork.
          </Note>
        ) : null}
        <Column spacing={4}>
          <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>What it is</Text>
          <Picker selectedValue={draft.kind} onValueChange={(v) => setField('kind', String(v))}>
            {kinds.map((k) => (
              <Picker.Item key={k.kind} label={k.label} value={k.kind} />
            ))}
          </Picker>
        </Column>
        {draft.kind === 'other' ? (
          <TextField
            label="Name"
            value={draft.title}
            onChangeText={(v) => setField('title', v)}
            error={errors.title}
            placeholder="Parking permit, toll pass, lease return"
          />
        ) : null}
        <DateField
          label={draft.kind === 'registration' ? 'Expires on' : 'Due on'}
          value={draft.dueOn}
          onChange={(v) => setField('dueOn', v)}
          error={errors.dueOn}
          placeholder="Choose the date on the paperwork"
        />
        <Column spacing={4}>
          <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>Repeats</Text>
          <Picker
            selectedValue={draft.everyMonths}
            onValueChange={(v) => setField('everyMonths', String(v))}
          >
            {repeats.map((r) => (
              <Picker.Item key={r.value} label={r.label} value={r.value} />
            ))}
          </Picker>
          {errors.everyMonths ? <ErrorText>{errors.everyMonths}</ErrorText> : null}
        </Column>
        <TextField
          label="Notes"
          value={draft.notes}
          onChangeText={(v) => setField('notes', v)}
          error={errors.notes}
          placeholder="Plate or policy number, insurer, where to renew"
          lines={2}
        />
        {form.error ? <ErrorText>{form.error}</ErrorText> : null}
        {form.id && !form.renewing ? (
          <Column spacing={6} style={{ paddingTop: 8 }}>
            <Row>
              <PillButton
                label={form.confirmingDelete ? 'Tap again to delete' : 'Delete date'}
                onPress={() => void remove()}
                fill={form.confirmingDelete ? 'danger' : 'neutralSubtle'}
                text={form.confirmingDelete ? 'onDanger' : 'danger'}
              />
            </Row>
            {form.confirmingDelete ? (
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
                Its reminders stop. Papers you attached stay with the car.
              </Text>
            ) : null}
          </Column>
        ) : null}
      </Column>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
