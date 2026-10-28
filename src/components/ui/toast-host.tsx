import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { dismissToast, getCurrentToast, subscribeToasts } from '@/lib/toast';
import { themedStyles, useThemeRefresh } from '@/theme';

/** Renders the toast from `showToast`. Mounted once at the root. */
export function ToastHost() {
  useThemeRefresh();
  const reduce = useReducedMotion();
  const toast = useSyncExternalStore(subscribeToasts, getCurrentToast, getCurrentToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismissToast(toast.id), toast.durationMs ?? 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const bottom = (initialWindowMetrics?.insets.bottom ?? 0) + 16;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Animated.View
        key={toast.id}
        entering={reduce ? undefined : FadeInDown.duration(200)}
        exiting={reduce ? undefined : FadeOutDown.duration(160)}
        accessibilityLiveRegion="polite"
        style={styles.toast}>
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              dismissToast(toast.id);
              toast.onAction?.();
            }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Text style={styles.actionText}>{toast.actionLabel}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    maxWidth: 420,
    width: '100%',
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 14,
    backgroundColor: c.inkFill,
    borderWidth: 1,
    borderColor: c.cardBorder,
  },
  message: { flex: 1, color: c.onAccent, fontSize: 14, fontWeight: '500' },
  action: {
    minHeight: 44,
    minWidth: 56,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: c.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.6 },
}));
