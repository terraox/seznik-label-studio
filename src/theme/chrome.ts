import type { ViewStyle } from 'react-native';

import type { ColorScheme, ThemeColors } from './tokens';

/** Top bar: brand navy in light and dark. */
export function headerBar(c: ThemeColors, _scheme: ColorScheme): ViewStyle {
  return { backgroundColor: c.header };
}
