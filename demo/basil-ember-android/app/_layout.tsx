import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans'
import { Fraunces_600SemiBold, Fraunces_700Bold, useFonts } from '@expo-google-fonts/fraunces'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { CartButton } from '../src/components/CartButton'
import { colors, fonts } from '../src/lib/theme'
import { StoreProvider } from '../src/state/store'

export default function RootLayout() {
  const [loaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  })

  if (!loaded) return null

  return (
    <StoreProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.ink },
          headerTintColor: colors.cream,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
          headerRight: () => <CartButton />,
          contentStyle: { backgroundColor: colors.stone },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
        <Stack.Screen name="checkout" options={{ title: 'Pickup details' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Your order' }} />
      </Stack>
    </StoreProvider>
  )
}
