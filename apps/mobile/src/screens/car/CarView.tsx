import type {
  CarActions,
  CarSection,
  CarState,
  DueStatus,
  SafetyActions,
  SafetyState,
  ScheduleRow,
} from '@car/core'
import { Button, Column, Row, ScrollView, Text } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Symbol } from '../../ui/Symbol'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { TextField } from '../../ui/TextField'
import { Card, Dot, FillColumn, Separator } from '../../ui/surfaces'
import type { AttachmentsProps } from '../attachments/AttachmentList'
import { DocumentsSection } from '../attachments/DocumentsSection'
import { KnownIssuesSection } from './KnownIssues'
import { RecallsSection } from './SafetySections'

interface Props {
  car: CarState & CarActions
  safety: SafetyState & Pick<SafetyActions, 'toggle'>
  documents: AttachmentsProps
  onCheckQuote: () => void
  onWarranty: () => void
}

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

/** Pure rendering of a car's page: odometer, documents, then schedule, recalls or known issues. */
export function CarView({ car, safety, documents, onCheckQuote, onWarranty }: Props) {
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
          style={{ padding: 16, paddingTop: 60, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Column spacing={4}>
            <Text textStyle={{ fontSize: 30, fontWeight: '700' }}>{car.title}</Text>
            {car.subtitle ? (
              <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>{car.subtitle}</Text>
            ) : null}
          </Column>
          <OdometerCard {...car} />
          <QuoteCard onPress={onCheckQuote} />
          <WarrantyCard onPress={onWarranty} />
          <DocumentsSection {...documents} />
          <SegmentedControl options={sections} selected={car.section} onSelect={car.showSection} />
          {car.section === 'schedule' ? (
            <Schedule {...car} />
          ) : car.section === 'recalls' ? (
            <RecallsSection {...safety} />
          ) : (
            <KnownIssuesSection {...safety} />
          )}
        </Column>
      </ScrollView>
    </Host>
  )
}

function OdometerCard(car: CarState & CarActions) {
  const colors = useColors()
  const editing = car.editingOdometer
  if (editing) {
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
        <Row spacing={8}>
          <Button
            label={editing.saving ? 'Saving…' : 'Save'}
            disabled={editing.saving}
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
      <Row alignment="center" spacing={12}>
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
      </Row>
    </Card>
  )
}

/** Opens the quote checker, for when a shop hands over a list of recommended work. */
function QuoteCard({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol name="quote" size={22} color={colors.accent} />
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

/** Opens the car's warranties and the proof-of-care report. */
function WarrantyCard({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <Card padding={14} onPress={onPress}>
      <Row alignment="center" spacing={12}>
        <Symbol name="shield" size={22} color={colors.accent} />
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
}

function Schedule(car: CarState) {
  const colors = useColors()
  if (car.status === 'unmatched')
    return <Note>Your schedule appears once your car has synced.</Note>
  if (car.error) return <ErrorText>{car.error}</ErrorText>
  if (car.schedule.length === 0)
    return <Note>We don't have a maintenance schedule for this car yet.</Note>
  return (
    <Column spacing={8}>
      <Column spacing={4} style={{ paddingHorizontal: 4 }}>
        <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
          {car.scheduleTitle.toUpperCase()}
        </Text>
        {car.scheduleNote ? <Note>{car.scheduleNote}</Note> : null}
      </Column>
      <Card padding={0}>
        {car.schedule.map((row, i) => (
          <Fragment key={row.itemId}>
            {i > 0 ? <Separator inset={38} /> : null}
            <ScheduleRowView row={row} />
          </Fragment>
        ))}
      </Card>
    </Column>
  )
}

function ScheduleRowView({ row }: { row: ScheduleRow }) {
  const colors = useColors()
  const overdue = row.status === 'overdue'
  return (
    <Row alignment="center" spacing={12} style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
      <Dot color={DOT[row.status]} />
      <FillColumn spacing={1}>
        <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{row.task}</Text>
        {row.interval ? (
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{row.interval}</Text>
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
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
