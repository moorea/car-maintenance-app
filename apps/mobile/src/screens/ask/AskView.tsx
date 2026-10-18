import type { AnswerSourceKind, AskActions, AskState, ChatMessage } from '@car/core'
import { Column, Row, ScrollView, Spacer } from '@expo/ui'
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { useColors } from '../../theme'
import { ChatComposer } from '../../ui/ChatComposer'
import { ChatScroll } from '../../ui/ChatScroll'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Bubble, Card, Chip, GlassIconButton, GlassPill } from '../../ui/surfaces'
import type { SymbolName } from '../../ui/symbols'
import { PAGE_TOP } from '../../ui/layout'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = AskState &
  Pick<AskActions, 'setDraft' | 'send' | 'ask' | 'stop' | 'retry' | 'newConversation'> & {
    onBack: () => void
  }

const SOURCE_SYMBOLS: Record<AnswerSourceKind, SymbolName> = {
  car: 'car',
  schedule: 'clock',
  service: 'log',
  recall: 'warning',
  bulletin: 'bulletin',
  complaints: 'source',
  complaint: 'source',
}

/** Pure rendering of a conversation with the assistant about one car. */
export function AskView(props: Props) {
  const colors = useColors()
  const { status, messages, error } = props
  const answering = status === 'answering'
  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Host matchContents={{ vertical: true }} style={styles.bar}>
          <Row alignment="center">
            <GlassIconButton symbol="back" label="Back" onPress={props.onBack} />
            <Spacer flexible />
            <Column alignment="center">
              <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Ask</Text>
              <Text textStyle={{ fontSize: 12, color: colors.textSecondary }}>
                {props.carTitle}
              </Text>
            </Column>
            <Spacer flexible />
            <GlassIconButton
              symbol="compose"
              label="New conversation"
              onPress={props.newConversation}
            />
          </Row>
        </Host>
      </View>

      <Host style={styles.fill}>
        <ChatScroll>
          <Column spacing={12} style={{ padding: 16 }}>
            {messages.length === 0 ? <Welcome {...props} /> : null}
            {messages.map((m) =>
              m.role === 'user' ? <Question key={m.id} {...m} /> : <Answer key={m.id} {...m} />,
            )}
            {error ? (
              <Row alignment="center" spacing={8}>
                <ErrorText>{error.message}</ErrorText>
                <Button variant="text" label="Try again" onPress={props.retry} />
              </Row>
            ) : null}
          </Column>
        </ChatScroll>
      </Host>

      <View style={styles.dock}>
        <Host matchContents={{ vertical: true }} style={styles.bar}>
          <Column spacing={10}>
            {messages.length === 0 && status === 'ready' ? (
              <ScrollView direction="horizontal" showsIndicators={false}>
                <Row spacing={8}>
                  {props.suggestions.map((s) => (
                    <GlassPill
                      key={s.label}
                      label={s.label}
                      onPress={() => props.ask(s.question)}
                    />
                  ))}
                </Row>
              </ScrollView>
            ) : null}
            <ChatComposer
              value={props.draft}
              onChangeText={props.setDraft}
              onSubmit={props.send}
              placeholder={`Ask about your ${props.carName}`}
              action={
                answering
                  ? {
                      symbol: 'stop',
                      label: 'Stop answering',
                      onPress: props.stop,
                      disabled: false,
                    }
                  : { symbol: 'send', label: 'Send', onPress: props.send, disabled: !props.canSend }
              }
            />
          </Column>
        </Host>
      </View>
    </KeyboardAvoidingView>
  )
}

function Welcome({ status, carName }: Props) {
  if (status === 'unmatched') {
    return (
      <Card spacing={6}>
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Almost ready</Text>
        <Text>Ask can answer once this car has finished syncing. Check back in a minute.</Text>
      </Card>
    )
  }
  return (
    <Card spacing={6}>
      <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{`Ask about your ${carName}`}</Text>
      <Text>
        Answers come only from what the app knows about this car: its maintenance schedule, recalls,
        owner complaints and your service log. Each answer shows where it came from.
      </Text>
      <Note>For anything that affects safety, have a mechanic check the car.</Note>
    </Card>
  )
}

function Question(message: ChatMessage) {
  const colors = useColors()
  return (
    <Row style={{ paddingLeft: 56 }}>
      <Spacer flexible />
      <Bubble fill="accent">
        <Text textStyle={{ fontSize: 16, color: colors.onAccent }}>{message.text}</Text>
      </Bubble>
    </Row>
  )
}

function Answer({ text, sources, state }: ChatMessage) {
  const colors = useColors()
  // Paragraphs become separate texts, spaced like the mockup.
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== '')
  return (
    <Row style={{ paddingRight: 32 }}>
      <Bubble fill="surface">
        {paragraphs.length === 0 ? (
          <Text textStyle={{ fontSize: 16, color: colors.textSecondary }}>Thinking…</Text>
        ) : (
          paragraphs.map((p, i) => (
            <Text key={i} textStyle={{ fontSize: 16 }}>
              {p.trim()}
            </Text>
          ))
        )}
        {sources.length > 0 ? (
          <ScrollView direction="horizontal" showsIndicators={false}>
            <Row spacing={6}>
              {sources.map((s) => (
                <Chip key={`${s.kind}:${s.id}`} label={s.label} symbol={SOURCE_SYMBOLS[s.kind]} />
              ))}
            </Row>
          </ScrollView>
        ) : null}
        {state === 'stopped' ? <Note>Stopped</Note> : null}
      </Bubble>
      <Spacer flexible />
    </Row>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { width: '100%' },
  header: { paddingTop: PAGE_TOP, paddingHorizontal: 16, paddingBottom: 8 },
  dock: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
})
