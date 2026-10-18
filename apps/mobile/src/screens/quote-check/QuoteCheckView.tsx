import {
  formatCents,
  type CheckedLine,
  type FairPrices,
  type PricedLine,
  type PriceFit,
  type QuoteCheck,
  type QuoteCheckActions,
  type QuoteCheckState,
  type QuoteVerdict,
  type RepairWeighing,
} from '@car/core'
import { Button, Column, Row, ScrollView, Spacer } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Symbol } from '../../ui/Symbol'
import { TextField } from '../../ui/TextField'
import {
  Card,
  FillColumn,
  GlassIconButton,
  PillButton,
  Separator,
  TappableRow,
} from '../../ui/surfaces'
import { Text } from '../../ui/Text'

type Props = QuoteCheckState &
  Pick<
    QuoteCheckActions,
    | 'setDraft'
    | 'takePhoto'
    | 'choosePhoto'
    | 'cancelReading'
    | 'check'
    | 'edit'
    | 'startOver'
    | 'setValueDraft'
    | 'saveValue'
    | 'setZip'
    | 'estimatePrices'
  > & {
    onBack: () => void
    /** Asks the assistant about the line at this index. */
    onAsk: (index: number) => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

/** How each verdict's pill looks: worth questioning in warning, due in the accent, else quiet. */
const PILLS: Record<QuoteVerdict, { fill: ColorRole; text: ColorRole }> = {
  due: { fill: 'accentSubtle', text: 'accent' },
  'not-due': { fill: 'warningSubtle', text: 'warning' },
  done: { fill: 'warningSubtle', text: 'warning' },
  'severe-only': { fill: 'warningSubtle', text: 'warning' },
  'not-scheduled': { fill: 'warningSubtle', text: 'warning' },
  recall: { fill: 'warningSubtle', text: 'warning' },
  condition: { fill: 'neutralSubtle', text: 'textSecondary' },
  'no-record': { fill: 'neutralSubtle', text: 'textSecondary' },
  unknown: { fill: 'neutralSubtle', text: 'textSecondary' },
}

/** How a line's price sits against the usual range: over it in warning, else quiet. */
const FIT_COLORS: Record<PriceFit, ColorRole> = {
  below: 'textSecondary',
  within: 'accent',
  above: 'warning',
  'well-above': 'warning',
}

/** Pure rendering of checking a shop's quote: enter the lines, then each line's verdict. */
export function QuoteCheckView(props: Props) {
  const colors = useColors()
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
              <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Check a quote</Text>
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
      {props.status === 'reading' || props.status === 'checking' ? (
        <Working {...props} />
      ) : (
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
      )}
    </KeyboardAvoidingView>
  )
}

