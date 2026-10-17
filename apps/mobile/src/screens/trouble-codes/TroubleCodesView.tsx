import {
  componentLabel,
  type CodeLookup,
  type CodeResult,
  type CodeUrgency,
  type TroubleCodesActions,
  type TroubleCodesState,
} from '@car/core'
import { Button, Column, Row, ScrollView, Spacer, Switch, Text } from '@expo/ui'
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Symbol } from '../../ui/Symbol'
import type { SymbolName } from '../../ui/symbols'
import { TextField } from '../../ui/TextField'
import { Card, FillColumn, GlassIconButton, PillButton } from '../../ui/surfaces'

type Props = TroubleCodesState &
  Pick<TroubleCodesActions, 'setDraft' | 'setFlashing' | 'check' | 'edit' | 'startOver'> & {
    onBack: () => void
    /** Asks the assistant about this code. */
    onAsk: (code: string) => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

/** How each urgency looks: stopping in danger, soon in warning, can wait in the accent. */
const URGENCY: Record<
  CodeUrgency,
  { label: string; symbol: SymbolName; text: ColorRole; fill: ColorRole }
> = {
  stop: { label: 'Stop driving', symbol: 'warning', text: 'danger', fill: 'warningSubtle' },
  soon: { label: 'Fix soon', symbol: 'warning', text: 'warning', fill: 'warningSubtle' },
  later: { label: 'Can wait', symbol: 'checkmark', text: 'accent', fill: 'accentSubtle' },
}

/** Pure rendering of looking up check-engine codes: enter the codes, then what each one means. */
export function TroubleCodesView(props: Props) {
  const colors = useColors()
  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Host matchContents={{ vertical: true }} style={styles.bar}>
          <Row alignment="center">
            <GlassIconButton symbol="back" onPress={props.onBack} />
            <Spacer flexible />
            <Column alignment="center">
              <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Check-engine light</Text>
              <Text textStyle={{ fontSize: 12, color: colors.textSecondary }}>
                {props.carTitle}
              </Text>
            </Column>
            <Spacer flexible />
            {/* Balances the back button so the title stays centred. */}
            <View style={styles.balance} />
          </Row>
        </Host>
      </View>
      <Host style={styles.fill}>
        <ScrollView>
          <Column spacing={14} style={{ padding: 16, paddingBottom: 40 }}>
            {props.status === 'checked' && props.result ? (
              <Result {...props} result={props.result} />
            ) : (
              <Entry {...props} />
            )}
          </Column>
        </ScrollView>
      </Host>
    </KeyboardAvoidingView>
  )
}

function Entry(props: Props) {
  const colors = useColors()
  return (
    <>
      <Card spacing={12}>
        <Row alignment="center" spacing={10}>
          <Symbol name="engine" size={22} color={colors.accent} />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>What is your car telling you?</Text>
        </Row>
        <Text>
          Type the code a scan tool read. Most auto parts stores read codes for free, and a
          Bluetooth reader costs about $20.
        </Text>
        <TextField
          label="Codes"
          value={props.draft}
          onChangeText={props.setDraft}
          placeholder="P0420, P0171"
          autoCapitalize="characters"
        />
        <Switch
          label="The light is flashing"
          value={props.flashing}
          onValueChange={props.setFlashing}
        />
        {props.error ? <ErrorText>{props.error}</ErrorText> : null}
        <Row spacing={8} alignment="center">
          <Button label="Look up" disabled={!props.canCheck} onPress={props.check} />
          {props.draft ? <Button variant="text" label="Clear" onPress={props.startOver} /> : null}
        </Row>
      </Card>
      <Note>
        If the light is flashing, or the temperature or oil light is on too, pull over when it’s
        safe and turn the engine off.
      </Note>
    </>
  )
}

