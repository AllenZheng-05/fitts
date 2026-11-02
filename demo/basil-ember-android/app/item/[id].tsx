import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SIZES, TOPPINGS, getItem, type SizeId, type ToppingId } from '../../src/data/menu'
import { Stepper } from '../../src/components/Stepper'
import { fmt, unitPrice } from '../../src/lib/pricing'
import { colors, fonts, radius } from '../../src/lib/theme'
import { useStore } from '../../src/state/store'

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const item = getItem(id ?? '')
  const { addItem } = useStore()
  const [size, setSize] = useState<SizeId>('medium')
  const [toppings, setToppings] = useState<ToppingId[]>([])
  const [qty, setQty] = useState(1)

  if (!item) {
    return (
      <View style={styles.missing}>
        <Text style={styles.name}>That one is off the menu</Text>
      </View>
    )
  }

  const isPizza = item.category === 'Pizzas'
  const unit = unitPrice(item.price, item.category, size, toppings)
  const toggle = (t: ToppingId) =>
    setToppings((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: `hsl(${item.hue}, 62%, 48%)` }]} />
        <Text accessibilityRole="header" style={styles.name}>{item.name}</Text>
        <Text style={styles.desc}>{item.description}</Text>
        {item.dietary.length > 0 && <Text style={styles.tags}>{item.dietary.join(' · ')}</Text>}

        {isPizza && (
          <>
            <Text accessibilityRole="header" style={styles.group}>Size</Text>
            {SIZES.map((s) => {
              const selected = s.id === size
              return (
                <Pressable
                  key={s.id}
                  testID={`size-${s.id}`}
                  accessibilityRole="radio"
                  accessibilityLabel={s.label}
                  accessibilityState={{ selected }}
                  onPress={() => setSize(s.id)}
                  style={[styles.option, selected && styles.optionOn]}
                >
                  <Text style={styles.optionLabel}>{s.label}</Text>
                  <Text style={styles.optionPrice}>{fmt(item.price + s.delta)}</Text>
                </Pressable>
              )
            })}

            <Text accessibilityRole="header" style={styles.group}>Toppings</Text>
            {TOPPINGS.map((t) => {
              const checked = toppings.includes(t.id)
              return (
                <Pressable
                  key={t.id}
                  testID={`topping-${t.id}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${t.label}, plus ${fmt(t.price)}`}
                  accessibilityState={{ checked }}
                  onPress={() => toggle(t.id)}
                  style={[styles.option, checked && styles.optionOn]}
                >
                  <Text style={styles.optionLabel}>{t.label}</Text>
                  <Text style={styles.optionPrice}>+{fmt(t.price)}</Text>
                </Pressable>
              )
            })}
          </>
        )}

        <Text accessibilityRole="header" style={styles.group}>Quantity</Text>
        <Stepper idPrefix="item" name={item.name} value={qty} onChange={setQty} />
      </ScrollView>

      <View style={styles.bar}>
        <Text testID="item-total" style={styles.total}>{fmt(unit * qty)}</Text>
        <Pressable
          testID="item-add"
          accessibilityRole="button"
          accessibilityLabel="Add to cart"
          onPress={() => addItem(item.id, size, toppings, qty)}
          style={styles.add}
        >
          <Text style={styles.addText}>Add to cart</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  missing: { flex: 1, padding: 24, justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  hero: { height: 140, borderRadius: radius, marginBottom: 16 },
  name: { fontFamily: fonts.displayBold, fontSize: 30, color: colors.ink },
  desc: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted, marginTop: 6 },
  tags: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.basil, marginTop: 8 },
  group: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, marginTop: 24, marginBottom: 10 },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    marginBottom: 8,
  },
  optionOn: { borderColor: colors.ember, backgroundColor: '#fbefe8' },
  optionLabel: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  optionPrice: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  total: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.ink, marginRight: 16 },
  add: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 16 },
})
