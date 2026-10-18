import type { SignInActions, SignInState } from '@car/core'
import { Button, Column, ScrollView } from '@expo/ui'
import { Host } from '../../ui/Host'
import { ErrorText } from '../../ui/Note'
import { TextField } from '../../ui/TextField'
import { Text } from '../../ui/Text'

type Props = SignInState &
  Pick<
    SignInActions,
    'setEmail' | 'setCode' | 'submitEmail' | 'submitCode' | 'resend' | 'changeEmail'
  > & { onPrivacyPolicy: () => void }

/** Pure rendering of the sign-in model: the email step, then the code step. */
export function SignInView(props: Props) {
  const { step, email, code, busy, fieldError, error } = props
  return (
    <Host style={{ flex: 1 }}>
      <ScrollView>
        <Column spacing={16} style={{ padding: 16 }}>
          <Text textStyle={{ fontSize: 24, fontWeight: '700' }}>Sign in</Text>
          {step === 'email' ? (
            <>
              <Text>We'll email you a code. No password needed.</Text>
              <TextField
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
                label="Code"
                value={code}
                onChangeText={props.setCode}
                error={fieldError}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                autoCapitalize="none"
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
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
