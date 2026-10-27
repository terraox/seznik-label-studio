import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { themedStyles, useThemeRefresh } from '@/theme';

/** A softly pulsing grey block that stands in for content while it loads. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  useThemeRefresh();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse, reduce]);
  const animated = useAnimatedStyle(() => ({ opacity: reduce ? 0.7 : 0.45 + pulse.value * 0.45 }));
  return <Animated.View style={[styles.block, animated, style]} />;
}

const styles = themedStyles((c) => ({
  block: {
    backgroundColor: c.fillStrong,
    borderRadius: 8,
  },
}));
