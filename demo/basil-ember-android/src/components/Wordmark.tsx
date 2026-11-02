import { Text } from 'react-native'

// The logo carries its own colors and type.
const brand = { ember: '#bc4622', cream: '#f5efe4', font: 'Fraunces_700Bold' } as const

export function Wordmark() {
  return (
    <Text
      testID="header-wordmark"
      accessibilityRole="header"
      style={{ fontFamily: brand.font, fontSize: 22, color: brand.cream }}
    >
      Basil <Text style={{ color: brand.ember }}>&amp;</Text> Ember
    </Text>
  )
}
