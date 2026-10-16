import { createContext, useContext } from 'react';

import { LightColors, type ColorScheme, type ThemeColors } from './tokens';

export type ThemeValue = {
  scheme: ColorScheme;
  colors: ThemeColors;
};

export const LIGHT_THEME_VALUE: ThemeValue = { scheme: 'light', colors: LightColors };

/** Defaults to light so anything rendered outside the provider stays as it is today. */
export const ThemeContext = createContext<ThemeValue>(LIGHT_THEME_VALUE);

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Current UI colour tokens. */
export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export function useScheme(): ColorScheme {
  return useContext(ThemeContext).scheme;
}
