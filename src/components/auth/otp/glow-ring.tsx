import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { OTP_GLOW } from '@/components/auth/otp/config';
import { ringPaths } from '@/components/auth/otp/ring-geometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Room around the box for the outer glow to paint into. */
const PAD = 10;

/** Wide faint stroke, then tighter and brighter ones, then a thin hot core: reads as a glow. */
const LAYERS = [
  { width: 9, opacity: 0.1, color: OTP_GLOW.accent },
  { width: 4, opacity: 0.38, color: OTP_GLOW.hot },
  { width: 1.6, opacity: 1, color: OTP_GLOW.core },
] as const;

type LayerProps = {
  right: string;
  left: string;
  length: number;
  width: number;
  color: string;
  opacity: number;
  progress: SharedValue<number>;
  intensity: SharedValue<number>;
};

function RingLayer({
  right,
  left,
  length,
  width,
  color,
  opacity,
  progress,
  intensity,
}: LayerProps) {
  // One animated props object drives both halves.
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
    strokeOpacity: opacity * intensity.value,
  }));
  const common = {
    stroke: color,
    strokeWidth: width,
    strokeLinecap: 'round' as const,
    fill: 'none',
    strokeDasharray: [length, length],
    animatedProps,
  };
  return (
    <>
      <AnimatedPath d={right} {...common} />
      <AnimatedPath d={left} {...common} />
    </>
  );
}

/**
 * Glowing outline for a rounded box. `progress` (0..1) draws it from the top centre round both
 * sides; `intensity` (0..1) scales the brightness.
 */
export function GlowRing({
  width,
  height,
  radius,
  progress,
  intensity,
}: {
  width: number;
  height: number;
  radius: number;
  progress: SharedValue<number>;
  intensity: SharedValue<number>;
}) {
  const { right, left, halfLength } = useMemo(
    () => ringPaths(width, height, radius),
    [width, height, radius],
  );
  return (
    <Svg width={width + PAD * 2} height={height + PAD * 2} style={styles.svg} pointerEvents="none">
      <G x={PAD} y={PAD}>
        {LAYERS.map((layer) => (
          <RingLayer
            key={layer.width}
            right={right}
            left={left}
            length={halfLength}
            progress={progress}
            intensity={intensity}
            {...layer}
          />
        ))}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  svg: { position: 'absolute', left: -PAD, top: -PAD },
});
