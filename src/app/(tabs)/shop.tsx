import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';

const PRODUCTS = [
  {
    id: 'rolls',
    title: 'Label rolls',
    blurb: 'Continuous & die-cut thermal labels for everyday printing.',
    icon: 'square.stack.3d.up.fill' as const,
  },
  {
    id: 'ribbon',
    title: 'TD-404 ribbon',
    blurb: 'Genuine ribbon packs matched to Seznik TD-404 printers.',
    icon: 'arrow.clockwise' as const,
  },
  {
    id: 'shipping',
    title: 'Shipping labels',
    blurb: '100 × 150 mm shipping stock ready for barcode workflows.',
    icon: 'tray.and.arrow.down.fill' as const,
  },
  {
    id: 'jewellery',
    title: 'Jewellery tags',
    blurb: 'Small hang tags sized for jewellery and retail SKUs.',
    icon: 'tag' as const,
  },
  {
    id: 'care',
    title: 'Care labels',
    blurb: 'Soft fabric-friendly care labels for apparel lines.',
    icon: 'doc.text' as const,
  },
];

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.four);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Shop from seznik</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Supplies and accessories for Seznik label printers — rolls, ribbons, and specialty tags.
        </Text>

        {PRODUCTS.map((product) => (
          <View key={product.id} style={styles.card}>
            <View style={styles.iconWrap}>
              <AppIcon name={product.icon} tintColor={Palette.accent} size={22} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{product.title}</Text>
              <Text style={styles.cardBlurb}>{product.blurb}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.footnote}>
          Online checkout is coming soon. Contact Seznik support to place an order today.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: Palette.header,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    color: Palette.muted,
    marginBottom: Spacing.one,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...cardShadow,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E8F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
  },
  cardBlurb: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.muted,
  },
  footnote: {
    marginTop: Spacing.two,
    fontSize: 12,
    lineHeight: 17,
    color: Palette.muted,
    textAlign: 'center',
  },
});
