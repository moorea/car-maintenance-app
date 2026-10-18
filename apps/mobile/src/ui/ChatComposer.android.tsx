import { Row, TextInput } from '@expo/ui'
import { padding, weight } from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import type { ChatComposerProps } from './ChatComposer'
import { useModelText } from './composerText'
import { FilledIconButton, GlassBar } from './surfaces'

/** The floating glass field at the bottom of a chat, with its send button. */
export function ChatComposer({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  action,
}: ChatComposerProps) {
  const colors = useColors()
  const { text, onChange } = useModelText(value, onChangeText)
  return (
    <Row>
      <GlassBar>
        <Row alignment="center" spacing={6} modifiers={[weight(1)]} style={{ paddingLeft: 12 }}>
          <TextInput
            value={text}
            onChangeText={onChange}
            onSubmitEditing={onSubmit}
            placeholder={placeholder}
            returnKeyType="send"
            autoCapitalize="sentences"
            modifiers={[weight(1), padding(0, 12, 0, 12)]}
            textStyle={{ fontSize: 16, color: colors.textPrimary }}
          />
          <FilledIconButton {...action} />
        </Row>
      </GlassBar>
    </Row>
  )
}
