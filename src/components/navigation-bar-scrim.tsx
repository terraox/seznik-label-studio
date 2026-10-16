import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme';

/**
 * A surface behind Android's system navigation bar, drawn above every screen. It matches the tab
 * bar: white with dark buttons in light mode, near-black with white buttons in dark mode.
 *
 * The app is edge-to-edge, so screens paint under the navigation bar and the buttons end up
 * on whatever that screen happens to show — tab bar, canvas area, camera preview. The theme sets
 * the button colour (src/theme/navigation-bar.ts), so this keeps a matching surface under them
 * on every screen instead of fixing each screen's own bottom colour.
 *
 * Screens still pad their own content by `insets.bottom`; this only paints that strip.
 */
export function NavigationBarScrim() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  if (Platform.OS !== 'android' || insets.bottom <= 0) return null;
  return <View pointerEvents="none" style={[styles.scrim, { height: insets.bottom }]} />;
}

const useStyles = makeStyles((c) => ({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.surface,
  },
}));
