import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import { colors, fonts } from '../lib/theme'

interface Props {
  label: string
  onPress: () => void
  testID: string
  variant?: 'ember' | 'dark' | 'ghost'
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({ label, onPress, testID, variant = 'ember', disabled, style }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <Text style={[styles.text, variant === 'ghost' && styles.ghostText]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: 999, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  ember: { backgroundColor: colors.ember },
  dark: { backgroundColor: colors.ink },
  ghost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.ink },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  text: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 16 },
  ghostText: { color: colors.ink },
})
