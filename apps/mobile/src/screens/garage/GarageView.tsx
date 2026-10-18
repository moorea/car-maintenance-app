import type {
  ArrangeCarsActions,
  ArrangeCarsState,
  DueRow,
  DueStatus,
  GarageActions,
  GarageCardsState,
  GarageState,
  Vehicle,
} from '@car/core'
import { Column, Row, ScrollView, Spacer } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import {
  Card,
  FillColumn,
  GlassIconButton,
  PillButton,
  ProgressBar,
  Separator,
} from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { ArrangeCarsSheet } from './ArrangeCarsSheet'

export interface GarageNavigation {
  onOpenCar: (id: string) => void
  /** Opens the selected car's page with its odometer editor. */
  onUpdateOdometer: () => void
  onAddCar: () => void
  onReminders: () => void
  /** Opens the service log form, for a scheduled task if given. */
  onLogService: (itemId?: string, options?: { earlier?: boolean }) => void
  /** Opens Ask with a question, such as one about the next item due. */
  onAsk: (question: string) => void
  /** Opens the owner's account: sign out, delete the account, reminder settings. */
  onAccount: () => void
}

type Props = GarageState &
  Pick<GarageActions, 'dismissCatchUp'> &
  GarageNavigation &
  Pick<GarageCardsState, 'nextDue'> & {
    vehicles: Vehicle[]
    vehicle: Vehicle
    /** Putting the cars in the owner's order, from the Reorder button. */
    arrange: ArrangeCarsState & ArrangeCarsActions
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const describeCar = (v: Vehicle) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')

/** Pure rendering of the garage model: the cars, what is due next, and what follows. */
export function GarageView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column spacing={16} style={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE }}>
          <Row alignment="center">
            <Spacer flexible />
            <Row spacing={10}>
              <GlassIconButton symbol="person" label="Account" onPress={props.onAccount} />
              <GlassIconButton symbol="bell" label="Reminders" onPress={props.onReminders} />
              <GlassIconButton symbol="plus" label="Add car" onPress={props.onAddCar} />
            </Row>
          </Row>
          <Row alignment="center">
            <FillColumn spacing={2}>
              <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
                {props.today.toUpperCase()}
              </Text>
              <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Garage</Text>
            </FillColumn>
            {props.vehicles.length > 1 ? (
              <Button variant="text" label="Reorder" onPress={props.arrange.open} />
            ) : null}
          </Row>

          {props.vehicles.map((v) => (
            <CarCard
              key={v.id}
              vehicle={v}
              detail={v.id === props.vehicle.id ? props.odometer : undefined}
              // With one car, the next-up card below already says what it needs.
              next={props.vehicles.length > 1 ? props.nextDue[v.id] : undefined}
              onPress={() => props.onOpenCar(v.id)}
            />
          ))}

          <CatchUpCard {...props} />
          <CheckOdometerCard {...props} />
          <NextUpCard {...props} />
          <RecallBanner {...props} />
          <ComingUp {...props} />
        </Column>
      </ScrollView>
      <ArrangeCarsSheet {...props.arrange} />
    </Host>
  )
}

const NEXT_TEXT: Record<DueStatus, ColorRole> = {
  overdue: 'warning',
  'due-soon': 'accent',
  upcoming: 'textSecondary',
  unknown: 'textSecondary',
}

function CarCard(props: {
  vehicle: Vehicle
  detail: string | undefined
  /** The car's item due soonest, when the garage has more than one car. */
  next: DueRow | undefined
  onPress: () => void
}) {
  const colors = useColors()
  const description = describeCar(props.vehicle)
  const title = props.vehicle.nickname || description
  const { next } = props
  // The hint to tap is only for a card with nothing else to say.
  const subtitle =
    props.detail ??
    (title !== description ? description : next ? undefined : 'Tap to see its schedule')
  return (
    <Card padding={14} onPress={props.onPress}>
      <Row alignment="center" spacing={12}>
        <Column
          alignment="center"
          style={{ padding: 10, borderRadius: 16, backgroundColor: colors.accentSubtle }}
        >
          <Symbol name="car" size={28} color={colors.accent} />
        </Column>
        <FillColumn spacing={2}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{title}</Text>
          {subtitle ? (
            <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>{subtitle}</Text>
          ) : null}
          {next ? (
            <Text
              textStyle={{
                fontSize: 14,
                fontWeight: next.status === 'upcoming' || next.status === 'unknown' ? '400' : '600',
                color: colors[NEXT_TEXT[next.status]],
              }}
            >
              {`${next.task} · ${next.when}`}
            </Text>
          ) : null}
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textSecondary} />
      </Row>
    </Card>
  )
}

/** Asks when a service was last done, one at a time, so a new car's schedule stops guessing. */
function CatchUpCard(props: Props) {
  const colors = useColors()
  const { catchUp } = props
  if (!catchUp) return null
  const more =
    catchUp.others > 0
      ? ` ${catchUp.others === 1 ? "There's" : 'There are'} ${plural(catchUp.others, 'other service')} to fill in after this one.`
      : ''
  return (
    <Card padding={18} spacing={12}>
      <Row alignment="center" spacing={12}>
        <Column
          alignment="center"
          style={{ padding: 8, borderRadius: 12, backgroundColor: colors.accentSubtle }}
        >
          <Symbol name="log" size={22} color={colors.accent} />
        </Column>
        <FillColumn spacing={2}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{catchUp.task}</Text>
          <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>
            When was it last done?
          </Text>
        </FillColumn>
      </Row>
      <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
        {`There's no record of it yet, so when it's due is a guess. Add the last time it was done, even roughly, and reminders will follow your car.${more}`}
      </Text>
      <Row spacing={10}>
        <PillButton
          label="Add last time"
          onPress={() => props.onLogService(catchUp.itemId, { earlier: true })}
          fill="accent"
          text="onAccent"
        />
        <PillButton
          label="Don't ask again"
          onPress={props.dismissCatchUp}
          fill="neutralSubtle"
          text="textPrimary"
        />
      </Row>
    </Card>
  )
}

