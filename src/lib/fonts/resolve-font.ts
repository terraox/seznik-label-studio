import { FONT_LIBRARY } from '@/constants/font-library';
import { lookupFontFamily } from '@/lib/fonts/lookup';
import { useInstalledFontStore } from '@/stores/installed-font-store';

/** Family key for canvas text and headless print. Uninstalled catalog names stay unset. */
export function resolveFontFamily(name?: string): string | undefined {
  return lookupFontFamily(name, FONT_LIBRARY, useInstalledFontStore.getState().items);
}
