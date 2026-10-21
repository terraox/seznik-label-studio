import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { ProductImage } from '@/components/shop/product-image';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { openProductUrl } from '@/lib/shop/amazon-url';
import { getBundledShopCatalog } from '@/lib/shop/load-catalog';
import { productDisplayTitle } from '@/lib/shop/filter-catalog';
import type { ShopProduct } from '@/lib/shop/types';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

const TILE_W = 112;
const TILE_GAP = 10;
const TILE_STRIDE = TILE_W + TILE_GAP;
const PAD = 14;
const MS_PER_TILE = 3200;
const PRINTER_COUNT = 4;
const LABEL_COUNT = 4;

/** A few printers, then label rolls with distinct sizes, from the bundled catalogue. */
function featuredProducts(): ShopProduct[] {
  const { printers, labels } = getBundledShopCatalog();
  const seen = new Set<string>();
  const rolls: ShopProduct[] = [];
  for (const product of labels) {
    const title = productDisplayTitle(product);
    if (!product.imageUrl || seen.has(title)) continue;
    seen.add(title);
    rolls.push(product);
    if (rolls.length === LABEL_COUNT) break;
  }
  const machines = printers.filter((product) => product.imageUrl).slice(0, PRINTER_COUNT);
  return [...machines, ...rolls];
}

async function openProduct(product: ShopProduct) {
  const result = await openProductUrl(product);
  if (!result.ok) {
    Alert.alert('Link unavailable', 'This product link could not be opened.');
  }
}

export function BuyFromUsStrip() {
  useThemeRefresh();
  const router = useRouter();
  const offset = useSharedValue(0);
  const products = useMemo(featuredProducts, []);
  const loopWidth = products.length * TILE_STRIDE;

  useEffect(() => {
    offset.value = 0;
    if (loopWidth === 0) return;
    offset.value = withRepeat(
      withTiming(-loopWidth, {
        duration: products.length * MS_PER_TILE,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [offset, loopWidth, products.length]);

  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const tiles = [...products, ...products];

  return (
    <View style={styles.cardFrame}>
    <Pressable
      onPress={() => router.push('/shop')}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel="Buy from us — Shop from Seznik"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <AppIcon name="bag" tintColor={C.accent} size={20} />
        </View>
        <View style={styles.headerText}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
            style={styles.title}>
            Buy from us
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
            style={styles.subtitle}>
            Shop supplies from Seznik
          </Text>
        </View>
        <View style={styles.ctaWrap}>
          <Text style={styles.cta}>Shop</Text>
          <AppIcon name="chevron.right" tintColor={C.accent} size={14} />
        </View>
      </View>

      {products.length > 0 ? (
        <View style={styles.track}>
          <Animated.View style={[styles.row, { width: loopWidth * 2 + PAD }, marqueeStyle]}>
            {tiles.map((product, index) => (
              <Pressable
                key={`${product.id}-${index}`}
                onPress={() => void openProduct(product)}
                accessibilityRole="link"
                accessibilityLabel={`Buy ${product.name}`}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                <View style={styles.photo}>
                  <ProductImage uri={product.imageUrl} recyclingKey={product.id} />
                </View>
                <Text numberOfLines={2} style={styles.tileName}>
                  {productDisplayTitle(product)}
                </Text>
                <View style={styles.tilePill}>
                  <Text numberOfLines={1} style={styles.tileType}>
                    {product.category === 'printers' ? 'Printer' : 'Label roll'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Animated.View>
        </View>
      ) : null}
    </Pressable>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  // Shadow stays on the outer view. overflow:hidden on the same view as the light-mode
  // Android boxShadow hides the whole strip.
  cardFrame: {
    borderRadius: 16,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
    ...(scheme === 'light'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }
      : null),
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    overflow: 'hidden',
    paddingTop: 14,
    paddingBottom: 8,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: c.text,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: c.textMuted,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: c.accentSoft,
  },
  cta: {
    fontSize: 13,
    fontWeight: '700',
    color: c.accent,
  },
  track: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: TILE_GAP,
    paddingHorizontal: PAD,
  },
  tile: {
    width: TILE_W,
    gap: 4,
    alignItems: 'center',
  },
  photo: {
    width: TILE_W,
    height: TILE_W,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF', // theme-fixed: product photos are shot on white
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
  },
  tileName: {
    fontSize: 12,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
  },
  tilePill: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
  },
  tileType: {
    fontSize: 11,
    fontWeight: '600',
    color: c.accent,
  },
  pressed: {
    opacity: 0.85,
  },
}));
