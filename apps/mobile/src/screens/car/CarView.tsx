import {
  BODY_STYLES,
  carHotspots,
  DEFAULT_BODY_STYLE,
  DEFAULT_PAINT,
  PAINTS,
  spotOfComponent,
  type Car3dState,
  type CarActions,
  type CarSection,
  type CarState,
  type DueStatus,
  type EditCarActions,
  type EditCarState,
  type FuelLink,
  type SafetyActions,
  type SafetyState,
  type ScheduleItemActions,
  type ScheduleItemState,
  type ScheduleRow,
  type Vehicle,
} from '@car/core'
import { Column, RNHostView, Row, ScrollView } from '@expo/ui'
import { Fragment, lazy, Suspense } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { paintColors, useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Symbol } from '../../ui/Symbol'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { TextField } from '../../ui/TextField'
import {
  Card,
  Dot,
  FillColumn,
  GlassIconButton,
  PillButton,
  Separator,
  TappableRow,
} from '../../ui/surfaces'
import type { AttachmentsProps } from '../attachments/AttachmentList'
import { DocumentsSection } from '../attachments/DocumentsSection'
import { EditCarSheet } from './EditCarSheet'
import { KnownIssuesSection } from './KnownIssues'
import { RecallsSection } from './SafetySections'
import { ScheduleItemSheet } from './ScheduleItemSheet'
import { Reflow } from '../../ui/Reflow'
import { TITLE_TOP } from '../../ui/layout'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

// three.js is only loaded once a Car screen first draws the car.
const CarStage = lazy(() => import('../../car3d/CarStage').then((m) => ({ default: m.CarStage })))
const STAGE_HEIGHT = 230

interface Props {
  car: CarState & CarActions
  vehicle: Vehicle
  car3d: Car3dState
  safety: SafetyState & Pick<SafetyActions, 'toggle'>
  scheduleItem: ScheduleItemState & ScheduleItemActions
  editCar: EditCarState & EditCarActions
  documents: AttachmentsProps
  onCheckQuote: () => void
  onTroubleCodes: () => void
  onWarranty: () => void
  onFuel: () => void
  onTires: () => void
  onDriving: () => void
  onRenewals: () => void
  onPrivacyPolicy: () => void
}

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

