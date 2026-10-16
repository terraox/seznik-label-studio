import { StyleSheet, type ViewStyle } from 'react-native';

import type { ColorScheme, ThemeColors } from './tokens';

/** Top bar: brand navy in light, black with a thin grey line under it in dark (D2). */
export function headerBar(c: ThemeColors, scheme: ColorScheme): ViewStyle {
  return scheme === 'dark'
    ? { backgroundColor: c.header, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.headerBorder }
    : { backgroundColor: c.header };
}
