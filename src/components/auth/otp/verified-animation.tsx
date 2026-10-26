import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { CheckMark } from '@/components/auth/otp/check-mark';
import {
  OTP_BOX,
  OTP_GLOW,
  VERIFY_LEVELS,
  VERIFY_TIMELINE as T,
} from '@/components/auth/otp/config';
import {
  easeInOutCubic,
  easeInOutSine,
  easeOutCubic,
  windowed,
} from '@/components/auth/otp/easing';
import { GlowRing } from '@/components/auth/otp/glow-ring';
import { Haze } from '@/components/auth/otp/haze';
import { authPalette, useAuthColors } from '@/components/auth/auth-colors';
import { makeStyles } from '@/theme';

/** Trailing copies of each box while it slides, which read as motion blur. */
const TRAILS = [
  { lag: 45, opacity: 0.3 },
  { lag: 90, opacity: 0.15 },
] as const;

type BoxProps = {
  index: number;
  count: number;
  digit: string;
  boxWidth: number;
  clock: SharedValue<number>;
  ringProgress: SharedValue<number>;
  glow: SharedValue<number>;
};

/** Merge progress for a box, optionally running `lag` ms behind the clock. */
function mergeAt(clock: number, lag: number) {
  'worklet';
  return easeInOutCubic(windowed(clock - lag, T.merge));
}

function Box({ index, count, digit, boxWidth, clock, ringProgress, glow }: BoxProps) {
  const styles = useStyles();
  const A = useAuthColors();
  const offset = (index - (count - 1) / 2) * (boxWidth + OTP_BOX.gap);
  const lean = index % 2 === 0 ? -1 : 1;

  const frame = useAnimatedStyle(() => {
    const t = clock.value;
    const m = mergeAt(t, 0);
    const settle = easeInOutSine(windowed(t, [T.ring[0], T.ring[1]]));
    return {
      borderColor: interpolateColor(settle, [0, 1], [A.otpRestBorder, A.otpDimBorder]),
      backgroundColor: interpolateColor(settle, [0, 1], [A.otpRestFill, A.otpDimFill]),
      // Fades only once almost merged, so the bundle reads as one solid thing.
      opacity: 1 - windowed(m, [0.72, 1]),
      transform: [
        { translateX: -offset * m },
        { rotateZ: `${lean * VERIFY_LEVELS.lean * Math.sin(Math.PI * m)}rad` },
        { scale: 1 - 0.06 * Math.sin(Math.PI * m) },
      ],
    };
  });
  const digitStyle = useAnimatedStyle(() => ({
    opacity: 1 - windowed(clock.value, T.digits),
  }));

  return (
    <Animated.View
      style={[styles.box, { left: index * (boxWidth + OTP_BOX.gap), width: boxWidth }, frame]}
    >
      <Animated.Text style={[styles.digit, digitStyle]}>{digit}</Animated.Text>
      <GlowRing
        width={boxWidth}
        height={OTP_BOX.height}
        radius={OTP_BOX.radius}
        progress={ringProgress}
        intensity={glow}
      />
    </Animated.View>
  );
}

function Trail({
  index,
  count,
  boxWidth,
  clock,
  lag,
  opacity,
}: {
  index: number;
  count: number;
  boxWidth: number;
  clock: SharedValue<number>;
  lag: number;
  opacity: number;
}) {
  const styles = useStyles();
  const offset = (index - (count - 1) / 2) * (boxWidth + OTP_BOX.gap);
  const lean = index % 2 === 0 ? -1 : 1;
  const style = useAnimatedStyle(() => {
    const m = mergeAt(clock.value, lag);
    const live = Math.sin(Math.PI * windowed(clock.value, T.merge));
    return {
      opacity: opacity * live * (1 - windowed(m, [0.8, 1])),
      transform: [
        { translateX: -offset * m },
        { rotateZ: `${lean * VERIFY_LEVELS.lean * Math.sin(Math.PI * m)}rad` },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.trail, { left: index * (boxWidth + OTP_BOX.gap), width: boxWidth }, style]}
    />
  );
}

/** The single box the digits merge into: swells as the tick draws, then settles smaller. */
function Badge({
  width,
  clock,
  glow,
}: {
  width: number;
  clock: SharedValue<number>;
  glow: SharedValue<number>;
}) {
  const styles = useStyles();
  const full = useSharedValue(1);
  const checkProgress = useDerivedValue(() => easeOutCubic(windowed(clock.value, T.check)));
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const swell = easeOutCubic(windowed(t, T.swell));
    const settle = easeInOutCubic(windowed(t, T.settle));
    const base = VERIFY_LEVELS.badgeSwell - VERIFY_LEVELS.badgeRest;
    return {
      opacity: windowed(t, T.badge),
      transform: [
        {
          scale: 0.9 + (VERIFY_LEVELS.badgeSwell - 0.9) * swell - base * settle,
        },
      ],
    };
  });
  return (
    <Animated.View style={[styles.badge, { left: (width - OTP_BOX.badge) / 2 }, style]}>
      <GlowRing
        width={OTP_BOX.badge}
        height={OTP_BOX.badge}
        radius={OTP_BOX.badgeRadius}
        progress={full}
        intensity={glow}
      />
      <CheckMark size={OTP_BOX.badge} progress={checkProgress} intensity={glow} />
    </Animated.View>
  );
}

