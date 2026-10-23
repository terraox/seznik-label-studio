import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { themedStyles, useThemeRefresh } from '@/theme';

/**
 * An accent outline that blinks a few times over its parent, to point the user at a section.
 * Bump `flashKey` to play it again.
 */
export function SectionFlash({ flashKey }: { flashKey: number }) {
  useThemeRefresh();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (flashKey === 0) return undefined;
    const blink = [
      Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.25, duration: 260, useNativeDriver: true }),
    ];
    const run = Animated.sequence([
      Animated.delay(250),
      ...blink,
      ...blink,
      ...blink,
      Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(glow, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [flashKey, glow]);

  return <Animated.View pointerEvents="none" style={[styles.outline, { opacity: glow }]} />;
}

const styles = themedStyles((c) => ({
  outline: {
    ...StyleSheet.absoluteFillObject,
    top: -8,
    bottom: -8,
    left: -8,
    right: -8,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
}));
