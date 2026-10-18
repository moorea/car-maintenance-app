import {
  DRIVING_QUESTIONS,
  type DrivingActions,
  type DrivingQuestion,
  type DrivingState,
} from '@car/core'
import { Column, Row, ScrollView, Spacer, Switch } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Symbol } from '../../ui/Symbol'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { Card, GlassIconButton, Separator } from '../../ui/surfaces'
import { PAGE_TOP } from '../../ui/layout'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = DrivingState &
  Pick<DrivingActions, 'answer'> & {
    onBack: () => void
    /** Saves the schedule and goes back to the car. */
    onChoose: (severe: boolean) => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const scheduleName = (severe: boolean) => (severe ? 'severe' : 'normal')

/** Pure rendering of choosing the normal or severe schedule from a few questions. */
export function DrivingView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />
  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={16}
          style={{ padding: 16, paddingTop: PAGE_TOP, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Row alignment="center">
            <GlassIconButton symbol="back" label="Back" onPress={props.onBack} />
            <Spacer flexible />
          </Row>
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {props.carTitle.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>How you drive</Text>
          </Column>
          <Text textStyle={{ color: colors.textSecondary }}>
            {`Owner’s manuals have a stricter schedule for hard driving, and a lot of everyday driving counts. You’re on the ${scheduleName(props.severeNow)} schedule. Turn on anything that sounds like your driving.`}
          </Text>

          <Card padding={0}>
            {DRIVING_QUESTIONS.map((q, i) => (
              <Fragment key={q.id}>
                {i > 0 ? <Separator /> : null}
                <QuestionRow
                  question={q}
                  yes={props.answers[q.id] === true}
                  onAnswer={(yes) => props.answer(q.id, yes)}
                />
              </Fragment>
            ))}
          </Card>

          <Recommendation {...props} />

          {props.differences.length > 0 ? (
            <Column spacing={8}>
              <Text
                style={{ paddingHorizontal: 4 }}
                textStyle={{ ...OVERLINE, color: colors.textSecondary }}
              >
                WHAT THE SEVERE SCHEDULE CHANGES
              </Text>
              <Card padding={0}>
                {props.differences.map((d, i) => (
                  <Fragment key={d.task}>
                    {i > 0 ? <Separator /> : null}
                    <Column spacing={2} style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
                      <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{d.task}</Text>
                      <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>
                        {`Normal: ${d.normal}`}
                      </Text>
                      <Text textStyle={{ fontSize: 14, color: colors.warning }}>
                        {`Severe: ${d.severe}`}
                      </Text>
                    </Column>
                  </Fragment>
                ))}
              </Card>
              {props.generalSchedule ? (
                <Note>
                  These are general intervals, not your manufacturer’s. Your owner’s manual lists
                  the severe conditions and intervals for your car.
                </Note>
              ) : null}
            </Column>
          ) : null}
        </Column>
      </ScrollView>
    </Host>
  )
}

function QuestionRow(props: {
  question: DrivingQuestion
  yes: boolean
  onAnswer: (yes: boolean) => void
}) {
  const colors = useColors()
  return (
    <Column spacing={2} style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
      <Switch label={props.question.question} value={props.yes} onValueChange={props.onAnswer} />
      <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{props.question.hint}</Text>
    </Column>
  )
}

function Recommendation(props: Props) {
  const colors = useColors()
  const { severe, reasons } = props.assessment
  const saving = props.status === 'saving'
  const other = !props.severeNow
  // A text button for the schedule the questions don't point to: the owner's manual may list a
  // condition the questions leave out.
  const switchAnyway = (
    <Button
      variant="text"
      label={`Use the ${scheduleName(other)} schedule ${props.answered ? 'anyway' : 'instead'}`}
      disabled={saving}
      onPress={() => props.onChoose(other)}
    />
  )
  if (!props.answered) {
    return (
      <Card spacing={10}>
        <Text textStyle={{ fontSize: 18, fontWeight: '700' }}>
          {`You’re on the ${scheduleName(props.severeNow)} schedule`}
        </Text>
        <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
          Turn on anything above that sounds like your driving to check it.
        </Text>
        {props.error ? <ErrorText>{props.error}</ErrorText> : null}
        {switchAnyway}
      </Card>
    )
  }
  const matches = severe === props.severeNow
  return (
    <Card fill={severe ? 'warningSubtle' : 'accentSubtle'} spacing={10}>
      <Row alignment="center" spacing={10}>
        <Symbol
          name={severe ? 'warning' : 'checkmark'}
          size={22}
          color={severe ? colors.warning : colors.accent}
        />
        <Text textStyle={{ fontSize: 18, fontWeight: '700' }}>
          {severe ? 'The severe schedule fits' : 'The normal schedule fits'}
        </Text>
      </Row>
      {severe ? (
        reasons.map((r) => (
          <Text key={r} textStyle={{ fontSize: 15 }}>
            {`• ${r}`}
          </Text>
        ))
      ) : (
        <Text textStyle={{ fontSize: 15 }}>
          None of these sound like your driving, so the normal intervals are enough.
        </Text>
      )}
      {props.error ? <ErrorText>{props.error}</ErrorText> : null}
      {matches ? (
        <>
          <Text textStyle={{ fontSize: 15, fontWeight: '600' }}>
            {`Your car is already on the ${scheduleName(severe)} schedule.`}
          </Text>
          {switchAnyway}
        </>
      ) : (
        <Button
          label={saving ? 'Saving…' : `Use the ${scheduleName(severe)} schedule`}
          disabled={saving}
          onPress={() => props.onChoose(severe)}
        />
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
