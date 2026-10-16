import type { ReactNode } from 'react';

import { LIGHT_THEME_VALUE, ThemeContext } from './context';

/**
 * Forces the light tokens for everything inside it, whatever the app theme is.
 *
 * Wrap the label artboard, label previews, thumbnails, print/share capture views and the
 * dev screens in this. Note it only affects components that read the theme context: Android
 * native default text colour still follows the system, so text in these areas must always set
 * an explicit `color` (enforced by src/theme/__tests__/print-safe.test.ts).
 */
export function LightScope({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={LIGHT_THEME_VALUE}>{children}</ThemeContext.Provider>;
}
