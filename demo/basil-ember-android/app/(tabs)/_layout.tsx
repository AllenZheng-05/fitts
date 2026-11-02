import { Feather } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { CartButton } from '../../src/components/CartButton'
import { colors, fonts } from '../../src/lib/theme'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.cream,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
        headerRight: () => <CartButton />,
        sceneStyle: { backgroundColor: colors.stone },
        tabBarActiveTintColor: colors.ember,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Basil & Ember',
          tabBarLabel: 'Menu',
          tabBarButtonTestID: 'tab-menu',
          tabBarIcon: ({ color, size }) => <Feather name="book-open" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Your bag',
          tabBarLabel: 'Cart',
          tabBarButtonTestID: 'tab-cart',
          tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarLabel: 'Orders',
          tabBarButtonTestID: 'tab-orders',
          tabBarIcon: ({ color, size }) => <Feather name="clock" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
