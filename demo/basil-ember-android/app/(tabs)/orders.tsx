import { useRouter } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { fmt } from '../../src/lib/pricing'
import { colors, fonts, radius } from '../../src/lib/theme'
import { useStore, type OrderStatus } from '../../src/state/store'

const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  oven: 'In the oven',
  ready: 'Ready for pickup',
}

export default function OrdersScreen() {
  const router = useRouter()
  const { orders } = useStore()

  if (orders.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.title}>No orders yet</Text>
        <Text style={styles.body}>When you place a pickup order, you can follow it here.</Text>
      </View>
    )
  }

  return (
    <FlatList
      testID="orders-list"
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16 }}
      renderItem={({ item }) => (
        <Pressable
          testID={`order-card-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.orderNo}, ${STATUS_LABEL[item.status]}`}
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
          style={styles.card}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.no}>Order {item.orderNo}</Text>
            <Text style={styles.status}>{STATUS_LABEL[item.status]}</Text>
          </View>
          <Text style={styles.total}>{fmt(item.total)}</Text>
        </Pressable>
      )}
    />
  )
}

const styles = StyleSheet.create({
  empty: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted, marginTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginBottom: 12,
  },
  no: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  status: { fontFamily: fonts.body, fontSize: 14, color: colors.basil, marginTop: 2 },
  total: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
})
