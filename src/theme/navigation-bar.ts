import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

import type { ColorScheme } from './tokens';

type NavigationBarModule = {
  setButtonStyleAsync: (style: 'light' | 'dark') => Promise<void>;
};

let cached: NavigationBarModule | null | undefined;

/** expo-navigation-bar, or null on a dev client built before it was added (needs a rebuild). */
function navigationBar(): NavigationBarModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === 'android' && requireOptionalNativeModule('ExpoNavigationBar')) {
    try {
      // Lazy so a dev client built before this module was added keeps running.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-navigation-bar') as NavigationBarModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

/**
 * Android system navigation bar buttons: white on dark UI, dark on light UI.
 *
 * With edge-to-edge this only changes the 3-button bar (the gesture handle colours itself) and
 * needs `android:enforceNavigationBarContrast=false` (plugins/with-light-navigation-bar.js).
 */
export function applyNavigationBarStyle(scheme: ColorScheme) {
  const bar = navigationBar();
  if (!bar) return;
  bar.setButtonStyleAsync(scheme === 'dark' ? 'light' : 'dark').catch(() => undefined);
}