/** Pure rendering of a car's page: odometer, documents, then schedule, recalls or known issues. */
export function CarView({
  car,
  vehicle,
  car3d,
  safety,
  scheduleItem,
  editCar,
  documents,
  onCheckQuote,
  onTroubleCodes,
  onWarranty,
  onFuel,
  onTires,
  onDriving,
  onRenewals,
  onPrivacyPolicy,
}: Props) {
  const colors = useColors()
  if (car.status === 'loading') return <ActivityIndicator style={styles.fill} />

  const recalls = safety.status === 'ready' ? ` · ${safety.recalls.length}` : ''
  const sections: { value: CarSection; label: string }[] = [
    { value: 'schedule', label: 'Schedule' },
    { value: 'recalls', label: `Recalls${recalls}` },
    { value: 'issues', label: 'Known issues' },
  ]
  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={14}
          style={{ padding: 16, paddingTop: TITLE_TOP, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Row alignment="center" spacing={12}>
            <FillColumn spacing={4}>
              <Text textStyle={{ fontSize: 30, fontWeight: '700' }}>{car.title}</Text>
              {car.subtitle ? (
                <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
                  {car.subtitle}
                </Text>
              ) : null}
            </FillColumn>
            <GlassIconButton symbol="compose" label="Edit car" onPress={editCar.open} />
          </Row>
          <CarDrawing
            car={car}
            vehicle={vehicle}
            car3d={car3d}
            safety={safety}
            onItem={(id) => void scheduleItem.openItem(id)}
          />
          <OdometerCard {...car} onPrivacyPolicy={onPrivacyPolicy} />
          <QuoteCard onPress={onCheckQuote} />
          <TroubleCodesCard onPress={onTroubleCodes} />
          <FuelCard link={car.fuelLink} onPress={onFuel} />
          <TiresCard onPress={onTires} />
          <WarrantyCard onPress={onWarranty} />
          <RenewalsCard onPress={onRenewals} />
          <DocumentsSection {...documents} />
          <SegmentedControl options={sections} selected={car.section} onSelect={car.showSection} />
          {car.section === 'schedule' ? (
            <Schedule
              {...car}
              onDriving={onDriving}
              onItem={(id) => void scheduleItem.openItem(id)}
              onAdd={scheduleItem.openNew}
            />
          ) : car.section === 'recalls' ? (
            <RecallsSection {...safety} />
          ) : (
            <KnownIssuesSection {...safety} />
          )}
        </Column>
      </ScrollView>
      <ScheduleItemSheet {...scheduleItem} />
      <EditCarSheet {...editCar} />
    </Host>
  )
}

function OdometerCard(car: CarState & CarActions & { onPrivacyPolicy: () => void }) {
  const colors = useColors()
  const editing = car.editingOdometer
  if (editing?.asking) return <PhotoPermission {...car} allowing={editing.allowing ?? false} />
  if (editing) {
    const busy = editing.saving || editing.reading
    return (
      <Card spacing={12}>
        <TextField
          label="Odometer now (miles)"
          value={editing.value}
          onChangeText={car.setOdometer}
          error={editing.error}
          placeholder="Miles on the dashboard"
          keyboardType="number-pad"
        />
        {editing.note ? <Note>{editing.note}</Note> : null}
        {editing.reading ? (
          <Row alignment="center" spacing={10} style={{ height: 44 }}>
            <ActivityIndicator color={colors.accent} />
            <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
              Reading the odometer…
            </Text>
          </Row>
        ) : (
          <Row spacing={10}>
            <PillButton
              label="Take photo"
              onPress={() => void car.takeOdometerPhoto()}
              fill="accentSubtle"
              text="accent"
            />
            <PillButton
              label="Choose photo"
              onPress={() => void car.chooseOdometerPhoto()}
              fill="accentSubtle"
              text="accent"
            />
          </Row>
        )}
        <Row spacing={8}>
          <Button
            label={editing.saving ? 'Saving…' : 'Save'}
            disabled={busy}
            onPress={() => void car.saveOdometer()}
          />
          <Button
            variant="text"
            label="Cancel"
            disabled={editing.saving}
            onPress={car.cancelOdometer}
          />
        </Row>
      </Card>
    )
  }
  return (
    <Card padding={14}>
      <Reflow alignment="center" spacing={12}>
        <FillColumn spacing={2}>
          <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>ODOMETER</Text>
          <Text textStyle={{ fontSize: 26, fontWeight: '700' }}>
            {car.odometer ?? 'Not read yet'}
          </Text>
          {car.pace ? (
            <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{car.pace}</Text>
          ) : null}
        </FillColumn>
        <Button variant="outlined" label="Update" onPress={car.editOdometer} />
      </Reflow>
    </Card>
  )
}

/**
 * Asks before the first odometer photo goes to Anthropic: what is sent, to whom and how it is
 * handled (App Store guideline 5.1.2(i)). Allowing it is the same choice Ask and quotes use.
 */
function PhotoPermission(
  car: CarState & CarActions & { allowing: boolean; onPrivacyPolicy: () => void },
) {
  const colors = useColors()
  return (
    <Card spacing={12}>
      <Row alignment="center" spacing={10}>
        <Symbol name="shield" size={22} color={colors.accent} />
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Read the miles with Claude?</Text>
      </Row>
      <Text>
        Photos are read by Claude, an AI model made by Anthropic. Only the photo is sent, to read
        the odometer, and we don’t store it. Under its commercial terms, Anthropic doesn’t use it to
        train its models and generally deletes it within 30 days.
      </Text>
      <Note>
        This is the same choice Ask and the quote checker use: Ask sends your question with this
        car’s details (including its VIN), odometer readings and service log with costs, shops and
        notes, and the quote checker sends quote photos. You can turn it off in Account at any time.
      </Note>
      {car.editingOdometer?.error ? <ErrorText>{car.editingOdometer.error}</ErrorText> : null}
      <Row spacing={10}>
        <PillButton
          label="Not now"
          onPress={car.declinePhotoReading}
          fill="neutralSubtle"
          text="textPrimary"
        />
        <PillButton
          label={car.allowing ? 'Saving…' : 'Allow'}
          onPress={car.allowing ? () => {} : () => void car.allowPhotoReading()}
          fill="accent"
          text="onAccent"
        />
      </Row>
      <Button variant="text" label="Privacy policy" onPress={car.onPrivacyPolicy} />
    </Card>
  )
}

/** Opens the quote checker, for when a shop hands over a list of recommended work. */
function QuoteCard({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol name="quote" size={22} color={colors.accent} leading />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Check a shop’s quote</Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
            See which recommendations are actually due
          </Text>
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textSecondary} />
      </Row>
    </Card>
  )
}

