import type {
  AccountActions,
  AccountState,
  AiSharingActions,
  AiSharingState,
  RemindersSummary,
} from '@car/core'
import { Column, Row, ScrollView, Switch, Text } from '@expo/ui'
import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { useColors, type ColorRole } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { TAB_BAR_CLEARANCE } from '../../ui/TabBar'
import { Card, FillColumn, GlassIconButton, PillButton } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import type { SymbolName } from '../../ui/symbols'

type Props = AccountState &
  Pick<AccountActions, 'signOut' | 'askToDelete' | 'cancelDelete' | 'confirmDelete'> & {
    onReminders?: (() => void) | undefined
    onBack?: (() => void) | undefined
    onYourData?: (() => void) | undefined
    aiSharing: AiSharingState & Pick<AiSharingActions, 'setOn'>
    onPrivacyPolicy: () => void
  }

const OVERLINE = { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 } as const

const REMINDERS: Record<RemindersSummary, string> = {
  loading: '',
  on: 'On',
  off: 'Off',
  blocked: 'Off in Settings',
}

/** Pure rendering of the account model: who is signed in, reminders, signing out and deleting. */
export function AccountView(props: Props) {
  const colors = useColors()
  const { status } = props
  const idle = status === 'ready'

  return (
    <Host style={styles.fill}>
      <ScrollView>
        <Column
          spacing={16}
          style={{ padding: 16, paddingTop: 60, paddingBottom: TAB_BAR_CLEARANCE }}
        >
          {props.onBack ? (
            <Row>
              <GlassIconButton symbol="back" onPress={props.onBack} />
            </Row>
          ) : null}
          <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Account</Text>

          <Card padding={14}>
            <Row alignment="center" spacing={12}>
              <Column
                alignment="center"
                style={{ padding: 10, borderRadius: 16, backgroundColor: colors.accentSubtle }}
              >
                <Symbol name="person" size={28} color={colors.accent} />
              </Column>
              <FillColumn spacing={2}>
                <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>
                  {props.email ?? 'Signed in'}
                </Text>
                <Text textStyle={{ fontSize: 14, color: colors.textSecondary }}>
                  You sign in with a code sent to this address
                </Text>
              </FillColumn>
            </Row>
          </Card>

          {props.onReminders ? (
            <Section title="NOTIFICATIONS">
              <Card padding={0} onPress={props.onReminders}>
                <SettingRow
                  symbol="bell"
                  label="Service reminders"
                  value={REMINDERS[props.reminders]}
                  chevron
                />
              </Card>
            </Section>
          ) : null}

          {props.onYourData ? (
            <Section title="YOUR DATA">
              <Card padding={0} onPress={props.onYourData}>
                <SettingRow symbol="archive" label="Export or import data" chevron />
              </Card>
            </Section>
          ) : null}

          <Privacy {...props} />

          <Column spacing={8}>
            <Card padding={0} {...(idle && { onPress: () => void props.signOut() })}>
              <SettingRow
                symbol="signOut"
                label={status === 'signing-out' ? 'Signing out…' : 'Sign out'}
                tint="accent"
              />
            </Card>
            <Note>
              Your cars and service history stay in your account, ready for when you sign back in.
            </Note>
          </Column>

          {status === 'confirming-delete' || status === 'deleting' ? (
            <ConfirmDelete {...props} />
          ) : (
            <Column spacing={8}>
              <Card padding={0} {...(idle && { onPress: props.askToDelete })}>
                <SettingRow symbol="trash" label="Delete account" tint="danger" />
              </Card>
              <Note>Deletes your account and everything in it for good.</Note>
            </Column>
          )}
        </Column>
      </ScrollView>
    </Host>
  )
}

function Privacy({ aiSharing, onPrivacyPolicy }: Props) {
  return (
    <Section title="PRIVACY">
      <Card padding={0}>
        <Row style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          <Switch
            label="Share with Anthropic for Ask"
            value={aiSharing.on}
            disabled={aiSharing.status !== 'ready'}
            onValueChange={(on) => void aiSharing.setOn(on)}
          />
        </Row>
      </Card>
      {aiSharing.error ? <ErrorText>{aiSharing.error}</ErrorText> : null}
      <Note>
        Ask and the quote checker send your question, your car's records or a quote's photo to
        Anthropic, whose Claude model writes the answer. Off means they ask first.
      </Note>
      <Card padding={0} onPress={onPrivacyPolicy}>
        <SettingRow symbol="shield" label="Privacy policy" chevron />
      </Card>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors()
  return (
    <Column spacing={8}>
      <Text
        textStyle={{ ...OVERLINE, color: colors.textSecondary }}
        style={{ paddingHorizontal: 4 }}
      >
        {title}
      </Text>
      {children}
    </Column>
  )
}

interface SettingRowProps {
  symbol: SymbolName
  label: string
  /** The setting's current value, shown on the trailing side. */
  value?: string
  /** Colour of the icon and label. Defaults to `textPrimary` with an accent icon. */
  tint?: ColorRole
  chevron?: boolean
}

/** One row of a settings list: an icon, a label, and optionally a value and a chevron. */
function SettingRow({ symbol, label, value, tint, chevron }: SettingRowProps) {
  const colors = useColors()
  return (
    <Row alignment="center" spacing={12} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <Symbol name={symbol} size={20} color={colors[tint ?? 'accent']} />
      <FillColumn>
        <Text textStyle={{ fontSize: 17, color: colors[tint ?? 'textPrimary'] }}>{label}</Text>
      </FillColumn>
      {value ? (
        <Text textStyle={{ fontSize: 17, color: colors.textSecondary }}>{value}</Text>
      ) : null}
      {chevron ? <Symbol name="chevron" size={14} color={colors.textSecondary} /> : null}
    </Row>
  )
}

function ConfirmDelete(props: Props) {
  const deleting = props.status === 'deleting'
  return (
    <Card padding={18} spacing={12}>
      <Text textStyle={{ fontSize: 20, fontWeight: '700' }}>Delete your account?</Text>
      <Text>
        This permanently deletes your account and everything in it: your cars, service history,
        odometer readings and assistant conversations, on our servers and on this phone. It can't be
        undone.
      </Text>
      {props.error ? <ErrorText>{props.error}</ErrorText> : null}
      <Row spacing={10}>
        {/* Gone while deleting: the deletion cannot be called back once sent. */}
        {deleting ? null : (
          <PillButton
            label="Cancel"
            onPress={props.cancelDelete}
            fill="neutralSubtle"
            text="textPrimary"
          />
        )}
        <PillButton
          label={deleting ? 'Deleting…' : 'Delete'}
          onPress={() => void props.confirmDelete()}
          fill="danger"
          text="onDanger"
        />
      </Row>
    </Card>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
