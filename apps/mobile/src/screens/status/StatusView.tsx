import type { StatusCheck, StatusLevel, StatusStat, StatusState, StatusTone } from '@car/core'
import { Column, Row, ScrollView, Spacer } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { TITLE_TOP } from '../../ui/layout'
import { Note } from '../../ui/Note'
import { Reflow } from '../../ui/Reflow'
import { StatusRing } from '../../ui/StatusRing'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { Text } from '../../ui/Text'
import { Card, Dot, FillColumn, Separator } from '../../ui/surfaces'

type Props = StatusState & {
  /** The car's nickname, or its year, make and model. */
  carName: string
}

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

// Overdue items and open recalls need the owner, due soon is the accent, the rest stays quiet.
const TONE: Record<StatusTone, ColorRole> = {
  attention: 'warning',
  soon: 'accent',
  ok: 'accent',
  later: 'textSecondary',
  quiet: 'textSecondary',
}

const WORD: Record<StatusLevel, ColorRole> = {
  attention: 'warning',
  soon: 'accent',
  good: 'textPrimary',
}

// What a check's dot says, for VoiceOver.
const TONE_LABEL: Record<StatusTone, string> = {
  attention: 'Needs attention',
  soon: 'Worth a look',
  ok: 'Fine',
  later: 'Later',
  quiet: 'Not known yet',
}

/** Pure rendering of the status model: the ring, the status word and why, stats and checks. */
export function StatusView({ status, summary, carName }: Props) {
  const colors = useColors()
  if (status === 'loading') return <ActivityIndicator style={styles.fill} />
  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={16}
          style={{ padding: 16, paddingTop: TITLE_TOP, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Column spacing={2}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {carName.toUpperCase()}
            </Text>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Status</Text>
          </Column>
          {status === 'unmatched' || !summary ? (
            <Note>
              {"Your car's status appears once it has synced, with its schedule and recalls."}
            </Note>
          ) : (
            <>
              <Column alignment="center" spacing={12}>
                <StatusRing
                  segments={summary.segments.map((s) => ({
                    key: s.key,
                    color: TONE[s.tone],
                  }))}
                  count={summary.needYou}
                  caption="need you"
                  label={summary.ringLabel}
                />
                <Text
                  textStyle={{
                    fontSize: 28,
                    fontWeight: '700',
                    color: colors[WORD[summary.level]],
                  }}
                >
                  {summary.word}
                </Text>
                <Text
                  textStyle={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center' }}
                >
                  {summary.sentence}
                </Text>
              </Column>
              <Reflow spacing={10}>
                {summary.stats.map((s, i) => (
                  <Stat key={i} stat={s} />
                ))}
              </Reflow>
              <Row style={{ paddingHorizontal: 4 }}>
                <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>CHECKS</Text>
              </Row>
              <Card padding={0}>
                {summary.checks.map((c, i) => (
                  <Fragment key={c.key}>
                    {i > 0 ? <Separator inset={38} /> : null}
                    <CheckRow check={c} />
                  </Fragment>
                ))}
              </Card>
            </>
          )}
        </Column>
      </ScrollView>
    </Host>
  )
}

function Stat({ stat }: { stat: StatusStat }) {
  const colors = useColors()
  return (
    <FillColumn>
      <Card padding={14} spacing={2}>
        <Text textStyle={{ fontSize: 24, fontWeight: '700' }}>{stat.value}</Text>
        <Text textStyle={{ ...OVERLINE, fontSize: 11, color: colors.textSecondary }}>
          {stat.label.toUpperCase()}
        </Text>
      </Card>
    </FillColumn>
  )
}

function CheckRow({ check }: { check: StatusCheck }) {
  const colors = useColors()
  return (
    <Row alignment="center" spacing={12} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <Dot color={TONE[check.tone]} label={TONE_LABEL[check.tone]} />
      <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{check.title}</Text>
      <Spacer flexible />
      <Text
        textStyle={{
          fontSize: 15,
          fontWeight: check.tone === 'attention' ? '600' : '400',
          color: check.tone === 'attention' ? colors.warning : colors.textSecondary,
        }}
      >
        {check.value}
      </Text>
    </Row>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
