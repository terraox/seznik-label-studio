import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { OTP_GLOW } from '@/components/auth/otp/config';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const D = 'M 0.3 0.52 L 0.44 0.66 L 0.72 0.34';
/** Length of D in its own 0..1 units: 0.198 + 0.425. */
const LENGTH = 0.623;

/** Tick that draws itself. It starts as a dot, like a pen touching down, then runs the stroke. */
export function CheckMark({
  size,
  progress,
  intensity,
}: {
  size: number;
  progress: SharedValue<number>;
  intensity: SharedValue<number>;
}) {
  const draw = useAnimatedProps(() => ({
    // The tiny floor keeps the round cap visible as the starting dot.
    strokeDashoffset: LENGTH * (1 - Math.max(progress.value, 0.001)),
  }));
  const glow = useAnimatedProps(() => ({
    strokeDashoffset: LENGTH * (1 - Math.max(progress.value, 0.001)),
    strokeOpacity: 0.35 * intensity.value,
  }));
  return (
    <Svg width={size} height={size} viewBox="0 0 1 1" pointerEvents="none">
      <AnimatedPath
        d={D}
        stroke={OTP_GLOW.accent}
        strokeWidth={0.13}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[LENGTH, LENGTH]}
        animatedProps={glow}
      />
      <AnimatedPath
        d={D}
        stroke="#FFFFFF"
        strokeWidth={0.065}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[LENGTH, LENGTH]}
        animatedProps={draw}
      />
    </Svg>
  );
}
