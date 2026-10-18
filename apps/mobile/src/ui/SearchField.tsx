import { TextInput, useNativeState } from '@expo/ui'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { useColors } from '../theme'
import { fullWidth } from './fullWidth'
import { placeholderProps } from './placeholder'

interface Props {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
}

/** A rounded search box. The screen model owns the text; the field follows `value`. */
export function SearchField({ value, onChangeText, placeholder }: Props) {
  const colors = useColors()
  const text = useNativeState(value)
  // As in TextField: only a `value` different from what the field last reported came from the
  // model, so only that is copied in.
  const reported = useRef(value)
  useEffect(() => {
    if (value === reported.current) return
    reported.current = value
    text.set(value)
  }, [text, value])
  return (
    <TextInput
      value={text}
      onChangeText={(next) => {
        reported.current = next
        onChangeText(next)
      }}
      placeholder={placeholder}
      {...placeholderProps(colors)}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      modifiers={fullWidth.modifiers}
      style={{
        ...fullWidth.style,
        // Compose sets the text at the top of a fixed-height field, so Android pads it to 44 instead.
        ...(Platform.OS === 'android' ? { paddingVertical: 11 } : { height: 44 }),
        borderRadius: 22,
        borderWidth: 0,
        paddingHorizontal: 16,
        backgroundColor: colors.neutralSubtle,
      }}
    />
  )
}
