import { Row, TextInput } from '@expo/ui'
import { frame, textFieldStyle } from '@expo/ui/swift-ui/modifiers'
import { useColors } from '../theme'
import type { ChatComposerProps } from './ChatComposer'
import { useModelText } from './composerText'
import { FilledIconButton, GlassBar } from './surfaces'

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
  return (
    <GlassBar>
      <Row alignment="center" spacing={6}>
        <TextInput
          value={text}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          returnKeyType="send"
          autoCapitalize="sentences"
          textStyle={{ fontSize: 16, color: colors.textPrimary }}
          modifiers={[textFieldStyle('plain'), frame({ maxWidth: Infinity })]}
          style={{ paddingLeft: 12 }}
        />
        <FilledIconButton {...action} />
      </Row>
    </GlassBar>
  )
}
