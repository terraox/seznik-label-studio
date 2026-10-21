import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, View } from 'react-native';

import { themedStyles, useThemeRefresh } from '@/theme';

// 1881 x 836 source art.
const ASPECT = 1881 / 836;
const AUTO_MS = 4000;
const RESUME_MS = 6000;

const BANNERS = [
  require('../../../assets/images/home-header/shipping-labels.png'),
  require('../../../assets/images/home-header/design-label-4.png'),
  require('../../../assets/images/home-header/serial-label.png'),
  require('../../../assets/images/home-header/Jewellery-Label-4.png'),
  require('../../../assets/images/home-header/any-format-3.png'),
  require('../../../assets/images/home-header/easy-pairing-2.png'),
] as const;

/** Feature banners above the New Label card: auto-advance, swipe to move, pauses while touched. */
export function FeatureBanners() {
  useThemeRefresh();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
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
              cachePolicy="memory"
              accessibilityIgnoresInvertColors
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.dots} pointerEvents="none">
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