function Working({ status, cancelReading }: Props) {
  const colors = useColors()
  return (
    <View style={[styles.fill, styles.working]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Host matchContents={{ vertical: true }} style={styles.bar}>
        <Column alignment="center" spacing={8}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>
            {status === 'reading' ? 'Reading the quote…' : 'Checking each line…'}
          </Text>
          {status === 'reading' ? (
            <Button variant="text" label="Cancel" onPress={cancelReading} />
          ) : null}
        </Column>
      </Host>
    </View>
  )
}

function Entry(props: Props) {
  const colors = useColors()
  if (props.unmatched)
    return (
      <Card spacing={6}>
        <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Almost ready</Text>
        <Text>Quotes can be checked once this car has synced its schedule. Check back soon.</Text>
      </Card>
    )
  return (
    <>
      <Card spacing={12}>
        <Row alignment="center" spacing={10}>
          <Symbol name="quote" size={22} color={colors.accent} />
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Before you say yes</Text>
        </Row>
        <Text>
          Photograph the shop’s list of recommended work. Each line is checked against your car’s
          schedule, service log and recalls.
        </Text>
        <Row spacing={10}>
          <PillButton
            label="Take photo"
            onPress={() => void props.takePhoto()}
            fill="accent"
            text="onAccent"
          />
          <PillButton
            label="Choose photo"
            onPress={() => void props.choosePhoto()}
            fill="accentSubtle"
            text="accent"
          />
        </Row>
        <Note>The photo is read once and not kept.</Note>
      </Card>
      {props.error ? <ErrorText>{props.error}</ErrorText> : null}
      <Card spacing={12}>
        <TextField
          label="Or type the lines"
          value={props.draft}
          onChangeText={props.setDraft}
          placeholder={'One job per line, with its price\nOil change $89.95'}
          lines={6}
        />
        <Row spacing={8} alignment="center">
          <Button
            label="Check quote"
            disabled={!props.canCheck}
            onPress={() => void props.check()}
          />
          {props.draft ? <Button variant="text" label="Clear" onPress={props.startOver} /> : null}
        </Row>
      </Card>
    </>
  )
}

function Result(props: Props & { result: QuoteCheck }) {
  const colors = useColors()
  const { result } = props
  const fair = props.prices?.status === 'ready' ? props.prices.fair : undefined
  return (
    <>
      <Card spacing={6}>
        <Text textStyle={{ fontSize: 24, fontWeight: '700' }}>{result.headline}</Text>
        {result.savings ? (
          <Text textStyle={{ fontSize: 16, color: colors.warning, fontWeight: '600' }}>
            {result.savings}
          </Text>
        ) : null}
        {result.generalSchedule ? (
          <Note>
            Checked against a general schedule, not your manufacturer’s. Your owner’s manual has the
            exact intervals.
          </Note>
        ) : null}
      </Card>

      <FairPricesCard {...props} fair={fair} />

      <Column spacing={8}>
        <Text
          style={{ paddingHorizontal: 4 }}
          textStyle={{ ...OVERLINE, color: colors.textSecondary }}
        >
          EACH LINE · TAP TO ASK ABOUT IT
        </Text>
        <Card padding={0}>
          {result.lines.map((line, i) => (
            <Fragment key={line.index}>
              {i > 0 ? <Separator /> : null}
              <LineRow
                line={line}
                priced={fair?.lines.find((p) => p.index === line.index)}
                onPress={() => props.onAsk(line.index)}
              />
            </Fragment>
          ))}
        </Card>
      </Column>

      {result.alsoDue.length > 0 ? (
        <Card spacing={6}>
          <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Due now but not on the quote</Text>
          <Text textStyle={{ color: colors.textSecondary }}>{result.alsoDue.join(', ')}</Text>
        </Card>
      ) : null}

      {result.recalls.length > 0 ? (
        <Card fill="warningSubtle" spacing={8}>
          <Row alignment="center" spacing={10}>
            <Symbol name="warning" size={20} color={colors.warning} />
            <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Ask about these recalls</Text>
          </Row>
          <Text>
            Recalls for this model year. Ask the shop to check your VIN; recall fixes are free.
          </Text>
          {result.recalls.map((r) => (
            <Text key={r.campaign} textStyle={{ fontSize: 14 }}>
              {`${r.campaign} · ${r.title}`}
            </Text>
          ))}
        </Card>
      ) : null}

      {props.weighing ? <Weighing {...props} weighing={props.weighing} /> : null}

      <Row spacing={10}>
        <PillButton label="Edit lines" onPress={props.edit} fill="surface" text="accent" />
        <PillButton
          label="Check another"
          onPress={props.startOver}
          fill="accentSubtle"
          text="accent"
        />
      </Row>
    </>
  )
}

/** Whether to pay for a big quote or replace the car, with the car's value to weigh it against. */
function Weighing(props: Props & { weighing: RepairWeighing }) {
  const colors = useColors()
  const { weighing } = props
  const known = weighing.share !== undefined
  return (
    <Card spacing={10}>
      <Row alignment="center" spacing={10}>
        <Symbol name="car" size={20} color={colors.accent} />
        <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Repair or replace?</Text>
      </Row>
      <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{weighing.headline}</Text>
      {weighing.points.map((point) => (
        <Text key={point} textStyle={{ fontSize: 15, color: colors.textSecondary }}>
          {point}
        </Text>
      ))}
      {weighing.dueNextYear.length > 0 ? (
        <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
          {`Also due in the next 12 months: ${weighing.dueNextYear.join(', ')}.`}
        </Text>
      ) : null}
      <TextField
        label={known ? 'What the car is worth' : 'What’s the car worth?'}
        value={props.valueDraft}
        onChangeText={props.setValueDraft}
        error={props.valueError}
        placeholder="Dollars, like 9,500"
        keyboardType="decimal-pad"
      />
      {weighing.valueStale ? (
        <Note>You gave this value over a year ago. Cars lose value every year, so update it.</Note>
      ) : (
        <Note>Your own estimate, such as a dealer’s trade-in offer. It stays with this car.</Note>
      )}
      <Row>
        <Button
          label={known ? 'Update value' : 'Weigh against value'}
          onPress={() => void props.saveValue()}
        />
      </Row>
    </Card>
  )
}

/**
 * Fair prices for the quote, which Claude estimates. Labeled as an estimate wherever it shows, as
 * no one has seen the car.
 */
function FairPricesCard(props: Props & { fair: FairPrices | undefined }) {
  const colors = useColors()
  const { fair, prices } = props
  const estimating = prices?.status === 'estimating'
  return (
    <Card spacing={10}>
      <Row alignment="center" spacing={10}>
        <Symbol name="price" size={20} color={colors.accent} />
        <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>Fair prices</Text>
        <Spacer flexible />
        <EstimateLabel />
      </Row>
      {fair ? (
        <>
          {fair.headline ? (
            <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{fair.headline}</Text>
          ) : null}
          {fair.summary ? (
            <Text
              textStyle={{
                fontSize: 15,
                color: fair.lines.some((l) => l.fit === 'above' || l.fit === 'well-above')
                  ? colors.warning
                  : colors.textSecondary,
              }}
            >
              {fair.summary}
            </Text>
          ) : null}
          {fair.lines.length === 0 ? (
            <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
              None of these lines could be estimated. Ask the shop what each one involves.
            </Text>
          ) : null}
          <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>{fair.laborRate}</Text>
          <Note>
            An AI estimate from typical labor times, parts and shop rates for your car and area, not
            a quote. Shops vary, and only one that has seen the car can say for sure.
          </Note>
        </>
      ) : (
        <Text>
          See what these jobs usually cost near you. Claude estimates each one from typical labor
          times, parts and local shop rates.
        </Text>
      )}
      {prices?.status === 'failed' ? <ErrorText>{prices.error}</ErrorText> : null}
      <TextField
        label="Your ZIP code"
        value={props.zipDraft}
        onChangeText={props.setZip}
        placeholder="5 digits, like 94110"
        keyboardType="number-pad"
      />
      <Row alignment="center" spacing={10}>
        <Button
          label={estimating ? 'Estimating…' : fair ? 'Estimate again' : 'Estimate fair prices'}
          disabled={!props.canEstimate}
          onPress={() => void props.estimatePrices()}
        />
        {estimating ? <ActivityIndicator color={colors.accent} /> : null}
      </Row>
      {fair ? null : (
        <Note>
          The lines, your car and ZIP code are sent to Anthropic. The shop’s prices are not.
        </Note>
      )}
    </Card>
  )
}

/** The small "AI estimate" tag that marks every estimated price. */
function EstimateLabel() {
  const colors = useColors()
  return (
    <Text
      textStyle={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: colors.neutralSubtle,
      }}
    >
      AI estimate
    </Text>
  )
}

