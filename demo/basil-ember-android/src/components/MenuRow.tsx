import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { MenuItem } from '../data/menu'
import { fmt } from '../lib/pricing'
import { colors, fonts, radius } from '../lib/theme'
import { useStore } from '../state/store'

export function MenuRow({ item }: { item: MenuItem }) {
  const router = useRouter()
  const { addItem, favorites, toggleFavorite } = useStore()
  const favorite = favorites.includes(item.id)
  const open = () => router.push({ pathname: '/item/[id]', params: { id: item.id } })

  return (
    <View style={styles.card}>
      <Pressable
        testID={`menu-row-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${fmt(item.price)}`}
        onPress={open}
        style={styles.row}
      >
        <View style={[styles.swatch, { backgroundColor: `hsl(${item.hue}, 62%, 48%)` }]} />
        <View style={styles.body}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.desc} numberOfLines={3}>
            {item.description}
          </Text>
          <Text style={styles.price}>{fmt(item.price)}</Text>
          {item.dietary.length > 0 && <Text style={styles.tags}>{item.dietary.join(' · ')}</Text>}
        </View>
      </Pressable>
      <Pressable
        testID={`menu-row-favorite-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Favorite ${item.name}`}
        onPress={open}
        onLongPress={() => toggleFavorite(item.id)}
        style={StyleSheet.absoluteFill}
      />
      {favorite && (
        <View pointerEvents="none" style={styles.heart}>
          <Feather name="heart" size={16} color={colors.ember} />
        </View>
      )}
      <Pressable
        testID={`quick-add-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Add to order, ${item.name}`}
        onPress={() => addItem(item.id, 'medium', [], 1)}
        style={styles.quick}
      >
        <Text style={styles.quickText}>Add to order</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', padding: 14, paddingBottom: 64 },
  swatch: { width: 64, height: 64, borderRadius: 32, marginRight: 14 },
  body: { flex: 1 },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 4 },
  desc: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#B8AFA3' },
  price: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, marginTop: 8 },
  tags: { fontFamily: fonts.body, fontSize: 12, color: colors.basil, marginTop: 2 },
  heart: { position: 'absolute', top: 12, right: 12 },
  quick: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { color: colors.cream, fontFamily: fonts.bodyBold, fontSize: 14 },
})
