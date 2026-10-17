import {
  componentLabel,
  peakMileage,
  type ComplaintSummary,
  type Recall,
  type SafetyActions,
  type SafetyState,
} from '@car/core'
import { Button, Collapsible, Column, Row, Text } from '@expo/ui'
import { Fragment } from 'react'
import { Linking } from 'react-native'
import { useColors } from '../../theme'
import { Note } from '../../ui/Note'
import { Card, Separator } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'

type Props = SafetyState & Pick<SafetyActions, 'toggle'>

const LABEL = { fontSize: 13, fontWeight: '600' } as const
const OVERLINE = { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 } as const

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

/** NHTSA recalls for the car's model year, most urgent first. */
export function RecallsSection({ status, recalls, expanded, toggle, lookupUrl, modelYear }: Props) {
  if (status === 'unmatched') {
    return <Note>Recalls appear once your car has synced.</Note>
  }
  if (status === 'loading' || status === 'checking') {
    return <Note>Checking NHTSA for recalls on your model year…</Note>
  }
  return (
    <>
      <Note>
        {recalls.length === 0
          ? `NHTSA lists no recalls for the ${modelYear}.`
          : `NHTSA lists ${plural(recalls.length, 'recall')} for the ${modelYear}. Not every recall covers every car, and yours may already be fixed.`}
      </Note>
      {recalls.map((r) => (
        <RecallItem
          key={r.id}
          recall={r}
          open={expanded.includes(r.id)}
          onToggle={() => toggle(r.id)}
        />
      ))}
      <Button
        variant="outlined"
        label="Check your VIN on NHTSA"
        onPress={() => void Linking.openURL(lookupUrl)}
      />
    </>
  )
}

function RecallItem(props: { recall: Recall; open: boolean; onToggle: () => void }) {
  const r = props.recall
  const colors = useColors()
  const title = r.component ? componentLabel(r.component) : `Recall ${r.campaign}`
  const urgent = r.parkIt
    ? 'Do not drive until this is fixed'
    : r.parkOutside
      ? 'Park outside, away from buildings, until this is fixed'
      : undefined
  return (
    <Card fill="warningSubtle" spacing={8}>
      <Row alignment="center" spacing={8}>
        <Symbol name="warning" size={18} color={colors.warning} />
        <Text textStyle={{ ...OVERLINE, color: colors.warning }}>
          {`RECALL · NHTSA ${r.campaign}${r.reportedOn ? ` · ${r.reportedOn}` : ''}`}
        </Text>
      </Row>
      <Text textStyle={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
        {title}
      </Text>
      {urgent ? <Text textStyle={{ ...LABEL, color: colors.danger }}>{urgent}</Text> : null}
      <Text textStyle={{ fontSize: 15, color: colors.textPrimary }}>{r.summary}</Text>
      <Collapsible
        isOpen={props.open}
        onOpenChange={props.onToggle}
        label="Risk and fix"
        labelStyle={{ fontSize: 15, fontWeight: '600', color: colors.warning }}
      >
        <Column spacing={8}>
          {r.consequence ? <Detail label="Risk" text={r.consequence} /> : null}
          {r.remedy ? <Detail label="Fix" text={r.remedy} /> : null}
          {r.overTheAir ? (
            <Text textStyle={{ fontSize: 14, color: colors.textPrimary }}>
              Fixed by an over-the-air update.
            </Text>
          ) : null}
        </Column>
      </Collapsible>
    </Card>
  )
}

/** What owners have reported to NHTSA, by part of the car. */
export function ComplaintsSection({
  status,
  complaintsChecked,
  complaints,
  expanded,
  toggle,
  modelYear,
}: Props) {
  if (status === 'unmatched') {
    return <Note>Complaints appear once your car has synced.</Note>
  }
  if (!complaintsChecked) {
    return <Note>Checking NHTSA for owner complaints…</Note>
  }
  if (complaints.length === 0) {
    return <Text>{`Owners have filed no complaints with NHTSA about the ${modelYear}.`}</Text>
  }
  return (
    <>
      <Note>
        {`What owners of the ${modelYear} have reported to NHTSA, by part of the car. A complaint can name more than one part.`}
      </Note>
      <Card padding={0}>
        {complaints.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 ? <Separator /> : null}
            <Column style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <ComplaintItem
                summary={c}
                open={expanded.includes(c.id)}
                onToggle={() => toggle(c.id)}
              />
            </Column>
          </Fragment>
        ))}
      </Card>
    </>
  )
}

function ComplaintItem(props: { summary: ComplaintSummary; open: boolean; onToggle: () => void }) {
  const c = props.summary
  const colors = useColors()
  const severity = [
    c.crashes > 0 ? plural(c.crashes, 'crash', 'crashes') : null,
    c.fires > 0 ? plural(c.fires, 'fire') : null,
    c.injuries > 0 ? plural(c.injuries, 'injury', 'injuries') : null,
    c.deaths > 0 ? plural(c.deaths, 'death') : null,
  ].filter(Boolean)
  const peak = peakMileage(c)
  return (
    <Collapsible
      isOpen={props.open}
      onOpenChange={props.onToggle}
      label={`${componentLabel(c.component)} · ${plural(c.complaints, 'complaint')}`}
      labelStyle={{ fontSize: 16, fontWeight: '600' }}
    >
      <Column spacing={8}>
        {peak ? <Note>{`Reported most often at ${peak}`}</Note> : null}
        {severity.length > 0 ? (
          <Text textStyle={{ ...LABEL, color: colors.danger }}>{severity.join(' · ')}</Text>
        ) : null}
        {c.recent.map((complaint, i) => (
          <Column key={i} spacing={2}>
            {complaint.filedOn ? <Note>{complaint.filedOn}</Note> : null}
            <Text>{complaint.summary}</Text>
          </Column>
        ))}
      </Column>
    </Collapsible>
  )
}

function Detail({ label, text }: { label: string; text: string }) {
  const colors = useColors()
  return (
    <Column spacing={2}>
      <Text textStyle={{ ...LABEL, color: colors.textPrimary }}>{label}</Text>
      <Text textStyle={{ fontSize: 15, color: colors.textPrimary }}>{text}</Text>
    </Column>
  )
}
