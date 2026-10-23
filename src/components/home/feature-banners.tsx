import { Image, type ImageRef } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, useWindowDimensions, View } from 'react-native';

import { MaxContentWidth } from '@/constants/theme';
import { HomeLayout } from '@/constants/ui';

import { themedStyles, useThemeRefresh } from '@/theme';

// 1881 x 836 source art.
const ASPECT = 1881 / 836;
const AUTO_MS = 4000;
const RESUME_MS = 6000;

// 1080 px wide WebP copies (about 70 KB each) of the 1881 px source PNGs (about 1.7 MB each): small
// enough to decode instantly. Display width is about 360 dp, so 1080 px is 3x.
const BANNERS = [
  require('../../../assets/images/home-header/optimized/shipping-labels.webp'),
  require('../../../assets/images/home-header/optimized/design-label-4.webp'),
  require('../../../assets/images/home-header/optimized/serial-label.webp'),
  require('../../../assets/images/home-header/optimized/jewellery-label-4.webp'),
  require('../../../assets/images/home-header/optimized/any-format-3.webp'),
  require('../../../assets/images/home-header/optimized/easy-pairing-2.webp'),
] as const;

// Held so the decoded images stay in memory until the home screen shows them.
const preloaded: ImageRef[] = [];

/** Decode every banner into memory at app start, before the home screen mounts. */
export async function preloadFeatureBanners(): Promise<void> {
  if (preloaded.length > 0) return;
  const refs = await Promise.all(BANNERS.map((source) => Image.loadAsync(source).catch(() => null)));
  for (const ref of refs) if (ref) preloaded.push(ref);
}

/** Feature banners above the New Label card: auto-advance, swipe to move, pauses while touched. */
export function FeatureBanners() {
  useThemeRefresh();
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
          {BANNERS.map((source, i) => (
            <Image
              key={i}
              source={source}
              style={{ width, height }}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={0}
              recyclingKey={`banner-${i}`}
              accessibilityIgnoresInvertColors
            />
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
}));
