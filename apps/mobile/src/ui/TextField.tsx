import { Column, Text, TextInput, useNativeState, type TextInputProps } from '@expo/ui'
import { useEffect } from 'react'

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
  const text = useNativeState(value)
  // The model can change the text itself (a cleared code after a resend), so copy it in.
  useEffect(() => {
    if (text.get() !== value) text.set(value)
  }, [text, value])
  return (
    <Column spacing={4}>
      <Text textStyle={{ fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={onChangeText}
        placeholder={input.placeholder ?? ''}
        keyboardType={input.keyboardType ?? 'default'}
        autoComplete={input.autoComplete ?? 'off'}
        autoCapitalize={input.autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        style={{ width: '100%', ...(error ? { borderColor: ERROR } : {}) }}
      />
      {error ? <Text textStyle={{ fontSize: 12, color: ERROR }}>{error}</Text> : null}
    </Column>
  )
}

export const ERROR = '#c62828'
