import { Pressable, Text, View } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { useTipsStore } from '@/stores/tips-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/** A small dismissible hint shown on first visits. It never blocks anything and shows once. */
export function TipBanner({ id, text }: { id: string; text: string }) {
  useThemeRefresh();
  const hydrated = useTipsStore.persist?.hasHydrated?.() ?? true;
  const seen = useTipsStore((s) => s.seen.includes(id));
  const markSeen = useTipsStore((s) => s.markSeen);
  // Wait for the saved list to load so a tip you already closed does not flash up.
  if (!hydrated || seen) return null;
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={styles.banner}>
      <AppIcon name="info.circle" tintColor={C.accentInk} size={18} />
      <Text style={styles.text}>{text}</Text>
      <Pressable
        hitSlop={10}
        onPress={() => markSeen(id)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
        style={styles.close}>
        <AppIcon name="xmark" tintColor={C.textMuted} size={14} />
      </Pressable>
    </Animated.View>
  );
}

const styles = themedStyles((c) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 14,
    backgroundColor: c.accentSoft,
  },
  text: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    color: c.text,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
