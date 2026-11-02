import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button } from '../src/components/Button'
import { ASAP, pickupSlots } from '../src/lib/pickup'
import { fmt, totals } from '../src/lib/pricing'
import { colors, fonts, radius } from '../src/lib/theme'
import { useStore } from '../src/state/store'

export default function CheckoutScreen() {
  const router = useRouter()
  const { lines, placeOrder } = useStore()
  const slots = useMemo(() => pickupSlots(), [])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pickup, setPickup] = useState(ASAP)
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const t = totals(lines)

  const submit = () => {
    const next: { name?: string; phone?: string } = {}
    if (name.trim().length < 2) next.name = 'Please add a name for the order.'
    if (phone.replace(/\D/g, '').length < 7) next.phone = 'Please add a phone number we can reach at pickup.'
    setErrors(next)
    if (Object.keys(next).length > 0 || lines.length === 0) return
    const order = placeOrder({ name, phone, pickup })
    router.replace({ pathname: '/order/[id]', params: { id: order.id } })
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>No payment in the app. You will pay at the counter, card or cash.</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          testID="checkout-name"
          accessibilityLabel="Name for the order"
          value={name}
          onChangeText={setName}
          placeholder="Name for the order"
          placeholderTextColor={colors.muted}
          autoComplete="name"
          style={styles.input}
        />
        {errors.name && <Text style={styles.err}>{errors.name}</Text>}

        <Text style={styles.label}>Phone</Text>
        <TextInput
          testID="checkout-phone"
          accessibilityLabel="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="(513) 555-0100"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          autoComplete="tel"
          style={styles.input}
        />
        {errors.phone && <Text style={styles.err}>{errors.phone}</Text>}

        <Text style={styles.label}>Pickup time</Text>
        {slots.map((s) => {
          const selected = s.id === pickup
          return (
            <Pressable
              key={s.id}
              testID={`pickup-${s.id === ASAP ? 'asap' : s.id.replace(/\W/g, '')}`}
              accessibilityRole="radio"
              accessibilityLabel={s.label}
              accessibilityState={{ selected }}
              onPress={() => setPickup(s.id)}
              style={[styles.slot, selected && styles.slotOn]}
            >
              <Text style={styles.slotText}>{s.label}</Text>
            </Pressable>
          )
        })}

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Pickup at the shelf by the oven, 128 Fournier Street, Maplewood. Give us the name on the order and you are on your way.
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tax (8.5%)</Text>
          <Text style={styles.rowValue}>{fmt(t.tax)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.totalLabel}>Due at pickup</Text>
          <Text testID="checkout-total" style={styles.totalValue}>{fmt(t.total)}</Text>
        </View>

        <Button
          testID="checkout-place"
          label="Place pickup order"
          onPress={submit}
          disabled={lines.length === 0}
          style={{ marginTop: 16 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  lede: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: 8 },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, marginTop: 18, marginBottom: 8 },
  input: {
    minHeight: 52,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  err: { fontFamily: fonts.body, fontSize: 13, color: colors.emberDark, marginTop: 6 },
  slot: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    marginBottom: 8,
  },
  slotOn: { borderColor: colors.ember, backgroundColor: '#fbefe8' },
  slotText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  notice: { backgroundColor: '#e9efe4', borderRadius: radius, padding: 14, marginTop: 14, marginBottom: 16 },
  noticeText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.basil },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  rowValue: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  totalLabel: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  totalValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.ink },
})
