import type { CoverageState, WarrantyActions, WarrantyRow, WarrantyState } from '@car/core'
import { BottomSheet, Column, Row, ScrollView, Spacer } from '@expo/ui'
import type { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { DateField } from '../../ui/DateField'
import { TextField } from '../../ui/TextField'
import { ChoiceField } from '../../ui/ChoiceField'
import { Symbol } from '../../ui/Symbol'
import { Card, FillColumn, GlassIconButton, PillButton, ProgressBar } from '../../ui/surfaces'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = WarrantyState &
  Pick<
    WarrantyActions,
    'openNew' | 'openEdit' | 'setField' | 'closeForm' | 'save' | 'remove' | 'shareReport'
  > & {
    carName: string
    onBack: () => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const STATUS_COLOR: Record<CoverageState, ColorRole> = {
  active: 'textSecondary',
  'ending-soon': 'warning',
  ended: 'textSecondary',
}
const BAR_COLOR: Record<CoverageState, ColorRole> = {
  active: 'accent',
  'ending-soon': 'warning',
  ended: 'textSecondary',
}

/** Pure rendering of the warranty model: coverage left, the care report, and the edit sheet. */
export function WarrantyView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />
  const preparing = props.report.status === 'preparing'

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
            <GlassIconButton symbol="plus" label="Add warranty" onPress={props.openNew} />
          </Row>
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {props.carName.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Warranty</Text>
          </Column>

          <Section title="COVERAGE">
            {props.rows.length === 0 ? (
              <Card>
                <Note>
                  Add each coverage from your warranty booklet or contract, such as bumper-to-bumper
                  and powertrain, to see how much is left. Tap + to start.
                </Note>
              </Card>
            ) : (
              props.rows.map((row) => (
                <CoverageRow key={row.id} row={row} onPress={() => props.openEdit(row.id)} />
              ))
            )}
          </Section>

          <Section title="PROOF OF CARE">
            <Card spacing={12}>
              <Row alignment="center" spacing={12}>
                <Symbol name="shield" size={28} color={colors.accent} />
                <FillColumn spacing={2}>
                  <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Care report</Text>
                  <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>
                    A PDF of your service history against the schedule, with work you did yourself
                    and your warranties. For a warranty claim or a sale.
                  </Text>
                </FillColumn>
              </Row>
              <Row>
                <PillButton
                  label={preparing ? 'Preparing…' : 'Share care report'}
                  onPress={() => void props.shareReport()}
                  fill="accent"
                  text="onAccent"
                />
              </Row>
              {props.report.error ? <ErrorText>{props.report.error}</ErrorText> : null}
            </Card>
          </Section>
        </Column>
      </ScrollView>
      <BottomSheet
        isPresented={props.form !== undefined}
        onDismiss={props.closeForm}
        snapPoints={['full']}
        contentPadding={0}
      >
        <WarrantyForm {...props} />
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

function CoverageRow({ row, onPress }: { row: WarrantyRow; onPress: () => void }) {
  const colors = useColors()
  const ended = row.state === 'ended'
  return (
    <Card padding={14} onPress={onPress}>
      <Column spacing={6}>
        <Row alignment="center" spacing={12}>
          <FillColumn spacing={1}>
            <Text
              textStyle={{
                fontSize: 16,
                fontWeight: '600',
                color: ended ? colors.textSecondary : colors.textPrimary,
              }}
            >
              {row.title}
            </Text>
            {row.subtitle ? (
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{row.subtitle}</Text>
            ) : null}
          </FillColumn>
          <Symbol name="chevron" size={14} color={colors.textSecondary} />
        </Row>
        <ProgressBar value={row.used} fill={BAR_COLOR[row.state]} track="neutralSubtle" />
        <Text
          textStyle={{
            fontSize: 14,
            fontWeight: row.state === 'ending-soon' ? '600' : '400',
            color: colors[STATUS_COLOR[row.state]],
          }}
        >
          {row.status}
        </Text>
      </Column>
    </Card>
  )
}

function WarrantyForm({ form, kinds, setField, save, remove, closeForm }: Props) {
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
            {form.id ? 'Edit coverage' : 'Add coverage'}
          </Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={saving ? 'Saving…' : 'Save'}
            disabled={saving}
            onPress={() => void save()}
          />
        </Row>
        <Column spacing={4}>
          <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>What it covers</Text>
          <ChoiceField
            value={draft.kind}
            options={kinds.map((k) => ({ value: k.kind, label: k.label }))}
            onChange={(v) => setField('kind', v)}
          />
        </Column>
        <TextField
          label="Provider"
          value={draft.provider}
          onChangeText={(v) => setField('provider', v)}
          error={errors.provider}
          placeholder="The carmaker, or the warranty company"
        />
        <DateField
          label="Starts on"
          value={draft.startsOn}
          onChange={(v) => setField('startsOn', v)}
          error={errors.startsOn}
          placeholder="The day the car was first sold"
        />
        <Row spacing={10}>
          <FillColumn>
            <TextField
              label="Months"
              value={draft.months}
              onChangeText={(v) => setField('months', v)}
              error={errors.months}
              placeholder="e.g. 36"
              keyboardType="number-pad"
            />
          </FillColumn>
          <FillColumn>
            <TextField
              label="Ends at odometer (mi)"
              value={draft.endMiles}
              onChangeText={(v) => setField('endMiles', v)}
              error={errors.endMiles}
              placeholder="e.g. 36,000"
              keyboardType="number-pad"
            />
          </FillColumn>
        </Row>
        <Note>Leave one blank if the coverage has no time or no mileage limit.</Note>
        <TextField
          label="Policy or contract number"
          value={draft.policyNumber}
          onChangeText={(v) => setField('policyNumber', v)}
          error={errors.policyNumber}
          autoCapitalize="characters"
        />
        <TextField
          label="Notes"
          value={draft.notes}
          onChangeText={(v) => setField('notes', v)}
          error={errors.notes}
          placeholder="Claims phone number, deductible, what is excluded"
        />
        {form.error ? <ErrorText>{form.error}</ErrorText> : null}
        {form.id ? (
          <Column spacing={6} style={{ paddingTop: 8 }}>
            <Row>
              <PillButton
                label={form.confirmingDelete ? 'Tap again to delete' : 'Delete coverage'}
                onPress={() => void remove()}
                fill={form.confirmingDelete ? 'danger' : 'neutralSubtle'}
                text={form.confirmingDelete ? 'onDanger' : 'danger'}
              />
            </Row>
            {form.confirmingDelete ? (
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
                It leaves your care report too.
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
