import { StyleSheet } from 'react-native';

import { useScheme } from './context';
import { ThemeTokens, type ColorScheme, type ThemeColors } from './tokens';

type NamedStyles<T> = StyleSheet.NamedStyles<T>;

/**
 * Theme-aware replacement for a module-level `StyleSheet.create`.
 *
 *   const useStyles = makeStyles((c) => ({ root: { backgroundColor: c.bg } }));
 *   function Screen() { const styles = useStyles(); ... }
 *
 * The factory runs at most once per scheme; the result is cached.
 */
export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (c: ThemeColors, scheme: ColorScheme) => T & NamedStyles<any>,
): () => T {
  const cache: Partial<Record<ColorScheme, T>> = {};
  return function useStyles(): T {
    const scheme = useScheme();
    let styles = cache[scheme];
    if (!styles) {
      styles = StyleSheet.create(factory(ThemeTokens[scheme], scheme)) as T;
      cache[scheme] = styles;
    }
    return styles;
  };
}
