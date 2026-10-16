import { Platform, type ViewStyle } from 'react-native';

import type { ColorScheme, ThemeColors } from './tokens';

/**
 * Card and sheet elevation.
 *
 * A drop shadow is invisible on a black page, so dark mode separates layers with a 1px
 * `cardBorder` outline instead.
 *
 * Android uses `boxShadow` rather than `elevation`: low elevation on a rounded card leaves dark
 * smudges at the corners. iOS keeps its native shadow.
 */
export function cardElevation(c: ThemeColors, scheme: ColorScheme): ViewStyle {
  if (scheme === 'dark') {
    return { borderWidth: 1, borderColor: c.cardBorder };
  }
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: { boxShadow: '0px 2px 6px rgba(11, 31, 51, 0.08)' }, // theme-fixed: light-mode card shadow
      default: {},
    }) ?? {}
  );
}

/** Stronger elevation for popups, menus and bottom sheets. */
export function sheetElevation(c: ThemeColors, scheme: ColorScheme): ViewStyle {
  if (scheme === 'dark') {
    return { borderWidth: 1, borderColor: c.cardBorder };
  }
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { boxShadow: '0px 8px 18px rgba(11, 31, 51, 0.16)' }, // theme-fixed: light-mode sheet shadow
      default: {},
    }) ?? {}
  );
}
