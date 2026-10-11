import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';

type ShopCategory = 'all' | 'rolls' | 'specialty';

const CATEGORIES: { id: ShopCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'rolls', label: 'Rolls' },
  { id: 'specialty', label: 'Specialty' },
];

const PRODUCTS = [
  {
    id: 'rolls',
    category: 'rolls' as const,
    title: 'Label rolls',
    size: 'Continuous & die-cut',
    blurb: 'Everyday thermal stock for receipts, prices, and short runs.',
    icon: 'square.stack.3d.up.fill' as const,
    tone: '#E7F6F8',
    ink: Palette.accent,
  },
  {
    id: 'ribbon',
    category: 'rolls' as const,
    title: 'TD-404 ribbon',
    size: 'Matched packs',
    blurb: 'Ribbon sized for Seznik TD-404 so density stays even.',
    icon: 'arrow.clockwise' as const,
    tone: '#E8EEF6',
    ink: Palette.header,
  },
  {
    id: 'shipping',
    category: 'specialty' as const,
    title: 'Shipping labels',
    size: '100 × 150 mm',
    blurb: 'Wide stock for barcodes, addresses, and dispatch slips.',
    icon: 'tray.and.arrow.down.fill' as const,
    tone: '#F3EEE6',
    ink: '#8A5A2B',
  },
  {
    id: 'jewellery',
    category: 'specialty' as const,
    title: 'Jewellery tags',
    size: 'Hang tags',
    blurb: 'Small tags that still hold a SKU and a price.',
    icon: 'tag' as const,
    tone: '#F8E8EC',
    ink: '#9B3D55',
  },
  {
    id: 'care',
    category: 'specialty' as const,
    title: 'Care labels',
    size: 'Apparel',
    blurb: 'Soft care labels for wash instructions and fibre content.',
    icon: 'doc.text' as const,
    tone: '#E8F3EC',
    ink: '#1F7A45',
  },
];

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.four);
  const [category, setCategory] = useState<ShopCategory>('all');
  const products = useMemo(
    () => PRODUCTS.filter((item) => category === 'all' || item.category === category),
    [category],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerKicker}>Seznik</Text>
        <Text style={styles.headerTitle}>Shop</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>Supplies</Text>
            <Text style={styles.heroTitle}>Stock the press before the next run.</Text>
            <Text style={styles.heroBody}>
              Rolls, ribbon, and specialty tags matched to Seznik printers.
            </Text>
          </View>
          <View style={styles.heroMark}>
            <AppIcon name="bag.fill" tintColor="#FFFFFF" size={22} />
          </View>
        </View>

        <View style={styles.pills}>
          {CATEGORIES.map((item) => {
            const active = item.id === category;
            return (
              <Pressable
                key={item.id}
                onPress={() => setCategory(item.id)}
                android_ripple={androidRipple}
                style={[styles.pill, active && styles.pillActive]}>
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          {products.map((product) => (
            <View key={product.id} style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: product.tone }]}>
                <AppIcon name={product.icon} tintColor={product.ink} size={20} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {product.title}
                </Text>
                <Text style={styles.cardBlurb} numberOfLines={2}>
                  {product.size} · {product.blurb}
                </Text>
              </View>
              <Text style={styles.askLabel}>Ask</Text>
            </View>
          ))}
        </View>

        <View style={styles.note}>
          <AppIcon name="info.circle" tintColor={Palette.header} size={18} />
          <Text style={styles.noteText}>
            Checkout in the app is not open yet. Contact Seznik support and we will pack the stock.
          </Text>
        </View>
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    paddingBottom: 12,
    justifyContent: 'flex-end',
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  scroll: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#16324C',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroEyebrow: {
    color: '#7ED4DE',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 18,
  },
  heroMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
  },
  pill: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DEE6',
  },
  pillActive: {
    backgroundColor: Palette.header,
    borderColor: Palette.header,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.ink,
  },
  pillLabelActive: {
    color: '#FFFFFF',
  },
  list: {
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 68,
    ...cardShadow,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.ink,
  },
  cardBlurb: {
    fontSize: 12,
    lineHeight: 16,
    color: '#5C6B78',
  },
  askLabel: {
    color: '#0E7C8A',
    fontSize: 12,
    fontWeight: '700',
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EE',
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Palette.ink,
  },
});
