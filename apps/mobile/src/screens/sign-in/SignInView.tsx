import type { SignInActions, SignInState } from '@car/core'
import { Button, Column, ScrollView, type UniversalStyle } from '@expo/ui'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { ErrorText, Note } from '../../ui/Note'
import { Symbol } from '../../ui/Symbol'
import { TextField } from '../../ui/TextField'
import { Text } from '../../ui/Text'

type Props = SignInState &
  Pick<
    SignInActions,
    'setEmail' | 'setCode' | 'submitEmail' | 'submitCode' | 'resend' | 'changeEmail'
  > & { onPrivacyPolicy: () => void }

/**
 * Pure rendering of the sign-in model: the email step, then the code step. Signing in with a new
 * email creates the account, so the same screen serves someone new and someone returning.
 */
export function SignInView(props: Props) {
  const colors = useColors()
  const { step, email, code, busy, fieldError, error, notice } = props
  return (
    <Host style={{ flex: 1 }}>
      <ScrollView>
        <Column spacing={16} style={{ padding: 16, paddingTop: 40 }}>
          <Column
            alignment="center"
            style={{
              ...({ alignSelf: 'flex-start' } as UniversalStyle),
              padding: 14,
              borderRadius: 22,
              backgroundColor: colors.accentSubtle,
            }}
          >
            <Symbol name="car" size={32} color={colors.accent} />
          </Column>
          <Text textStyle={{ fontSize: 28, fontWeight: '700' }}>
            {step === 'email' ? 'Sign in or create an account' : 'Check your email'}
          </Text>
          {step === 'email' ? (
            <>
              <Text>
                Enter your email and we'll send you a code. No password to remember, and it's the
                same whether you're new or coming back.
              </Text>
              {/* Keyed so each step mounts a new native field: iOS keeps a focused field's keyboard,
                  so reusing the email field left the code step with the email keyboard. */}
              <TextField
                key="email"
                label="Email"
                value={email}
                onChangeText={props.setEmail}
                error={fieldError}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button
                label={busy ? 'Sending…' : 'Email me a code'}
                disabled={busy}
                onPress={() => void props.submitEmail()}
              />
            </>
          ) : (
            <>
              <Text>{`Enter the code we sent to ${email}.`}</Text>
              <TextField
                key="code"
                label="Code"
                value={code}
                onChangeText={props.setCode}
                error={fieldError}
                placeholder="Code from the email"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                autoCapitalize="none"
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              {notice ? <Note>{notice}</Note> : null}
              <Note>
                It can take a minute to arrive. If it doesn't, check your spam or junk folder.
              </Note>
              <Button
                label={busy ? 'Signing in…' : 'Sign in'}
                disabled={busy}
                onPress={() => void props.submitCode()}
              />
              <Button
                variant="text"
                label="Send a new code"
                disabled={busy}
                onPress={() => void props.resend()}
              />
              <Button
                variant="text"
                label="Use a different email"
                disabled={busy}
                onPress={props.changeEmail}
              />
            </>
          )}
          <Button variant="text" label="Privacy policy" onPress={props.onPrivacyPolicy} />
        </Column>
      </ScrollView>
    </Host>
  )
}