function Result(props: Props & { result: CodeResult }) {
  const colors = useColors()
  const { result } = props
  const look = URGENCY[result.urgency]
  return (
    <>
      <Card spacing={8}>
        <Row alignment="center" spacing={10}>
          <Symbol name={look.symbol} size={26} color={colors[look.text]} />
          <Text textStyle={{ fontSize: 24, fontWeight: '700', color: colors[look.text] }}>
            {result.headline}
          </Text>
        </Row>
        <Text>{result.advice}</Text>
      </Card>

      {result.codes.map((code) => (
        <CodeCard
          key={code.code}
          code={code}
          carTitle={props.carTitle}
          onAsk={() => props.onAsk(code.code)}
        />
      ))}

      <Note>
        A guide, not a diagnosis: a code says what the car noticed, not always which part failed.
        Ask the shop what they tested before replacing parts.
      </Note>

      <Row spacing={10}>
        <PillButton label="Edit codes" onPress={props.edit} fill="surface" text="accent" />
        <PillButton
          label="Look up another"
          onPress={props.startOver}
          fill="accentSubtle"
          text="accent"
        />
      </Row>
    </>
  )
}

function CodeCard({
  code,
  carTitle,
  onAsk,
}: {
  code: CodeLookup
  carTitle: string
  onAsk: () => void
}) {
  const colors = useColors()
  const look = URGENCY[code.urgency]
  return (
    <Card spacing={10}>
      <Row alignment="center" spacing={8}>
        <FillColumn spacing={2}>
          <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
            {`${code.code} · ${code.systemLabel.toUpperCase()}`}
          </Text>
          <Text textStyle={{ fontSize: 18, fontWeight: '600' }}>{code.title}</Text>
        </FillColumn>
        <Text
          textStyle={{ fontSize: 13, fontWeight: '600', color: colors[look.text] }}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 12,
            backgroundColor: colors[look.fill],
          }}
        >
          {look.label}
        </Text>
      </Row>

      {code.causes.length > 0 ? (
        <Column spacing={4}>
          <Text textStyle={{ fontSize: 14, fontWeight: '600' }}>Usual causes</Text>
          {code.causes.map((cause) => (
            <Text key={cause} textStyle={{ fontSize: 15, color: colors.textSecondary }}>
              {`• ${cause}`}
            </Text>
          ))}
        </Column>
      ) : null}

      {code.tip ? <Text textStyle={{ fontSize: 15 }}>{code.tip}</Text> : null}

      {code.warranty ? (
        <Card fill="accentSubtle" padding={12} spacing={4}>
          <Row alignment="center" spacing={8}>
            <Symbol name="shield" size={18} color={colors.accent} />
            <Text textStyle={{ fontSize: 15, fontWeight: '600', color: colors.accent }}>
              May be under warranty
            </Text>
          </Row>
          <Text textStyle={{ fontSize: 14 }}>{code.warranty}</Text>
        </Card>
      ) : null}

      {code.recalls.length > 0 || code.complaints.length > 0 ? (
        <Card fill="warningSubtle" padding={12} spacing={4}>
          {code.recalls.map((r) => (
            <Text key={r.campaign} textStyle={{ fontSize: 14, fontWeight: '600' }}>
              {`Recall ${r.campaign}${r.component ? ` · ${componentLabel(r.component)}` : ''}. Ask a dealer to check your VIN; the fix is free.`}
            </Text>
          ))}
          {code.complaints.map((c) => (
            <Text key={c.id} textStyle={{ fontSize: 14 }}>
              {`${c.complaints.toLocaleString()} ${c.complaints === 1 ? 'owner' : 'owners'} of the ${carTitle} reported ${componentLabel(c.component).toLowerCase()} problems to NHTSA.`}
            </Text>
          ))}
        </Card>
      ) : null}

      <Button variant="outlined" label={`Ask about ${code.code}`} onPress={onAsk} />
    </Card>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { width: '100%' },
  header: { paddingTop: 58, paddingHorizontal: 16, paddingBottom: 8 },
  balance: { width: 44 },
})
