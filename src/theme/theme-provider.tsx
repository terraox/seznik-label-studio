import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Appearance, useColorScheme } from 'react-native';

import { useSettingsStore } from '@/stores/settings-store';

import { ThemeContext, type ThemeValue } from './context';
import { applyNavigationBarStyle } from './navigation-bar';
import { THEME_DARK_READY, ThemeTokens, type AppearancePreference, type ColorScheme } from './tokens';

const subscribeHydration = (onChange: () => void) =>
  useSettingsStore.persist.onFinishHydration(onChange);
const getHydrated = () => useSettingsStore.persist.hasHydrated();

/** True once the saved settings (including Appearance) have loaded from storage. */
export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getHydrated, getHydrated);
}

/** What the app should use, after the kill switch. */
function effectivePreference(saved: AppearancePreference): AppearancePreference {
  return THEME_DARK_READY || __DEV__ ? saved : 'light';
}

/**
 * App-wide theme. Pushes the choice to the OS layer with `Appearance.setColorScheme` so React
 * Navigation, Android system dialogs and `useColorScheme()` follow it, then exposes the
 * resolved tokens through context. Switching applies live, with no restart.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const saved = useSettingsStore((s) => s.appearance);
  const preference = effectivePreference(saved ?? 'system');

  useLayoutEffect(() => {
    // null = follow the system again.
    Appearance.setColorScheme(preference === 'system' ? null : preference);
  }, [preference]);

  const system = useColorScheme();
  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  useEffect(() => {
    applyNavigationBarStyle(scheme);
    // Some OEM skins reset the bar when the app comes back; set it again on resume.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyNavigationBarStyle(scheme);
    });
    return () => sub.remove();
  }, [scheme]);

  const value = useMemo<ThemeValue>(() => ({ scheme, colors: ThemeTokens[scheme] }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