/**
 * Plays once a code is verified. Blue outlines draw round every box, the boxes lean and slide
 * into one, and a tick draws itself inside it. Calls `onDone` just before the animation settles,
 * so the caller can move on without cutting the end of it.
 */
export function VerifiedAnimation({
  digits,
  width,
  onDone,
}: {
  digits: string;
  width: number;
  onDone: () => void;
}) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const count = digits.length;
  const boxWidth = (width - OTP_BOX.gap * (count - 1)) / count;

  const clock = useSharedValue(reduceMotion ? T.total : 0);
  const ringProgress = useDerivedValue(() => easeInOutSine(windowed(clock.value, T.ring)));
  const glow = useDerivedValue(() => {
    const t = clock.value;
    const rise = easeOutCubic(windowed(t, [T.ring[0], T.merge[1]]));
    const cool = easeInOutSine(windowed(t, T.cool));
    return rise * (1 - (1 - VERIFY_LEVELS.restGlow) * cool);
  });
  const hazeLevel = useDerivedValue(() => {
    const rise = easeOutCubic(windowed(clock.value, T.haze));
    const cool = easeInOutSine(windowed(clock.value, T.cool));
    return rise * (1 - 0.7 * cool);
  });

  useEffect(() => {
    if (!reduceMotion) {
      clock.value = withTiming(T.total, { duration: T.total, easing: Easing.linear });
    }
    const id = setTimeout(onDone, reduceMotion ? 300 : T.done);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per verification
  }, []);

  return (
    <View style={[styles.stage, { width }]} pointerEvents="none">
      <Haze width={width} boxHeight={OTP_BOX.height} intensity={hazeLevel} />
      {TRAILS.flatMap(({ lag, opacity }) =>
        Array.from(digits, (_, i) => (
          <Trail
            key={`${lag}-${i}`}
            index={i}
            count={count}
            boxWidth={boxWidth}
            clock={clock}
            lag={lag}
            opacity={opacity}
          />
        )),
      )}
      {Array.from(digits, (digit, i) => (
        <Box
          key={i}
          index={i}
          count={count}
          digit={digit}
          boxWidth={boxWidth}
          clock={clock}
          ringProgress={ringProgress}
          glow={glow}
        />
      ))}
      <Badge width={width} clock={clock} glow={glow} />
    </View>
  );
}

const useStyles = makeStyles((_c, scheme) => {
  const A = authPalette(scheme);
  return {
    stage: { height: OTP_BOX.height, alignSelf: 'center' },
    box: {
      position: 'absolute',
      top: 0,
      height: OTP_BOX.height,
      borderRadius: OTP_BOX.radius,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    trail: {
      position: 'absolute',
      top: 0,
      height: OTP_BOX.height,
      borderRadius: OTP_BOX.radius,
      borderWidth: 1.5,
      borderColor: OTP_GLOW.hot,
      backgroundColor: OTP_GLOW.fill,
      opacity: 0,
    },
    badge: {
      position: 'absolute',
      top: 0,
      width: OTP_BOX.badge,
      height: OTP_BOX.badge,
      borderRadius: OTP_BOX.badgeRadius,
      backgroundColor: OTP_GLOW.fill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    digit: { fontSize: 22, fontWeight: '800', color: A.text },
  } as const;
});
