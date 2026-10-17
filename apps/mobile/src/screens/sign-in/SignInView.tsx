import type { SignInActions, SignInState } from '@car/core'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/TextField'

type Props = SignInState &
  Pick<
    SignInActions,
    'setEmail' | 'setCode' | 'submitEmail' | 'submitCode' | 'resend' | 'changeEmail'
  >

/** Pure rendering of the sign-in model: the email step, then the code step. */
export function SignInView(props: Props) {
  const { step, email, code, busy, fieldError, error } = props
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Sign in</Text>
      {step === 'email' ? (
        <>
          <Text style={styles.body}>We'll email you a code. No password needed.</Text>
          <TextField
            label="Email"
            value={email}
            onChangeText={props.setEmail}
            error={fieldError}
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={busy ? 'Sending…' : 'Email me a code'}
            disabled={busy}
            onPress={() => void props.submitEmail()}
          />
        </>
      ) : (
        <>
          <Text style={styles.body}>Enter the code we sent to {email}.</Text>
          <TextField
            label="Code"
            value={code}
            onChangeText={props.setCode}
            error={fieldError}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            autoCapitalize="none"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={busy ? 'Signing in…' : 'Sign in'}
            disabled={busy}
            onPress={() => void props.submitCode()}
          />
          <Button
            variant="link"
            label="Send a new code"
            disabled={busy}
            onPress={() => void props.resend()}
          />
          <Button
            variant="link"
            label="Use a different email"
            disabled={busy}
            onPress={props.changeEmail}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  heading: { fontSize: 24, fontWeight: '700', marginVertical: 12 },
  body: { fontSize: 15, color: '#444', marginBottom: 16 },
  error: { color: '#c62828', marginBottom: 8 },
})
