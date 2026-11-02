import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { describeLine, fmt } from '../../src/lib/pricing'
import { colors, fonts, radius } from '../../src/lib/theme'
import { useStore, type OrderStatus } from '../../src/state/store'

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'received', label: 'Received' },
  { status: 'oven', label: 'In the oven' },
  { status: 'ready', label: 'Ready for pickup' },
]

export default function OrderStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { getOrder, cancelOrder } = useStore()
  const order = getOrder(id ?? '')

  if (!order) {
    return (
      <View style={styles.missing}>
        <Text style={styles.title}>Order cancelled</Text>
        <Text style={styles.body}>Nothing was charged. Hungry again? The oven is still hot.</Text>
        <Button testID="order-back-to-menu" label="Back to the menu" onPress={() => router.navigate('/')} style={{ marginTop: 20 }} />
      </View>
    )
  }

  const current = STEPS.findIndex((s) => s.status === order.status)

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>ORDER {order.orderNo}</Text>
      <Text accessibilityRole="header" testID="order-headline" style={styles.title}>
        {order.status === 'ready' ? 'Your order is ready' : `Thanks, ${order.name.split(' ')[0]}`}
      </Text>
      <Text testID="order-pickup-line" style={styles.body}>{`Ready around ${order.pickupTime}`}</Text>
      <Text style={styles.body}>
        Pick up at 128 Fournier Street, Maplewood. We will call {order.phone} only if something comes up.
      </Text>

      <View style={styles.steps}>
        {STEPS.map((s, i) => {
          const done = i <= current
          return (
            <View key={s.status} style={styles.step} testID={`order-step-${s.status}`}>
              <View style={[styles.dot, done && styles.dotOn]} />
              <Text style={[styles.stepLabel, done && styles.stepLabelOn]}>{s.label}</Text>
            </View>
          )
        })}
      </View>

      <View style={styles.card}>
        {order.lines.map((l) => (
          <View key={l.key} style={styles.lineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{l.qty} × {l.name}</Text>
              {describeLine(l) !== '' && <Text style={styles.lineMeta}>{describeLine(l)}</Text>}
            </View>
            <Text style={styles.lineName}>{fmt(l.unit * l.qty)}</Text>
          </View>
        ))}
        <View style={styles.lineRow}>
          <Text style={styles.lineMeta}>Tax (8.5%)</Text>
          <Text style={styles.lineMeta}>{fmt(order.tax)}</Text>
        </View>
        <View style={[styles.lineRow, styles.totalRow]}>
          <Text style={styles.lineName}>Due at pickup</Text>
          <Text style={styles.total}>{fmt(order.total)}</Text>
        </View>
      </View>

      <Button
        testID="order-cancel"
        label="Cancel order"
        variant="ghost"
        onPress={async () => {
          await cancelOrder(order.id)
        }}
        style={{ marginTop: 20 }}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  missing: { flex: 1, padding: 24, justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.4, color: colors.ember },
  title: { fontFamily: fonts.displayBold, fontSize: 30, color: colors.ink, marginTop: 4 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted, marginTop: 8 },
  steps: { marginTop: 24, marginBottom: 20 },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card, marginRight: 14 },
  dotOn: { borderColor: colors.basil, backgroundColor: colors.basil },
  stepLabel: { fontFamily: fonts.bodyMedium, fontSize: 17, color: colors.muted },
  stepLabelOn: { color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 16 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  lineName: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  lineMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6, paddingTop: 10 },
  total: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.ink },
})
