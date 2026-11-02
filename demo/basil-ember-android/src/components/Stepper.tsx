import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts } from '../lib/theme'

interface Props {
  value: number
  onChange: (next: number) => void
  idPrefix: string
  name: string
  min?: number
}

export function Stepper({ value, onChange, idPrefix, name, min = 1 }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        testID={`${idPrefix}-dec`}
        accessibilityRole="button"
        accessibilityLabel={`Decrease quantity of ${name}`}
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.btn}
      >
        <Text style={styles.sign}>−</Text>
      </Pressable>
      <Text testID={`${idPrefix}-qty`} accessibilityLabel={`Quantity ${value}`} style={styles.qty}>
        {value}
      </Text>
      <Pressable
        testID={`${idPrefix}-inc`}
        accessibilityRole="button"
        accessibilityLabel={`Increase quantity of ${name}`}
        onPress={() => onChange(value + 1)}
        style={styles.btn}
      >
        <Text style={styles.sign}>+</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sign: { fontSize: 22, color: colors.ink, fontFamily: fonts.bodyMedium },
  qty: { minWidth: 36, textAlign: 'center', fontSize: 17, color: colors.ink, fontFamily: fonts.bodyBold },
})
