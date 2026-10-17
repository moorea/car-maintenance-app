import { Pressable, StyleSheet, Text } from 'react-native'

interface Props {
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'link'
}

export function Button({ label, onPress, disabled = false, variant = 'primary' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={variant === 'primary' ? styles.primary : styles.link}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={variant === 'primary' ? styles.primaryText : styles.linkText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '600' },
  link: { padding: 10, alignItems: 'center' },
  linkText: { color: '#1565c0', fontSize: 15 },
})