function LineRow({
  line,
  priced,
  onPress,
}: {
  line: CheckedLine
  priced: PricedLine | undefined
  onPress: () => void
}) {
  const colors = useColors()
  const pill = PILLS[line.verdict]
  return (
    <TappableRow spacing={4} onPress={onPress}>
      <Row alignment="center" spacing={10}>
        <FillColumn>
          <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{line.text}</Text>
        </FillColumn>
        {line.priceCents !== undefined ? (
          <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
            {formatCents(line.priceCents)}
          </Text>
        ) : null}
      </Row>
      <Row alignment="center" spacing={8}>
        <Text
          textStyle={{ fontSize: 13, fontWeight: '600', color: colors[pill.text] }}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 12,
            backgroundColor: colors[pill.fill],
          }}
        >
          {line.label}
        </Text>
        <Spacer flexible />
      </Row>
      <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>{line.detail}</Text>
      {priced ? (
        <Column spacing={2}>
          <Row alignment="center" spacing={8}>
            <Symbol name="price" size={14} color={colors[FIT_COLORS[priced.fit ?? 'below']]} />
            <FillColumn>
              <Text
                textStyle={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors[FIT_COLORS[priced.fit ?? 'below']],
                }}
              >
                {priced.fitLabel ? `${priced.range} · ${priced.fitLabel}` : priced.range}
              </Text>
            </FillColumn>
          </Row>
          <Text textStyle={{ fontSize: 12, color: colors.textSecondary }}>
            {`AI estimate: ${priced.breakdown}`}
          </Text>
        </Column>
      ) : null}
      {line.bulletins.map((b) => (
        <Row key={b.nhtsaId} alignment="center" spacing={8}>
          <Symbol
            name={b.mayBeFree ? 'shield' : 'bulletin'}
            size={14}
            color={b.mayBeFree ? colors.accent : colors.textSecondary}
          />
          <FillColumn>
            <Text
              textStyle={{
                fontSize: 13,
                fontWeight: b.mayBeFree ? '600' : '400',
                color: b.mayBeFree ? colors.accent : colors.textSecondary,
              }}
            >
              {`${b.name}: ${b.title}`}
            </Text>
          </FillColumn>
        </Row>
      ))}
    </TappableRow>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { width: '100%' },
  header: { paddingTop: 58, paddingHorizontal: 16, paddingBottom: 8 },
  balance: { width: 44 },
  working: { alignItems: 'center', justifyContent: 'center', gap: 16 },
})
