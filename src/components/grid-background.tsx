import { useId } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Mask, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Square size of the grid, in dp. The admin panel uses the same 28. */
const CELL = 28;

/**
 * Crossing grid lines that are clearest in the middle and fade out towards the edges, like the
 * admin panel's login. The fade is a mask, so it works over any background and any glow.
 */
export function GridBackground({ color }: { color: string }) {
  const id = useId();
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <Pattern id={`${id}p`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <Path d={`M${CELL} 0H0V${CELL}`} stroke={color} strokeWidth={1} fill="none" />
          </Pattern>
          <RadialGradient id={`${id}r`} cx="50%" cy="34%" rx="80%" ry="62%">
            <Stop offset="0.15" stopColor="#FFFFFF" stopOpacity={1} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <Mask id={`${id}m`} x={0} y={0} width={width} height={height}>
            <Rect width={width} height={height} fill={`url(#${id}r)`} />
          </Mask>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id}p)`} mask={`url(#${id}m)`} />
      </Svg>
    </View>
  );
}
