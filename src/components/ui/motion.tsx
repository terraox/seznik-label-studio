import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** Items past this index appear at once, so long lists never queue up animations. */
const STAGGER_LIMIT = 8;
const STAGGER_MS = 40;

/** Fades and slides a list item up a little, a beat after the one before it. */
export function FadeInItem({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <Animated.View style={style}>{children}</Animated.View>;
  const delay = Math.min(index, STAGGER_LIMIT) * STAGGER_MS;
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(delay)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Scales up and settles each time `active` flips to true (a favourite star, a toggle). */
export function PopOnActive({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!active || reduce) return;
    scale.value = withSequence(
      withTiming(1.3, { duration: 110 }),
      withSpring(1, { damping: 8, stiffness: 220 }),
    );
  }, [active, reduce, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={animated}>{children}</Animated.View>;
}

/** A card whose height eases when its content opens or closes. */
export function ExpandCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  return (
    <Animated.View layout={reduce ? undefined : LinearTransition.duration(200)} style={style}>
      {children}
    </Animated.View>
  );
}

/** The part that appears inside an ExpandCard. */
export function ExpandBody({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeIn.duration(180)}
      exiting={reduce ? undefined : FadeOut.duration(120)}
      style={style}>
      {children}
    </Animated.View>
  );
}
