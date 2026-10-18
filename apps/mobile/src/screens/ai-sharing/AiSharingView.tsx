import type { AiSharingState } from '@car/core'
import { Column, Row, ScrollView } from '@expo/ui'
import { StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Card, FillColumn, GlassIconButton, PillButton } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import type { SymbolName } from '../../ui/symbols'
import { PAGE_TOP } from '../../ui/layout'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = AiSharingState & {
  /** Which screen asked, so the copy names what it sends. */
  feature: 'ask' | 'quote'
  onAllow: () => void
  onBack: () => void
  onPrivacyPolicy: () => void
}

const SENT: Record<Props['feature'], string> = {
  ask: "Your question, and this car's details (including its VIN, nickname and the value you gave it), schedule, odometer readings and service log (with costs, shops and your notes), and the recalls and owner complaints for its model.",
  quote:
    "The photo of the quote, to read its lines. Then, only if you ask about a line, your question and this car's records, as in Ask.",
}

/**
 * Pure rendering of the permission Ask and the quote checker need before sending anything to
 * Anthropic: what is sent, to whom, and how it is handled (App Store guideline 5.1.2(i)).
 */
export function AiSharingView(props: Props) {
  const colors = useColors()
  const saving = props.status === 'saving'
  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column spacing={16} style={{ padding: 16, paddingTop: PAGE_TOP }}>
          <Row>
            <GlassIconButton symbol="back" label="Back" onPress={props.onBack} />
          </Row>
          <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>
            {props.feature === 'ask' ? 'Before you ask' : 'Before you check a quote'}
          </Text>
          <Text textStyle={{ fontSize: 17, color: colors.textSecondary }}>
            {props.feature === 'ask'
              ? 'Answers are written by Claude, an AI model made by Anthropic. To answer, it needs to see some of your data.'
              : 'Quotes are read by Claude, an AI model made by Anthropic. To read one, it needs to see the photo.'}
          </Text>

          <Card padding={0}>
            <Point symbol="document" title="What's sent" body={SENT[props.feature]} />
            <Point
              symbol="ask"
              title="When"
              body="Only when you send a question or check a quote. Nothing is sent in the background."
            />
            <Point
              symbol="shield"
              title="How it's handled"
              body="Under its commercial terms, Anthropic doesn't use it to train its models and generally deletes it within 30 days. Your Ask conversations stay in your account until you delete the account."
            />
          </Card>

          {props.error ? <ErrorText>{props.error}</ErrorText> : null}
          <Row spacing={10}>
            <PillButton
              label="Not now"
              onPress={props.onBack}
              fill="neutralSubtle"
              text="textPrimary"
            />
            <PillButton
              label={saving ? 'Saving…' : 'Allow'}
              onPress={saving ? () => {} : props.onAllow}
              fill="accent"
              text="onAccent"
            />
          </Row>
          <Note>
            Ask and the quote checker need this. You can turn it off in Account at any time, and
            everything else in the app works without it.
          </Note>
          <Button variant="text" label="Privacy policy" onPress={props.onPrivacyPolicy} />
        </Column>
      </ScrollView>
    </Host>
  )
}

function Point({ symbol, title, body }: { symbol: SymbolName; title: string; body: string }) {
  const colors = useColors()
  return (
    <Row spacing={12} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <Symbol name={symbol} size={22} color={colors.accent} leading />
      <FillColumn spacing={2}>
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{title}</Text>
        <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>{body}</Text>
      </FillColumn>
    </Row>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
