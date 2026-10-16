import { memo, useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { LiveRulerBounds } from '@/components/canvas-rulers';
import { themedStyles, useThemeRefresh } from '@/theme';

const HUD_THROTTLE_MS = 80;

/**
 * Live size during resize, or a short chrome status (safe mode / grid).
 * Sits in the strip between the quick-action bar and the horizontal ruler.
 */
export const ResizeSizeHud = memo(function ResizeSizeHud({
  liveBounds,
  visibleSv,
  statusText,
}: {
  liveBounds: LiveRulerBounds;
  visibleSv: SharedValue<number>;
  statusText?: string | null;
}) {
  useThemeRefresh();
  const [text, setText] = useState<string | null>(null);
  const lastAtSv = useSharedValue(0);

  const applyHud = useCallback((show: boolean, widthMm: number, heightMm: number) => {
    if (!show) {
      setText(null);
      return;
    }
    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return;
    setText(`${widthMm.toFixed(2)} × ${heightMm.toFixed(2)} mm`);
  }, []);

  useAnimatedReaction(
    () => {
      'worklet';
      return {
        show: visibleSv.value > 0.5,
        w: liveBounds.widthMm.value,
        h: liveBounds.heightMm.value,
      };
    },
    (cur, prev) => {
      'worklet';
      if (!cur.show) {
        lastAtSv.value = 0;
        if (prev?.show) {
          runOnJS(applyHud)(false, 0, 0);
        }
        return;
      }
      const now = Date.now();
      const first = !prev?.show;
      if (!first && now - lastAtSv.value < HUD_THROTTLE_MS) return;
      lastAtSv.value = now;
      runOnJS(applyHud)(true, cur.w, cur.h);
    },
  );

  const shown = text ?? statusText ?? null;
  if (!shown) return null;

  return (
    <View pointerEvents="none" style={styles.host}>
      <View style={styles.pill}>
        <Text style={styles.text}>{shown}</Text>
      </View>
    </View>
  );
});

const styles = themedStyles((c) => ({
  host: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    backgroundColor: c.header,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  text: {
    color: c.onAccent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
}));
