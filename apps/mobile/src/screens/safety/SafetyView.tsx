import {
  componentLabel,
  type ComplaintSummary,
  type Recall,
  type SafetyActions,
  type SafetyState,
} from '@car/core'
import { Button, Collapsible, Column, ScrollView, Text } from '@expo/ui'
import { ActivityIndicator, Linking, StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { Note } from '../../ui/Note'

type Props = SafetyState & Pick<SafetyActions, 'toggle'>

const HEADING = { fontSize: 20, fontWeight: '700' } as const
const LABEL = { fontSize: 13, fontWeight: '600' } as const

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

/** Pure rendering of the safety model: NHTSA recalls, then owner complaints by component. */
export function SafetyView(props: Props) {
  if (props.status === 'loading') return <ActivityIndicator style={styles.fill} />

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column spacing={12} style={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE }}>
          <Text textStyle={HEADING}>Recalls</Text>
          <Recalls {...props} />
          <Text textStyle={HEADING}>Owner complaints</Text>
          <Complaints {...props} />
          <Note>From the National Highway Traffic Safety Administration.</Note>
        </Column>
      </ScrollView>
    </Host>
  )
}

function Recalls({ status, recalls, expanded, toggle, lookupUrl, modelYear }: Props) {
  if (status === 'unmatched') {
    return <Note>Recalls appear once your car has synced.</Note>
  }
  if (status === 'checking') {
    return <Note>Checking NHTSA for recalls on your model year…</Note>
  }
  return (
    <>
      <Text>
        {recalls.length === 0
          ? `NHTSA lists no recalls for the ${modelYear}.`
          : `NHTSA lists ${plural(recalls.length, 'recall')} for the ${modelYear}. Not every recall covers every car, and yours may already be fixed.`}
      </Text>
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
  return (
    <Column spacing={4}>
      {r.parkIt ? (
        <Text textStyle={{ ...LABEL, color: colors.danger }}>Do not drive until this is fixed</Text>
      ) : r.parkOutside ? (
        <Text textStyle={{ ...LABEL, color: colors.danger }}>
          Park outside, away from buildings, until this is fixed
        </Text>
      ) : null}
      <Collapsible
        isOpen={props.open}
        onOpenChange={props.onToggle}
        label={r.reportedOn ? `${title} · ${r.reportedOn}` : title}
        labelStyle={{ fontSize: 16, fontWeight: '600' }}
      >
        <Column spacing={8}>
          <Text>{r.summary}</Text>
          {r.consequence ? <Detail label="Risk" text={r.consequence} /> : null}
          {r.remedy ? <Detail label="Fix" text={r.remedy} /> : null}
          {r.overTheAir ? <Note>Fixed by an over-the-air update.</Note> : null}
          <Note>{`NHTSA campaign ${r.campaign}`}</Note>
        </Column>
      </Collapsible>
    </Column>
  )
}

function Complaints({ status, complaintsChecked, complaints, expanded, toggle, modelYear }: Props) {
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
      {complaints.map((c) => (
        <ComplaintItem
          key={c.id}
          summary={c}
          open={expanded.includes(c.id)}
          onToggle={() => toggle(c.id)}
        />
      ))}
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
  return (
    <Collapsible
      isOpen={props.open}
      onOpenChange={props.onToggle}
      label={`${componentLabel(c.component)} · ${plural(c.complaints, 'complaint')}`}
      labelStyle={{ fontSize: 16, fontWeight: '600' }}
    >
      <Column spacing={8}>
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
  return (
    <Column spacing={2}>
      <Text textStyle={LABEL}>{label}</Text>
      <Text>{text}</Text>
    </Column>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
