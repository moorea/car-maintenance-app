import { Row, TextInput, type UniversalStyle } from '@expo/ui'
import { useColors } from '../theme'
import { useModelText } from './composerText'
import { FilledIconButton, GlassBar } from './surfaces'
import type { SymbolName } from './symbols'

export interface ChatComposerProps {
  value: string
  onChangeText: (value: string) => void
  onSubmit: () => void
  placeholder: string
  /** The round button at the end: send, or stop while an answer streams. */
  action: { symbol: SymbolName; onPress: () => void; disabled: boolean }
}

/** The floating Liquid Glass field at the bottom of a chat, with its send button. */
export function ChatComposer({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  action,
}: ChatComposerProps) {
  const colors = useColors()
  const { text, onChange } = useModelText(value, onChangeText)
  // In a row, the bar's flex fills the width rather than squashing its height.
  return (
    <Row>
      <GlassBar>
        <Row
          alignment="center"
          spacing={6}
          style={{ ...({ flex: 1 } as UniversalStyle), paddingLeft: 12 }}
        >
          <TextInput
            value={text}
            onChangeText={onChange}
            onSubmitEditing={onSubmit}
            placeholder={placeholder}
            returnKeyType="send"
            autoCapitalize="sentences"
            style={{
              ...({ flex: 1, minWidth: 0, outlineStyle: 'none' } as UniversalStyle),
              height: 44,
              borderWidth: 0,
              backgroundColor: colors.clear,
            }}
            textStyle={{ fontSize: 16, color: colors.textPrimary }}
          />
          <FilledIconButton {...action} />
        </Row>
      </GlassBar>
    </Row>
  )
}
