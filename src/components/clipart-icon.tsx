import { SvgXml } from 'react-native-svg';

import { tintClipartSvg } from '@/lib/clipart/build-svg';

type ClipartIconProps = {
  svg: string;
  size?: number | string;
  color?: string;
};

/** Thermal-print-friendly black-and-white sticker glyph. */
export function ClipartIcon({ svg, size = '100%', color = '#111111' }: ClipartIconProps) {
  const xml = tintClipartSvg(svg, color);
  const dim = typeof size === 'number' ? size : 24;
  return <SvgXml xml={xml} width={dim} height={dim} />;
}
