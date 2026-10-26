import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { OTP_GLOW } from '@/components/auth/otp/config';

const HEIGHT = 190;
const SPREAD = 70;

/** Soft light that spreads behind the boxes. */
export function Haze({
  width,
  boxHeight,
  intensity,
}: {
  width: number;
  boxHeight: number;
  intensity: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({ opacity: intensity.value }));
  const w = width + SPREAD * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { left: -SPREAD, top: -(HEIGHT - boxHeight) / 2 }, style]}
    >
      <Svg width={w} height={HEIGHT}>
        <Defs>
          <RadialGradient id="otp-haze" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={OTP_GLOW.accent} stopOpacity={0.5} />
            <Stop offset="0.55" stopColor={OTP_GLOW.accent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={OTP_GLOW.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={HEIGHT / 2} rx={w / 2} ry={HEIGHT / 2} fill="url(#otp-haze)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
});
