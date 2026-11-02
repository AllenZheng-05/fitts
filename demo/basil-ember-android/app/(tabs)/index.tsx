import { SectionList, StyleSheet, Text, View } from 'react-native'
import { CATEGORIES, MENU } from '../../src/data/menu'
import { MenuRow } from '../../src/components/MenuRow'
import { colors, fonts } from '../../src/lib/theme'

const SECTIONS = CATEGORIES.map((category) => ({
  title: category,
  data: MENU.filter((m) => m.category === category),
}))

export default function MenuScreen() {
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
})