/** Opens the code lookup, for when the check-engine light comes on. */
function TroubleCodesCard({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol name="engine" size={22} color={colors.accent} leading />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Check-engine light on?</Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
            Look up a code and see how urgent it is
          </Text>
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textSecondary} />
      </Row>
    </Card>
  )
}

/** Opens the car's fill-ups or charging sessions and what it costs to run. */
function FuelCard({ link, onPress }: { link: FuelLink; onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol
          name={link.energy === 'electric' ? 'charging' : 'fuel'}
          size={22}
          color={colors.accent}
          leading
        />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>{link.title}</Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{link.detail}</Text>
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textSecondary} />
      </Row>
    </Card>
  )
}

/** Opens the car's tire sets: their age, miles and tread. */
function TiresCard({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol name="tire" size={22} color={colors.accent} leading />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Tires</Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
            How old they are, miles on each set, and seasonal swaps
          </Text>
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textSecondary} />
      </Row>
    </Card>
  )
}

/** Opens the car's registration, inspection and insurance dates. */
function RenewalsCard({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol name="calendar" size={22} color={colors.accent} leading />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Registration & insurance</Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
            Renewal dates and inspections, with reminders before each
          </Text>
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textSecondary} />
      </Row>
    </Card>
  )
}

/** Opens the car's warranties and the proof-of-care report. */
function WarrantyCard({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol name="shield" size={22} color={colors.accent} leading />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Warranty & care report</Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
            Coverage left, and a PDF of your service history
          </Text>
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textSecondary} />
      </Row>
    </Card>
  )
}

const DOT: Record<DueStatus, ColorRole> = {
  overdue: 'warning',
  'due-soon': 'accent',
  upcoming: 'textSecondary',
  unknown: 'textSecondary',
}

// What the dot's colour says, for VoiceOver.
const STATUS_LABEL: Record<DueStatus, string> = {
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  upcoming: 'Upcoming',
  unknown: 'Needs your mileage',
}

function Schedule(
  car: CarState & { onDriving: () => void; onItem: (itemId: string) => void; onAdd: () => void },
) {
  const colors = useColors()
  if (car.error) return <ErrorText>{car.error}</ErrorText>
  const addItem = (
    <Row style={{ paddingHorizontal: 4 }}>
      <Button variant="text" label="Add an item" onPress={car.onAdd} />
    </Row>
  )
  // Before the car has synced, or without a schedule for it, the owner's own items still show.
  if (car.status === 'unmatched' || car.schedule.length === 0)
    return (
      <Column spacing={8}>
        <Note>
          {car.status === 'unmatched'
            ? 'Your schedule appears once your car has synced.'
            : "We don't have a maintenance schedule for this car yet."}
        </Note>
        {car.schedule.length > 0 ? <ScheduleCard rows={car.schedule} onItem={car.onItem} /> : null}
        {addItem}
      </Column>
    )
  return (
    <Column spacing={8}>
      <Column spacing={4} style={{ paddingHorizontal: 4 }}>
        <Row alignment="center">
          <FillColumn>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {car.scheduleTitle.toUpperCase()}
            </Text>
          </FillColumn>
          <Button variant="text" label="Change" onPress={car.onDriving} />
        </Row>
        {car.scheduleNote ? <Note>{car.scheduleNote}</Note> : null}
      </Column>
      <ScheduleCard rows={car.schedule} onItem={car.onItem} />
      <Column spacing={0} style={{ paddingHorizontal: 4 }}>
        <Note>Tap an item to set your own interval.</Note>
        {addItem}
      </Column>
    </Column>
  )
}

function ScheduleCard({ rows, onItem }: { rows: ScheduleRow[]; onItem: (itemId: string) => void }) {
  return (
    <Card padding={0}>
      {rows.map((row, i) => (
        <Fragment key={row.itemId}>
          {i > 0 ? <Separator inset={38} /> : null}
          <ScheduleRowView row={row} onPress={() => onItem(row.itemId)} />
        </Fragment>
      ))}
    </Card>
  )
}

// Marks the owner's own changes beside the interval.
const OWN_LABEL = { added: 'Your item', changed: 'Your interval' } as const

