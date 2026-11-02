import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Stepper } from '../../src/components/Stepper'
import { describeLine, fmt, totals } from '../../src/lib/pricing'
import { colors, fonts, radius } from '../../src/lib/theme'
import { useStore } from '../../src/state/store'

export default function CartScreen() {
  const router = useRouter()
  const { lines, setQty, removeLine } = useStore()
  const t = totals(lines)

  if (lines.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Your bag is empty</Text>
        <Text style={styles.emptyBody}>Pick a pie or two from the menu and they will show up here.</Text>
        <Button
          testID="cart-empty-cta"
          label="Start your bag"
          onPress={() => router.navigate('/')}
          style={{ marginTop: 20, alignSelf: 'stretch' }}
        />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <FlatList
        testID="cart-list"
        data={lines}
        keyExtractor={(l) => l.key}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: line }) => (
          <View style={styles.line} testID={`cart-line-${line.itemId}`}>
            <View style={styles.lineTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{line.name}</Text>
                {describeLine(line) !== '' && <Text style={styles.lineMeta}>{describeLine(line)}</Text>}
              </View>
              <Text style={styles.linePrice}>{fmt(line.unit * line.qty)}</Text>
            </View>
            <View style={styles.lineBottom}>
              <Stepper
                idPrefix={`cart-${line.itemId}`}
                name={line.name}
                value={line.qty}
                min={1}
                onChange={(n) => setQty(line.key, n)}
              />
              <Pressable
                testID={`cart-remove-${line.itemId}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${line.name}`}
                onPress={() => removeLine(line.key)}
                style={styles.remove}
              >
                <Feather name="trash-2" size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.summary}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Subtotal</Text>
              <Text testID="cart-subtotal" style={styles.rowValue}>{fmt(t.subtotal)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Tax (8.5%)</Text>
              <Text testID="cart-tax" style={styles.rowValue}>{fmt(t.tax)}</Text>
            </View>
            <View style={[styles.row, styles.totalRow]}>
              <Text style={styles.totalLabel}>Due at pickup</Text>
              <Text testID="cart-total" style={styles.totalValue}>{fmt(t.total)}</Text>
            </View>
            <Button
              testID="cart-checkout"
              label="Continue to pickup"
              onPress={() => router.push('/checkout')}
              style={{ marginTop: 16 }}
            />
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  empty: { flex: 1, padding: 24, justifyContent: 'center' },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.ink },
  emptyBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted, marginTop: 8 },
  line: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start' },
  lineName: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  lineMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  linePrice: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, marginLeft: 12 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  remove: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { marginTop: 8, paddingTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  rowValue: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6, paddingTop: 10 },
  totalLabel: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  totalValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.ink },
})
