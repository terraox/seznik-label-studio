import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { AUTH_COLORS } from '@/components/auth/auth-colors';

const BOX_H = 54;
const GAP = 7;
const RADIUS = 14;
const TICK_BOX = 54;
const TICK_RADIUS = 16;
/** Timeline in ms: border sweep, boxes spin into one, tick draws, then hand back. */
const SWEEP_MS = 520;
const MERGE_AT = 560;
const MERGE_MS = 400;
const TICK_AT = 960;
const TICK_MS = 320;
const DONE_AT = 1650;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** Rounded rectangle path that starts at the top centre and runs clockwise. */
function roundedRectPath(w: number, h: number, r: number) {
  return [
    `M ${w / 2} 0.75`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w - 0.75} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h - 0.75}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0.75 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0.75`,
    `H ${w / 2}`,
  ].join(' ');
}

function perimeter(w: number, h: number, r: number) {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

function SweepBox({
  index,
  count,
  digit,
  boxW,
  sweep,
  merge,
}: {
  index: number;
  count: number;
  digit: string;
  boxW: number;
  sweep: SharedValue<number>;
  merge: SharedValue<number>;
}) {
  const offset = (index - (count - 1) / 2) * (boxW + GAP);
  const dir = index % 2 === 0 ? -1 : 1;
  const length = perimeter(boxW, BOX_H, RADIUS);
  const path = roundedRectPath(boxW, BOX_H, RADIUS);

  const boxStyle = useAnimatedStyle(() => {
    const spin = Math.sin(Math.PI * merge.value);
    return {
      // Starts exactly like the typed box underneath so the hand-off is invisible.
      borderColor: interpolateColor(sweep.value, [0, 1], ['#3F3F45', AUTH_COLORS.accentDim]),
      backgroundColor: interpolateColor(sweep.value, [0, 1], ['#242427', AUTH_COLORS.field]),
      opacity: interpolate(merge.value, [0, 0.7, 1], [1, 1, 0]),
      shadowOpacity: 0.9 * sweep.value,
      transform: [
        { translateX: -offset * merge.value },
        { rotateZ: `${dir * spin * 0.6}rad` },
        { scale: interpolate(merge.value, [0, 0.5, 1], [1, 1.06, 0.9]) },
      ],
    };
  });
  const digitStyle = useAnimatedStyle(() => ({
    opacity: interpolate(merge.value, [0, 0.35], [1, 0], 'clamp'),
  }));
  const strokeProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - sweep.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.box, { left: index * (boxW + GAP), width: boxW }, boxStyle]}
    >
      <Animated.Text style={[styles.digit, digitStyle]}>{digit}</Animated.Text>
      <Svg width={boxW} height={BOX_H} style={StyleSheet.absoluteFill}>
        <AnimatedPath
          d={path}
          stroke={AUTH_COLORS.accent}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[length, length]}
          animatedProps={strokeProps}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Plays once a code is verified: each box's border lights up, the boxes spin together into
 * a single box, and a tick draws inside it. Calls onDone when it settles.
 */
export function OtpVerifiedEffect({
  digits,
  width,
  onDone,
}: {
  digits: string;
  width: number;
  onDone: () => void;
}) {
  const count = digits.length;
  const boxW = (width - GAP * (count - 1)) / count;
  const sweep = useSharedValue(0);
  const merge = useSharedValue(0);
  const tick = useSharedValue(0);
  const settle = useSharedValue(0.78);
  const breathe = useSharedValue(0);

  useEffect(() => {
    sweep.value = withTiming(1, { duration: SWEEP_MS, easing: Easing.out(Easing.cubic) });
    merge.value = withDelay(
      MERGE_AT,
      withTiming(1, { duration: MERGE_MS, easing: Easing.inOut(Easing.cubic) }),
    );
    settle.value = withDelay(
      MERGE_AT + MERGE_MS * 0.6,
      withSpring(1, { damping: 11, stiffness: 160 }),
    );
    tick.value = withDelay(
      TICK_AT,
      withTiming(1, { duration: TICK_MS, easing: Easing.out(Easing.quad) }),
    );
    // Keeps the finished state alive while the app signs in.
    breathe.value = withDelay(
      TICK_AT + TICK_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
    const id = setTimeout(onDone, DONE_AT);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per verification
  }, []);

  const haloStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(sweep.value, [0, 1], [0, 0.85]) *
      interpolate(tick.value, [0, 1], [1, 0.6]) *
      (1 - 0.3 * breathe.value),
  }));
  const tickBoxStyle = useAnimatedStyle(() => ({
    opacity: interpolate(merge.value, [0.6, 1], [0, 1], 'clamp'),
    shadowOpacity: 0.9 * merge.value,
    transform: [{ scale: settle.value }],
  }));
  const tickProps = useAnimatedProps(() => ({
    strokeDashoffset: 34 * (1 - tick.value),
  }));

  return (
    <View style={[styles.stage, { width }]} pointerEvents="none">
      <Animated.View style={[styles.halo, haloStyle]}>
        <Svg width={width + 120} height={200}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={AUTH_COLORS.accent} stopOpacity={0.55} />
              <Stop offset="1" stopColor={AUTH_COLORS.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <AnimatedEllipse
            cx={(width + 120) / 2}
            cy={100}
            rx={(width + 120) / 2}
            ry={100}
            fill="url(#halo)"
          />
        </Svg>
      </Animated.View>

      {Array.from(digits).map((digit, i) => (
        <SweepBox
          key={i}
          index={i}
          count={count}
          digit={digit}
          boxW={boxW}
          sweep={sweep}
          merge={merge}
        />
      ))}

      <Animated.View style={[styles.tickBox, { left: (width - TICK_BOX) / 2 }, tickBoxStyle]}>
        <Svg width={TICK_BOX} height={TICK_BOX}>
          <AnimatedPath
            d="M16 28 L24 36 L39 19"
            stroke="#FFFFFF"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={[34, 34]}
            animatedProps={tickProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export function VerifiedLabel() {
  return (
    <Animated.Text style={styles.verifiedLabel} entering={FadeIn.duration(260)}>
      Verified successfully
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  stage: { height: BOX_H, alignSelf: 'center' },
  halo: {
    position: 'absolute',
    left: -60,
    top: -(200 - BOX_H) / 2,
  },
  box: {
    position: 'absolute',
    top: 0,
    height: BOX_H,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.accentDim,
    backgroundColor: AUTH_COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AUTH_COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 0,
  },
  digit: { fontSize: 22, fontWeight: '800', color: AUTH_COLORS.text },
  tickBox: {
    position: 'absolute',
    top: 0,
    width: TICK_BOX,
    height: TICK_BOX,
    borderRadius: TICK_RADIUS,
    borderWidth: 2,
    borderColor: AUTH_COLORS.accent,
    backgroundColor: '#2A1A14',
    shadowColor: AUTH_COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
  },
  verifiedLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: AUTH_COLORS.text,
    textAlign: 'center',
  },
});
