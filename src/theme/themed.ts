import { StyleSheet } from 'react-native';

import { useScheme } from './context';
import { ThemeTokens, type ColorScheme, type ThemeColors } from './tokens';

/**
 * Module-level themed styles for large screens, where threading a `useStyles()` hook through every
 * helper is impractical.
 *
 *   const styles = themedStyles((c) => ({ root: { backgroundColor: c.bg } }));
 *   function Screen() { useThemeRefresh(); return <View style={styles.root} />; }
 *
 * `styles.x` and `C.x` resolve against the scheme of the component that is currently rendering.
 * Every component that reads them must call `useThemeRefresh()` first: that subscribes it to theme
 * changes and records its scheme (so `LightScope` still works). Helpers called during that render
 * read the same scheme.
 */

let activeScheme: ColorScheme = 'light';

/** Subscribe the calling component to theme changes and make it the active scheme for this render. */
export function useThemeRefresh(): ColorScheme {
  const scheme = useScheme();
  activeScheme = scheme;
  return scheme;
}

/** Colour tokens for the component currently rendering. Read inside render only. */
export const C: ThemeColors = new Proxy({} as ThemeColors, {
  get: (_target, key) => ThemeTokens[activeScheme][key as keyof ThemeColors],
});

type NamedStyles<T> = StyleSheet.NamedStyles<T>;

export function themedStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (c: ThemeColors, scheme: ColorScheme) => T & NamedStyles<any>,
): T {
  const cache: Partial<Record<ColorScheme, T>> = {};
  const resolve = (): T => {
    const scheme = activeScheme;
    let styles = cache[scheme];
    if (!styles) {
      styles = StyleSheet.create(factory(ThemeTokens[scheme], scheme)) as T;
      cache[scheme] = styles;
    }
    return styles;
  };
  return new Proxy({} as T, {
    get: (_target, key) => resolve()[key as keyof T],
    has: (_target, key) => key in resolve(),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, key) => {
      const styles = resolve();
      return key in styles
        ? { configurable: true, enumerable: true, value: styles[key as keyof T] }
        : undefined;
    },
  });
}
