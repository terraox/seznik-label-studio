import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { themedStyles, useThemeRefresh } from '@/theme';

/** Placeholder card shown while the catalogue loads. */
export function ProductSkeleton({ width }: { width: number }) {
  useThemeRefresh();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={[styles.card, { width, opacity: pulse }]}>
      <View style={styles.image} />
      <View style={styles.lineWide} />
      <View style={styles.lineNarrow} />
      <View style={styles.button} />
    </Animated.View>
  );
}

const styles = themedStyles((c) => ({
  card: { borderRadius: 18, padding: 10, gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline },
  image: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: c.fill },
  lineWide: { height: 14, width: '70%', borderRadius: 7, backgroundColor: c.fill },
  lineNarrow: { height: 11, width: '45%', borderRadius: 6, backgroundColor: c.fill },
  button: { height: 38, borderRadius: 12, backgroundColor: c.fill },
}));