function ScheduleRowView({ row, onPress }: { row: ScheduleRow; onPress: () => void }) {
  const colors = useColors()
  const overdue = row.status === 'overdue'
  return (
    <TappableRow onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Dot color={DOT[row.status]} label={STATUS_LABEL[row.status]} />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{row.task}</Text>
          {row.interval ? (
            <Reflow spacing={4}>
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{row.interval}</Text>
              {row.own ? (
                <Text textStyle={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>
                  {`· ${OWN_LABEL[row.own]}`}
                </Text>
              ) : null}
            </Reflow>
          ) : null}
        </FillColumn>
        <Text
          textStyle={{
            fontSize: 14,
            fontWeight: overdue ? '600' : '400',
            color: overdue ? colors.warning : colors.textSecondary,
          }}
        >
          {row.next}
        </Text>
      </Row>
    </TappableRow>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stage: { width: '100%', height: STAGE_HEIGHT },
})

/**
 * The owner's car drawn at the top of its page, in 3D or as a still side view (ADR 0022), with a
 * pin on each spot that has something on it. Picking a pin lists what is there underneath.
 */
function CarDrawing({
  car,
  vehicle,
  car3d,
  safety,
  onItem,
}: {
  car: CarState & CarActions
  vehicle: Vehicle
  car3d: Car3dState
  safety: SafetyState
  onItem: (itemId: string) => void
}) {
  const colors = useColors()
  if (car3d.status === 'loading' || car.status !== 'ready') return null
  const recalls = safety.status === 'ready' ? safety.recalls : []
  const hotspots = carHotspots(
    car.schedule,
    recalls.map((r) => ({ id: r.id, spot: spotOfComponent(r.component) })),
  )
  const bodyStyle = vehicle.bodyStyle ?? DEFAULT_BODY_STYLE
  const paint = vehicle.paint ?? DEFAULT_PAINT
  const kind = BODY_STYLES.find((b) => b.id === bodyStyle)?.label ?? ''
  const paintName = PAINTS.find((p) => p.id === paint)?.label.toLowerCase() ?? ''
  const picked = hotspots.find((h) => h.spot === car.spot)
  const items = picked ? car.schedule.filter((r) => picked.itemIds.includes(r.itemId)) : []
  return (
    <Column spacing={10}>
      {/* Width from the page, height from the stage: the stage's children are absolutely placed,
          so a host sized to them would be zero wide and GL would never start. The host keeps the
          first view it is given, so that view stays put while the stage loads inside it. */}
      <RNHostView matchContents={{ vertical: true }}>
        <View style={styles.stage}>
          <Suspense fallback={<ActivityIndicator style={styles.stage} />}>
            <CarStage
              bodyStyle={bodyStyle}
              paint={paintColors[paint]}
              mode={car3d.on ? '3d' : 'still'}
              hotspots={hotspots}
              focused={car.spot}
              onSelect={car.showSpot}
              label={`Drawing of a ${paintName} ${kind} standing in for your ${car.title}.${car3d.on ? ' Drag sideways to turn it.' : ''}`}
              height={STAGE_HEIGHT}
            />
          </Suspense>
        </View>
      </RNHostView>
      {picked ? (
        <Card spacing={8}>
          <Row alignment="center">
            <FillColumn spacing={2}>
              <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>{picked.label}</Text>
              <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
                {picked.summary}
              </Text>
            </FillColumn>
            <Button variant="text" label="Done" onPress={() => car.showSpot(undefined)} />
          </Row>
          {picked.recallIds.length > 0 ? (
            <TappableRow onPress={() => car.showSection('recalls')}>
              <Row alignment="center" spacing={12}>
                <Dot color="danger" />
                <FillColumn>
                  <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>
                    {picked.recallIds.length === 1
                      ? 'A recall is here'
                      : `${picked.recallIds.length} recalls are here`}
                  </Text>
                </FillColumn>
                <Symbol name="chevron" size={14} color={colors.textSecondary} />
              </Row>
            </TappableRow>
          ) : null}
          {items.map((row) => (
            <ScheduleRowView key={row.itemId} row={row} onPress={() => onItem(row.itemId)} />
          ))}
        </Card>
      ) : (
        <Note>
          {hotspots.length > 0
            ? 'Tap a dot to see what’s there. Everything is also in the schedule below.'
            : 'Nothing to point out on the car. The schedule is below.'}
        </Note>
      )}
    </Column>
  )
}
