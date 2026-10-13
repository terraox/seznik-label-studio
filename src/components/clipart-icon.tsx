import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { tintClipartSvg } from '@/lib/clipart/build-svg';
import { fitSvgViewBoxToInk } from '@/lib/clipart/ink-bounds';
import { scaleSvgStrokes } from '@/lib/clipart/stroke-scale';

type ClipartIconProps = {
  svg: string;
  size?: number | string;
  color?: string;
  /** Stroke thickness multiplier (1 = as drawn). */
  strokeScale?: number;
  /** Line emoji: crop the viewBox to the ink so the glyph fills this box at every size. */
  fitInk?: boolean;
  /** Live frame, in px. The SVG viewport follows these so the stroke scales with the box. */
  frameWidth?: SharedValue<number>;
  frameHeight?: SharedValue<number>;
};

/** Thermal-print-friendly black-and-white sticker glyph. */
export function ClipartIcon({
  svg,
  size = '100%',
  color = '#111111',
  strokeScale = 1,
  fitInk = false,
  frameWidth,
  frameHeight,
}: ClipartIconProps) {
  const source = fitInk ? fitSvgViewBoxToInk(svg, strokeScale) : svg;
  const xml = scaleSvgStrokes(tintClipartSvg(source, color), strokeScale);
  if (frameWidth && frameHeight) {
    return <LiveClipartFrame xml={xml} width={frameWidth} height={frameHeight} />;
  }
  if (size === '100%') {
    return <SvgXml xml={xml} width="100%" height="100%" />;
  }
  const dim = typeof size === 'number' ? size : 24;
  return <SvgXml xml={xml} width={dim} height={dim} />;
}

/** Parent has a real pixel size every frame, so the SVG viewport (and its stroke) track the frame. */
function LiveClipartFrame({
  xml,
  width,
  height,
}: {
  xml: string;
  width: SharedValue<number>;
  height: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: Math.max(1, width.value),
    height: Math.max(1, height.value),
  }));
  return (
    <Animated.View style={style} collapsable={false}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </Animated.View>
  );
}
