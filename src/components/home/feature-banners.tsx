import { Image, type ImageRef } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Linking, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { HOME_TOOLS } from '@/components/home/home-tools';
import { MaxContentWidth } from '@/constants/theme';
import { HomeLayout } from '@/constants/ui';

import { themedStyles, useThemeRefresh } from '@/theme';

// 1881 x 836 source art.
const ASPECT = 1881 / 836;
const AUTO_MS = 4000;
const RESUME_MS = 6000;

const DIWALI_STORE_URL =
  'https://www.amazon.in/stores/Seznik/page/641E1063-42C1-4FF4-9C9E-6CC9D2AFF51A?lp_asin=B0FKTHKDDZ&store_ref=bl_ast_dp_brandlogo_sto';

/** What a banner does when tapped: open a web page, go to a screen, or point at the Print from file tiles. */
type BannerAction = { url: string } | { href: Href } | { highlight: 'fromFile' };

type Banner = { source: number; label: string; action: BannerAction };

// 1080 px wide WebP copies (about 70 KB each) of the 1881 px source PNGs (about 1.7 MB each): small
// enough to decode instantly. Display width is about 360 dp, so 1080 px is 3x. The Diwali art is
// 2:1, so its copy is centre-cropped to the same 1881:836 shape.
const BANNERS: readonly Banner[] = [
  {
    source: require('../../../assets/images/home-header/optimized/diwali-offer.webp'),
    label: 'Diwali offer: open the Seznik store on Amazon',
    action: { url: DIWALI_STORE_URL },
  },
  {
    source: require('../../../assets/images/home-header/optimized/shipping-labels.webp'),
    label: 'Shipping labels',
    action: { href: HOME_TOOLS.shippingLabels.href },
  },
  {
    source: require('../../../assets/images/home-header/optimized/design-label-4.webp'),
    label: 'Design any label your way: start a blank label',
    action: { href: { pathname: '/new-label-setup', params: { isSingleCanvas: 'true' } } },
  },
  {
    source: require('../../../assets/images/home-header/optimized/serial-label.webp'),
    label: 'Numbered labels: open Serial Labels',
    action: { href: HOME_TOOLS.serialLabels.href as Href },
  },
  {
    source: require('../../../assets/images/home-header/optimized/jewellery-label-4.webp'),
    label: 'Jewellery labels: open templates',
    action: { href: '/(tabs)/template' },
  },
  {
    source: require('../../../assets/images/home-header/optimized/any-format-3.webp'),
    label: 'Print any file format: show Print from file',
    action: { highlight: 'fromFile' },
  },
  {
    source: require('../../../assets/images/home-header/optimized/easy-pairing-2.webp'),
    label: 'Easy pairing: connect a printer',
    action: { href: '/printer-connect' },
  },
];

// Held so the decoded images stay in memory until the home screen shows them.
const preloaded: ImageRef[] = [];

/** Decode every banner into memory at app start, before the home screen mounts. */
export async function preloadFeatureBanners(): Promise<void> {
  if (preloaded.length > 0) return;
  const refs = await Promise.all(BANNERS.map(({ source }) => Image.loadAsync(source).catch(() => null)));
  for (const ref of refs) if (ref) preloaded.push(ref);
}

/** Feature banners above the New Label card: auto-advance, swipe to move, pauses while touched, tap to open. */
export function FeatureBanners({ onHighlightFromFile }: { onHighlightFromFile?: () => void }) {
  useThemeRefresh();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const window = useWindowDimensions();
  // Estimate the width up front so the images mount on the first render, not after a layout pass.
  const [width, setWidth] = useState(
    Math.round(Math.min(window.width - HomeLayout.screenPad * 2, MaxContentWidth)),
  );
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedUntil = useRef(0);

  const goTo = useCallback(
    (next: number) => {
      indexRef.current = next;
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    },
    [width],
  );

  useEffect(() => {
    if (width === 0) return undefined;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      goTo((indexRef.current + 1) % BANNERS.length);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [width, goTo]);

  const open = (action: BannerAction) => {
    pausedUntil.current = Date.now() + RESUME_MS;
    if ('url' in action) void Linking.openURL(action.url).catch(() => {});
    else if ('href' in action) router.push(action.href);
    else onHighlightFromFile?.();
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const height = width / ASPECT;

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            pausedUntil.current = Date.now() + RESUME_MS;
          }}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            indexRef.current = next;
            setIndex(next);
          }}
          style={[styles.track, { height }]}>
          {BANNERS.map(({ source, label, action }, i) => (
            <Pressable
              key={i}
              onPress={() => open(action)}
              accessibilityRole={'url' in action ? 'link' : 'button'}
              accessibilityLabel={label}
              style={({ pressed }) => pressed && styles.pressed}>
              <Image
                source={source}
                style={{ width, height }}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={0}
                recyclingKey={`banner-${i}`}
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.dots} pointerEvents="none" /* layout-ok: page indicator dots */>
        {BANNERS.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { width: '100%', gap: 8 },
  track: { borderRadius: 16, overflow: 'hidden' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.hairline },
  dotOn: { width: 16, backgroundColor: c.accent },
  pressed: { opacity: 0.85 },
}));
