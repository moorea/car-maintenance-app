import { useNativeState } from '@expo/ui'
import { useEffect, useRef } from 'react'

/**
 * The native text of a field whose value a screen model owns, as in TextField: keystrokes go to
 * the model, and only a different value from the model (the draft cleared after sending) is
 * copied back into the field.
 */
export function useModelText(value: string, onChangeText: (value: string) => void) {
  const text = useNativeState(value)
  const reported = useRef(value)
  useEffect(() => {
    if (value === reported.current) return
    reported.current = value
    text.set(value)
  }, [text, value])
  const onChange = (next: string) => {
    reported.current = next
    onChangeText(next)
  }
  return { text, onChange }
}