/** Asks for a reading when the car has none, or the next mileage reminder rests on an old one. */
function CheckOdometerCard(props: Props) {
  const colors = useColors()
  const { checkOdometer } = props
  if (!checkOdometer) return null
  return (
    <Card padding={18} spacing={12}>
      <Row alignment="center" spacing={12}>
        <Column
          alignment="center"
          style={{ padding: 8, borderRadius: 12, backgroundColor: colors.accentSubtle }}
        >
          <Symbol name="gauge" size={22} color={colors.accent} />
        </Column>
        <FillColumn spacing={2}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>What does the odometer say?</Text>
          <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>
            {checkOdometer.subtitle}
          </Text>
        </FillColumn>
      </Row>
      <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>{checkOdometer.detail}</Text>
      <Row spacing={10}>
        <PillButton
          label="Update odometer"
          onPress={props.onUpdateOdometer}
          fill="accent"
          text="onAccent"
        />
      </Row>
    </Card>
  )
}

function NextUpCard(props: Props) {
  const colors = useColors()
  const { nextUp, status } = props
  if (status === 'unmatched') {
    return (
      <Card>
        <Note>Your maintenance schedule appears once your car has synced.</Note>
      </Card>
    )
  }
  if (props.error) {
    return (
      <Card>
        <ErrorText>{props.error}</ErrorText>
      </Card>
    )
  }
  if (!nextUp) {
    return (
      <Card>
        <Note>We don't have a maintenance schedule for this car yet.</Note>
      </Card>
    )
  }
  const carName = props.vehicle.nickname || describeCar(props.vehicle)
  const forCar = props.vehicles.length > 1 ? ` · ${carName.toUpperCase()}` : ''
  return (
    <Card fill="accent" padding={18} spacing={14}>
      <Column spacing={4}>
        <Text textStyle={{ ...OVERLINE, color: colors.onAccent }}>{`NEXT UP${forCar}`}</Text>
        <Text textStyle={{ fontSize: 24, fontWeight: '700', color: colors.onAccent }}>
          {nextUp.task}
        </Text>
        <Text textStyle={{ fontSize: 15, color: colors.onAccent }}>{nextUp.detail}</Text>
      </Column>
      {nextUp.progress !== undefined ? (
        <ProgressBar value={nextUp.progress} fill="onAccent" track="accentSubtle" />
      ) : null}
      <Row spacing={10}>
        <PillButton
          label="Log it done"
          onPress={() => props.onLogService(nextUp.itemId)}
          fill="surface"
          text="accent"
        />
        <PillButton
          label="Ask about it"
          onPress={() => props.onAsk(nextUp.question)}
          fill="accentSubtle"
          text="accent"
        />
      </Row>
    </Card>
  )
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

function RecallBanner(props: Props) {
  const colors = useColors()
  const { recalls, vehicle } = props
  if (!recalls || recalls.count === 0) return null
  return (
    <Card fill="warningSubtle" padding={14} onPress={() => props.onOpenCar(vehicle.id)}>
      <Row alignment="center" spacing={12}>
        <Symbol name="warning" size={22} color={recalls.urgent ? colors.danger : colors.warning} />
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
            {`${plural(recalls.count, 'recall')} for the ${vehicle.year} ${vehicle.model}`}
          </Text>
          <Text
            textStyle={{
              fontSize: 14,
              color: recalls.urgent ? colors.danger : colors.textPrimary,
            }}
          >
            {recalls.urgent
              ? 'One says to park outside or not drive until fixed'
              : 'Check whether yours has been fixed'}
          </Text>
        </FillColumn>
        <Symbol name="chevron" size={16} color={colors.textPrimary} />
      </Row>
    </Card>
  )
}

const PILLS: Record<DueStatus, { label: string; fill: ColorRole; text: ColorRole }> = {
  overdue: { label: 'Overdue', fill: 'warningSubtle', text: 'warning' },
  'due-soon': { label: 'Soon', fill: 'accentSubtle', text: 'accent' },
  upcoming: { label: 'Later', fill: 'neutralSubtle', text: 'textSecondary' },
  unknown: { label: 'Unknown', fill: 'neutralSubtle', text: 'textSecondary' },
}

function ComingUp(props: Props) {
  if (props.comingUp.length === 0) return null
  return (
    <Column spacing={8}>
      <Row alignment="center" style={{ paddingHorizontal: 4 }}>
        <Text textStyle={{ fontSize: 20, fontWeight: '700' }}>Coming up</Text>
        <Spacer flexible />
        <Button
          variant="text"
          label="Full schedule"
          onPress={() => props.onOpenCar(props.vehicle.id)}
        />
      </Row>
      <Card padding={0}>
        {props.comingUp.map((row, i) => (
          <Fragment key={row.itemId}>
            {i > 0 ? <Separator /> : null}
            <DueRowView row={row} />
          </Fragment>
        ))}
      </Card>
    </Column>
  )
}

function DueRowView({ row }: { row: DueRow }) {
  const colors = useColors()
  const pill = PILLS[row.status]
  return (
    <Row alignment="center" spacing={12} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
      <FillColumn spacing={2}>
        <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{row.task}</Text>
        <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>{row.when}</Text>
      </FillColumn>
      <Text
        textStyle={{ fontSize: 13, fontWeight: '600', color: colors[pill.text] }}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
          backgroundColor: colors[pill.fill],
        }}
      >
        {pill.label}
      </Text>
    </Row>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
