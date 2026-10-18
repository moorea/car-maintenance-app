import type {
  CostRow,
  EconomyTrend,
  EnergyKind,
  FillUpRow,
  FuelActions,
  FuelSection,
  FuelState,
} from '@car/core'
import { BottomSheet, Column, Row, ScrollView, Spacer, Switch } from '@expo/ui'
import { Fragment, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { StackedBars } from '../../ui/StackedBars'
import { Symbol } from '../../ui/Symbol'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { DateField } from '../../ui/DateField'
import { TextField } from '../../ui/TextField'
import { TrendChart } from '../../ui/TrendChart'
import { Card, Dot, FillColumn, GlassIconButton, PillButton, Separator } from '../../ui/surfaces'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = FuelState &
  Pick<
    FuelActions,
    | 'showSection'
    | 'showMoreRows'
    | 'openNew'
    | 'openEdit'
    | 'setField'
    | 'setFull'
    | 'setMissedPrevious'
    | 'closeForm'
    | 'save'
    | 'remove'
  > & {
    carName: string
    onBack: () => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const SECTIONS: { value: FuelSection; label: string }[] = [
  { value: 'fill-ups', label: 'Fill-ups' },
  { value: 'costs', label: 'Costs' },
]

const FUEL: ColorRole = 'accent'
const SERVICE: ColorRole = 'chartSecondary'

/** Pure rendering of the fuel model: running costs, economy, the fill-up log and its sheet. */
export function FuelView(props: Props) {
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
            <GlassIconButton symbol="plus" label="Log a fill-up" onPress={props.openNew} />
          </Row>
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {props.carName.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Fuel & costs</Text>
          </Column>

          <SummaryCard lastYear={props.lastYear} economy={props.economy} />

          <SegmentedControl
            options={SECTIONS}
            selected={props.section}
            onSelect={props.showSection}
          />
          {props.section === 'fill-ups' ? <FillUps {...props} /> : <Costs {...props} />}
        </Column>
      </ScrollView>
      <BottomSheet
        isPresented={props.form !== undefined}
        onDismiss={props.closeForm}
        snapPoints={['full']}
        contentPadding={0}
      >
        <FillUpForm {...props} />
      </BottomSheet>
    </Host>
  )
}

/** The last twelve months at a glance: what the car cost, per mile, and its economy. */
function SummaryCard({ lastYear, economy }: Pick<Props, 'lastYear' | 'economy'>) {
  const colors = useColors()
  return (
    <Card spacing={10}>
      <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>LAST 12 MONTHS</Text>
      <Row alignment="end" spacing={8}>
        <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>{lastYear.total}</Text>
        {lastYear.perMile ? (
          <Text textStyle={{ fontSize: 17, color: colors.textSecondary }}>{lastYear.perMile}</Text>
        ) : null}
      </Row>
      <Row spacing={16}>
        <Legend color={FUEL} label={`Fuel ${lastYear.fuel}`} />
        <Legend color={SERVICE} label={`Service ${lastYear.service}`} />
      </Row>
      {economy.map((e) => (
        <Row key={e.energy} alignment="center" spacing={6}>
          <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>{e.title}</Text>
          <Spacer flexible />
          <Text textStyle={{ fontSize: 15, fontWeight: '600' }}>{`${e.average} average`}</Text>
        </Row>
      ))}
    </Card>
  )
}

function Legend({ color, label }: { color: ColorRole; label: string }) {
  const colors = useColors()
  return (
    <Row alignment="center" spacing={6}>
      <Dot color={color} size={8} />
      <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>{label}</Text>
    </Row>
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

/** The economy charts and the fill-up log, newest first. */
function FillUps({ rows, hiddenRows, economy, openEdit, showMoreRows }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <Note>
          Log each fill-up or charge with the odometer reading. Economy shows after two full
          fill-ups, and every reading keeps your reminders on time. Tap + to start.
        </Note>
      </Card>
    )
  }
  return (
    <Column spacing={16}>
      {economy.map((e) => (
        <EconomyCard key={e.energy} trend={e} />
      ))}
      <Section title="FILL-UPS">
        <Card padding={0}>
          {rows.map((row, i) => (
            <Fragment key={row.id}>
              {i > 0 ? <Separator /> : null}
              <FillUpLine row={row} onPress={() => openEdit(row.id)} />
            </Fragment>
          ))}
        </Card>
        {hiddenRows > 0 ? (
          <Button
            variant="text"
            label={`Show earlier fill-ups (${hiddenRows})`}
            onPress={showMoreRows}
          />
        ) : null}
      </Section>
    </Column>
  )
}

/** The last stretches' economy, so a sudden drop (a dragging brake, a soft tire) stands out. */
function EconomyCard({ trend }: { trend: EconomyTrend }) {
  const colors = useColors()
  const recent = trend.points.slice(-16)
  return (
    <Card spacing={10}>
      <Row alignment="center">
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{trend.title}</Text>
        <Spacer flexible />
        <Text textStyle={{ fontSize: 17, fontWeight: '600', color: colors.accent }}>
          {trend.average}
        </Text>
      </Row>
      {recent.length >= 2 ? (
        <TrendChart points={recent} color={FUEL} />
      ) : (
        <Note>The chart starts once two stretches between full fill-ups are logged.</Note>
      )}
    </Card>
  )
}

function FillUpLine({ row, onPress }: { row: FillUpRow; onPress: () => void }) {
  const colors = useColors()
  return (
    <Row alignment="center" spacing={12} style={{ padding: 14 }} onPress={onPress}>
      <FillColumn spacing={2}>
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{row.date}</Text>
        <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>{row.title}</Text>
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{row.detail}</Text>
      </FillColumn>
      <Column alignment="end" spacing={2}>
        {row.economy ? (
          <Text textStyle={{ fontSize: 16, fontWeight: '600', color: colors.accent }}>
            {row.economy}
          </Text>
        ) : null}
        {row.note ? (
          <Text
            textStyle={{
              fontSize: 13,
              color: row.flagged ? colors.warning : colors.textSecondary,
            }}
          >
            {row.note}
          </Text>
        ) : null}
      </Column>
      <Symbol name="chevron" size={14} color={colors.textSecondary} />
    </Row>
  )
}

/** Costs by month as stacked bars of fuel and service, then a line per year. */
function Costs({ months, years }: Props) {
  const colors = useColors()
  return (
    <Column spacing={16}>
      <Section title="BY MONTH">
        <Card spacing={12}>
          <StackedBars
            bars={months.map((m) => ({
              label: m.label,
              segments: [
                { value: m.fuelCents, color: FUEL },
                { value: m.serviceCents, color: SERVICE },
              ],
            }))}
          />
          <Row spacing={16}>
            <Legend color={FUEL} label="Fuel and charging" />
            <Legend color={SERVICE} label="Service" />
          </Row>
        </Card>
      </Section>
      <Section title="BY YEAR">
        {years.length === 0 ? (
          <Card>
            <Note>
              Costs add up here from fill-ups and services with a price. Nothing is logged with a
              cost yet.
            </Note>
          </Card>
        ) : (
          <Card padding={0}>
            {years.map((y, i) => (
              <Fragment key={y.label}>
                {i > 0 ? <Separator /> : null}
                <YearLine row={y} />
              </Fragment>
            ))}
          </Card>
        )}
      </Section>
      <Text
        textStyle={{ fontSize: 13, color: colors.textSecondary }}
        style={{ paddingHorizontal: 4 }}
      >
        Cost per mile counts the miles your odometer readings show, so it sharpens as you log.
      </Text>
    </Column>
  )
}

function YearLine({ row }: { row: CostRow }) {
  const colors = useColors()
  return (
    <Column spacing={2} style={{ padding: 14 }}>
      <Row alignment="center">
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{row.label}</Text>
        <Spacer flexible />
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{row.total}</Text>
      </Row>
      <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
        {`Fuel ${row.fuel} · Service ${row.service}`}
      </Text>
      {row.perMile ? (
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
          {`${row.perMile} over ${row.miles ?? ''}`}
        </Text>
      ) : null}
    </Column>
  )
}

const QUANTITY_LABEL: Record<EnergyKind, string> = { fuel: 'Gallons', electric: 'kWh' }
const FULL_LABEL: Record<EnergyKind, string> = {
  fuel: 'Filled the tank',
  electric: 'Charged to my usual limit',
}

function FillUpForm({
  form,
  energies,
  setField,
  setFull,
  setMissedPrevious,
  save,
  remove,
  closeForm,
}: Props) {
  const colors = useColors()
  if (!form) return null
  const { draft, fieldErrors: errors, saving } = form
  const energy: EnergyKind = draft.energy === 'electric' ? 'electric' : 'fuel'
  return (
    <ScrollView>
      <Column spacing={12} style={{ padding: 16 }}>
        <Row alignment="center">
          <Button variant="text" label="Cancel" disabled={saving} onPress={closeForm} />
          <Spacer flexible />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>
            {form.id ? 'Edit fill-up' : 'Add fill-up'}
          </Text>
          <Spacer flexible />
          <Button
            variant="text"
            label={saving ? 'Saving…' : 'Save'}
            disabled={saving}
            onPress={() => void save()}
          />
        </Row>
        <SegmentedControl
          options={energies.map((e) => ({ value: e.energy, label: e.label }))}
          selected={energy}
          onSelect={(v) => setField('energy', v)}
        />
        <Row spacing={10}>
          <FillColumn>
            <DateField
              label="Date"
              value={draft.filledOn}
              onChange={(v) => setField('filledOn', v)}
              error={errors.filledOn}
              max={form.latestDate}
            />
          </FillColumn>
          <FillColumn>
            <TextField
              label="Odometer (mi)"
              value={draft.odometerMiles}
              onChangeText={(v) => setField('odometerMiles', v)}
              error={errors.odometerMiles}
              placeholder={form.odometerHint || 'e.g. 41,250'}
              keyboardType="number-pad"
            />
          </FillColumn>
        </Row>
        <Row spacing={10}>
          <FillColumn>
            <TextField
              label={QUANTITY_LABEL[energy]}
              value={draft.quantity}
              onChangeText={(v) => setField('quantity', v)}
              error={errors.quantity}
              placeholder={energy === 'fuel' ? 'e.g. 12.481' : 'e.g. 42.5'}
              keyboardType="decimal-pad"
            />
          </FillColumn>
          <FillColumn>
            <TextField
              label="Total paid"
              value={draft.cost}
              onChangeText={(v) => setField('cost', v)}
              error={errors.cost}
              placeholder={energy === 'fuel' ? 'e.g. 48.20' : 'Blank if free'}
              keyboardType="decimal-pad"
            />
          </FillColumn>
        </Row>
        {form.unitPrice ? <Note>{`That is ${form.unitPrice}.`}</Note> : null}
        <Switch value={draft.full} onValueChange={setFull} label={FULL_LABEL[energy]} />
        <Switch
          value={draft.missedPrevious}
          onValueChange={setMissedPrevious}
          label="I missed logging the one before"
        />
        <Note>
          Economy is measured from one full fill-up to the next. Turn off the first switch for a
          top-up, and turn on the second if a fill-up went unlogged, so neither skews it.
        </Note>
        <TextField
          label="Station"
          value={draft.station}
          onChangeText={(v) => setField('station', v)}
          error={errors.station}
          placeholder="Where you filled up or charged"
        />
        <TextField
          label="Notes"
          value={draft.notes}
          onChangeText={(v) => setField('notes', v)}
          error={errors.notes}
          placeholder="Road trip, towing, winter blend"
        />
        {form.error ? <ErrorText>{form.error}</ErrorText> : null}
        {form.id ? (
          <Column spacing={6} style={{ paddingTop: 8 }}>
            <Row>
              <PillButton
                label={form.confirmingDelete ? 'Tap again to delete' : 'Delete fill-up'}
                onPress={() => void remove()}
                fill={form.confirmingDelete ? 'danger' : 'neutralSubtle'}
                text={form.confirmingDelete ? 'onDanger' : 'danger'}
              />
            </Row>
            {form.confirmingDelete ? (
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
                Its odometer reading goes with it.
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
