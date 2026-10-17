import type { YourDataActions, YourDataState } from '@car/core'
import { Column, Row, ScrollView, Text } from '@expo/ui'
import { StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { Card, FillColumn, GlassIconButton, PillButton } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import type { SymbolName } from '../../ui/symbols'

type Props = YourDataState &
  Pick<YourDataActions, 'exportAll' | 'chooseImport' | 'confirmImport' | 'cancelImport'> & {
    onBack: () => void
  }

/** Pure rendering of the your-data model: exporting everything, and importing an export. */
export function YourDataView(props: Props) {
  const { status } = props
  const busy = status !== 'ready'

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={16}
          style={{ padding: 16, paddingTop: 60, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          <Row>
            <GlassIconButton symbol="back" onPress={props.onBack} />
          </Row>
          <Column spacing={6}>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Your data</Text>
            <Note>
              Everything you keep here is yours to take with you: to a spreadsheet, another app, or
              this app on a new account.
            </Note>
          </Column>

          {props.message ? <Message {...props.message} /> : null}

          <Action
            symbol="share"
            title="Export everything"
            detail="Your cars, service history, odometer readings, warranties and documents in one zip: spreadsheets (CSV), a JSON file, and the photos and PDFs themselves."
            button={status === 'exporting' ? 'Exporting…' : 'Export'}
            onPress={busy ? undefined : () => void props.exportAll()}
          />
          {status === 'exporting' ? (
            <Note>Downloading any documents this phone doesn't have yet.</Note>
          ) : null}

          {(status === 'confirming-import' || status === 'importing') && props.plan ? (
            <ConfirmImport {...props} plan={props.plan} />
          ) : (
            <Action
              symbol="download"
              title="Import an export"
              detail="Adds the cars in a zip exported from this app to this account. Cars already in your garage are left as they are."
              button={status === 'reading' ? 'Opening…' : 'Choose file'}
              onPress={busy ? undefined : () => void props.chooseImport()}
            />
          )}
        </Column>
      </ScrollView>
    </Host>
  )
}

interface ActionProps {
  symbol: SymbolName
  title: string
  detail: string
  button: string
  /** Absent while something else is running. */
  onPress: (() => void) | undefined
}

function Action({ symbol, title, detail, button, onPress }: ActionProps) {
  const colors = useColors()
  return (
    <Card padding={16} spacing={14}>
      <Row alignment="center" spacing={12}>
        <Column
          alignment="center"
          style={{
            width: 44,
            height: 44,
            padding: 11,
            borderRadius: 14,
            backgroundColor: colors.accentSubtle,
          }}
        >
          <Symbol name={symbol} size={22} color={colors.accent} />
        </Column>
        <FillColumn spacing={4}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>{title}</Text>
          <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>{detail}</Text>
        </FillColumn>
      </Row>
      <Row>
        <PillButton
          label={button}
          onPress={onPress ?? (() => {})}
          fill={onPress ? 'accent' : 'neutralSubtle'}
          text={onPress ? 'onAccent' : 'textSecondary'}
        />
      </Row>
    </Card>
  )
}

function ConfirmImport(props: Props & { plan: NonNullable<YourDataState['plan']> }) {
  const colors = useColors()
  const { adding, skipping } = props.plan
  const importing = props.status === 'importing'
  return (
    <Card padding={18} spacing={12}>
      <Text textStyle={{ fontSize: 20, fontWeight: '700' }}>
        {adding.length === 1 ? 'Import 1 car?' : `Import ${adding.length} cars?`}
      </Text>
      <Column spacing={6}>
        {adding.map((name, i) => (
          <Row key={`${i}-${name}`} alignment="center" spacing={10}>
            <Symbol name="car" size={18} color={colors.accent} />
            <Text>{name}</Text>
          </Row>
        ))}
      </Column>
      <Note>
        {`${adding.length === 1 ? 'With its' : 'With their'} history, warranties and documents.${
          skipping.length > 0
            ? ` Already in your garage, so left as is: ${skipping.join(', ')}.`
            : ''
        }`}
      </Note>
      <Row spacing={10}>
        {importing ? null : (
          <PillButton
            label="Cancel"
            onPress={props.cancelImport}
            fill="neutralSubtle"
            text="textPrimary"
          />
        )}
        <PillButton
          label={importing ? 'Importing…' : 'Import'}
          onPress={() => void props.confirmImport()}
          fill="accent"
          text="onAccent"
        />
      </Row>
    </Card>
  )
}

function Message({ tone, text }: NonNullable<YourDataState['message']>) {
  const colors = useColors()
  return (
    <Card padding={14}>
      <Row alignment="start" spacing={10}>
        <Symbol
          name={tone === 'error' ? 'warning' : 'checkmark'}
          size={20}
          color={tone === 'error' ? colors.danger : colors.accent}
        />
        <FillColumn>
          {tone === 'error' ? <ErrorText>{text}</ErrorText> : <Text>{text}</Text>}
        </FillColumn>
      </Row>
    </Card>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
