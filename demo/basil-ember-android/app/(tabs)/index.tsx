import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { SectionList, StyleSheet, Text, View } from 'react-native'
import { CATEGORIES, MENU } from '../../src/data/menu'
import { MenuRow } from '../../src/components/MenuRow'
import { colors, fonts, radius } from '../../src/lib/theme'

// Tonight's special arrives from the kitchen feed shortly after the menu opens.
const SPECIAL_DELAY_MS = 1200

const SECTIONS = CATEGORIES.map((category) => ({
  title: category,
  data: MENU.filter((m) => m.category === category),
}))

export default function MenuScreen() {
  const [special, setSpecial] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setSpecial(false)
      const timer = setTimeout(() => setSpecial(true), SPECIAL_DELAY_MS)
      return () => clearTimeout(timer)
    }, []),
  )

  return (
    <SectionList
      testID="menu-list"
      sections={SECTIONS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MenuRow item={item} />}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHead}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {section.title}
          </Text>
        </View>
      )}
      ListHeaderComponent={
        <View style={styles.intro}>
          <Text style={styles.kicker}>WOOD-FIRED · MAPLEWOOD, OH</Text>
          <Text style={styles.lede}>Order ahead, pay at the counter. We will have everything hot and boxed.</Text>
          {special && (
            <View testID="menu-special-banner" style={styles.special}>
              <Text style={styles.specialKicker}>TONIGHT'S SPECIAL</Text>
              <Text style={styles.specialTitle}>Hot honey soppressata with whipped ricotta, $19. Until 9 pm.</Text>
            </View>
          )}
        </View>
      }
      stickySectionHeadersEnabled
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  )
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.4, color: colors.ember },
  lede: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 6 },
  sectionHead: { backgroundColor: colors.stone, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionTitle: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.ink },
  special: {
    marginTop: 14,
    backgroundColor: colors.ink,
    borderRadius: radius,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  specialKicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.4, color: colors.cream },
  specialTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.white, marginTop: 4 },
})
