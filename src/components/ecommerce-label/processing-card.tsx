import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { cardElevation, themedStyles, useThemeRefresh } from '@/theme';

const PAGE_W = 64;
const PAGE_H = 84;

export type ProcessingProgress = { done: number; total: number };

/** A page being read: a scan line sweeps over it while the bar below fills as pages are checked. */
export function ProcessingCard({
  title,
  progress,
}: {
  title: string;
  /** Pages checked so far. Without it the bar just slides, for the moment before the count is known. */
  progress?: ProcessingProgress | null;
}) {
  useThemeRefresh();
  const sweep = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(slide, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [slide]);

  const ratio = progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : null;
  useEffect(() => {
    if (ratio == null) return;
    Animated.timing(fill, { toValue: ratio, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [fill, ratio]);

  const lineY = sweep.interpolate({ inputRange: [0, 1], outputRange: [4, PAGE_H - 8] });
  const segW = Math.max(40, trackW * 0.3);
  const segX = slide.interpolate({ inputRange: [0, 1], outputRange: [-segW, trackW] });
  const fillW = fill.interpolate({ inputRange: [0, 1], outputRange: [0, trackW] });

  return (
    <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel={title}>
      <View style={styles.page}>
        <View style={styles.headLine} />
        <View style={styles.textLine} />
        <View style={[styles.textLine, styles.textShort]} />
        <View style={styles.codeRow}>
          {[3, 1, 2, 1, 3, 2, 1, 2, 3, 1, 2].map((w, i) => (
            <View key={i} style={[styles.bar, { width: w }]} />
          ))}
        </View>
        <Animated.View style={[styles.scanLine, { transform: [{ translateY: lineY }] }]} />
        <Animated.View style={[styles.scanGlow, { transform: [{ translateY: lineY }] }]} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {progress && progress.total > 0
            ? `Page ${progress.done} of ${progress.total}`
            : 'Getting your PDF ready'}
        </Text>
        <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          {ratio == null ? (
            <Animated.View style={[styles.fill, { width: segW, transform: [{ translateX: segX }] }]} />
          ) : (
            <Animated.View style={[styles.fill, { width: fillW }]} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  page: {
    width: PAGE_W,
    height: PAGE_H,
    borderRadius: 6,
    backgroundColor: '#FFFFFF', // theme-fixed: a label page is white paper
    borderWidth: 1,
    borderColor: c.hairline,
    padding: 8,
    gap: 5,
    overflow: 'hidden',
  },
  headLine: { height: 7, width: '55%', borderRadius: 2, backgroundColor: '#24275A' }, // theme-fixed: ink on the white page
  textLine: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(36, 39, 90, 0.18)' }, // theme-fixed: ink on the white page
  textShort: { width: '70%' },
  codeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5, height: 26, marginTop: 4 },
  bar: { height: '100%', backgroundColor: '#24275A' }, // theme-fixed: ink on the white page
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    backgroundColor: c.accent,
  },
  scanGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -10,
    height: 12,
    backgroundColor: c.accentSoft,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', color: c.text },
  sub: { fontSize: 13, color: c.textMuted },
  track: {
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: c.fill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: c.accentFill },
}));
