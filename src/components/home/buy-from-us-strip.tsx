import { useRouter } from 'expo-router';
import { trackFeatureClick } from '@/lib/telemetry/events';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { Image } from 'expo-image';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { openProductUrl } from '@/lib/shop/amazon-url';
import { getBundledShopCatalog } from '@/lib/shop/load-catalog';
import { productDisplayTitle } from '@/lib/shop/filter-catalog';
import type { ShopProduct } from '@/lib/shop/types';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

const TILE_W = 118;
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

const PHOTO = TILE_W - 12;

/** One product photo at an exact pixel size; a grey photo icon when the image fails to load. */
function TilePhoto({ uri, id }: { uri: string; id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.photoImage, styles.photoFallback]}>
        <AppIcon name="photo" tintColor={C.textMuted} size={26} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      recyclingKey={id}
      cachePolicy="memory-disk"
      contentFit="contain"
      style={styles.photoImage}
      onError={(event) => {
        console.warn('[buy-strip] image failed', uri, event.error);
        setFailed(true);
      }}
    />
  );
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
      onPress={() => {
        trackFeatureClick('home.shop_strip');
        router.push('/shop');
      }}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel="Buy from us — Shop from Seznik"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <Image
            source={require('../../../assets/seznik-logo.png')}
            contentFit="contain"
            contentPosition="left"
            style={styles.logo}
            accessibilityLabel="Seznik"
          />
          <View style={styles.ctaWrap}>
            <Text style={styles.cta}>Shop now</Text>
            <AppIcon name="chevron.right" tintColor={C.onAccent} size={13} />
          </View>
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
            Printers and label rolls
          </Text>
        </View>
      </View>

      {products.length > 0 ? (
        <View style={styles.track}>
          <Animated.View style={[styles.row, { width: loopWidth * 2 + PAD }, marqueeStyle]} /* layout-ok: marquee row is meant to be wider than the screen */>
            {tiles.map((product, index) => (
              <Pressable
                key={`${product.id}-${index}`}
                onPress={() => void openProduct(product)}
                accessibilityRole="link"
                accessibilityLabel={`Buy ${product.name}`}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                <View style={styles.photo}>
                  <TilePhoto uri={product.imageUrl} id={product.id} />
                </View>
                <Text numberOfLines={2} style={styles.tileName}>
                  {productDisplayTitle(product)}
                </Text>
                <View
                  style={[
                    styles.tag,
                    product.category === 'printers' ? styles.tagPrinter : styles.tagRoll,
                  ]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tagText,
                      product.category === 'printers' ? styles.tagTextPrinter : styles.tagTextRoll,
                    ]}>
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
    borderRadius: 20,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
    ...(scheme === 'light'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }
      : null),
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 20,
    overflow: 'hidden',
    paddingTop: 16,
    paddingBottom: 14,
    gap: 14,
  },
  header: {
    gap: 10,
    paddingHorizontal: PAD,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    gap: 2,
  },
  logo: {
    width: 72,
    height: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: c.text,
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: '400',
    color: c.textMuted,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: c.accentFill,
  },
  cta: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.onAccent,
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
    gap: 8,
    padding: 6,
    paddingBottom: 10,
    borderRadius: 16,
    backgroundColor: c.fill,
  },
  photo: {
    width: PHOTO,
    height: PHOTO,
  },
  photoImage: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: 12,
    backgroundColor: '#FFFFFF', // theme-fixed: product photos are shot on white
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    alignSelf: 'flex-start',
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tagPrinter: {
    backgroundColor: c.accentFill,
  },
  tagRoll: {
    backgroundColor: c.successFill,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tagTextPrinter: {
    color: c.onAccent,
  },
  tagTextRoll: {
    color: c.onAccent,
  },
  tileName: {
    fontSize: 12,
    fontWeight: '700',
    color: c.text,
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.85,
  },
}));
