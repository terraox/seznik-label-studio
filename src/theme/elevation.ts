import { Platform, StyleSheet, type ViewStyle } from 'react-native';

import type { ColorScheme, ThemeColors } from './tokens';

/**
 * Card and sheet elevation.
 *
 * A drop shadow is invisible on a black page, so dark mode separates layers with a hairline
 * border instead. Light mode keeps today's `cardShadow` values exactly.
 */
export function cardElevation(c: ThemeColors, scheme: ColorScheme): ViewStyle {
  if (scheme === 'dark') {
    return { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline };
  }
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }) ?? {}
  );
}

/** Stronger elevation for popups, menus and bottom sheets. */
export function sheetElevation(c: ThemeColors, scheme: ColorScheme): ViewStyle {
  if (scheme === 'dark') {
    return { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline };
  }
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
      default: {},
    }) ?? {}
  );
}
