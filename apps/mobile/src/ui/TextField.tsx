import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native'

interface Props {
  label: string
  value: string
  onChangeText: (value: string) => void
  error?: string | undefined
  keyboardType?: KeyboardTypeOptions
  placeholder?: string
}

export function TextField({ label, value, onChangeText, error, keyboardType, placeholder }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : undefined]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholder={placeholder ?? ''}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#c8c8c8', borderRadius: 8, padding: 10, fontSize: 16 },
  inputError: { borderColor: '#c62828' },
  error: { color: '#c62828', fontSize: 12, marginTop: 4 },
})
