import { Column, Text, TextInput, useNativeState, type TextInputProps } from '@expo/ui'
import { useEffect, useRef } from 'react'
import { useColors } from '../theme'

interface Props {
  label: string
  value: string
  onChangeText: (value: string) => void
  error?: string | undefined
  placeholder?: string
  keyboardType?: TextInputProps['keyboardType']
  autoComplete?: TextInputProps['autoComplete']
  autoCapitalize?: TextInputProps['autoCapitalize']
}

/** A labelled Expo UI text input. The screen model owns the text; the field follows `value`. */
export function TextField({ label, value, onChangeText, error, ...input }: Props) {
  const colors = useColors()
  const text = useNativeState(value)
  // What the field last reported. Only a different `value` came from the model (a cleared code
  // after a resend) and is copied in; comparing with the live native text instead would write a
  // stale value back over keystrokes typed since.
  const reported = useRef(value)
  useEffect(() => {
    if (value === reported.current) return
    reported.current = value
    text.set(value)
  }, [text, value])
  return (
    <Column spacing={4}>
      <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={(next) => {
          reported.current = next
          onChangeText(next)
        }}
        placeholder={input.placeholder ?? ''}
        keyboardType={input.keyboardType ?? 'default'}
        autoComplete={input.autoComplete ?? 'off'}
        autoCapitalize={input.autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        style={{ width: '100%', ...(error ? { borderColor: colors.danger } : {}) }}
      />
      {error ? <Text textStyle={{ fontSize: 12, color: colors.danger }}>{error}</Text> : null}
    </Column>
  )
}
