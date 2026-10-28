import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { themedStyles, useThemeRefresh } from '@/theme';

const THUMB_SIZE = 20;
const TRACK_HEIGHT = 4;

function snapValue(value: number, min: number, max: number, step: number): number {
  'worklet';
  if (!(step > 0)) return Math.min(max, Math.max(min, value));
  const stepped = Math.round((value - min) / step) * step + min;
  // Avoid 1.0000000002 style float noise on 0.25 steps.
  const rounded = Math.round(stepped * 1e6) / 1e6;
  return Math.min(max, Math.max(min, rounded));
}

export type RangeSliderProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Extra top margin — font rows use a bit more spacing than threshold rows. */
  compact?: boolean;
  /** Minimum gap between live updates to the parent. For sliders that re-render the canvas. */
  throttleMs?: number;
};

/**
 * Shared element-menu slider. The thumb and fill are driven by Reanimated shared values on the
 * UI thread, so they follow the finger every frame no matter how busy React or the canvas is.
 * Only the value sent to the parent is throttled (rAF-coalesced), and only when it changes.
 */
export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 1,
  compact = false,
  throttleMs = 0,
}: RangeSliderProps) {
  useThemeRefresh();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastSent = useRef(value);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushAt = useRef(0);
  const throttleRef = useRef(throttleMs);
  throttleRef.current = throttleMs;

  const trackWidth = useSharedValue(1);
  const originX = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lastValue = useSharedValue(value);
  const lo = useSharedValue(min);
  const hi = useSharedValue(max);
  const st = useSharedValue(step);
  const progress = useSharedValue(max > min ? (value - min) / (max - min) : 0);
  const grow = useSharedValue(0);

  // Follow the parent value whenever the finger is not on the slider.
  useEffect(() => {
    lo.value = min;
    hi.value = max;
    st.value = step;
    if (dragging.value) return;
    const clamped = snapValue(value, min, max, step);
    lastValue.value = clamped;
    lastSent.current = clamped;
    progress.value = max > min ? (clamped - min) / (max - min) : 0;
  }, [value, min, max, step, lo, hi, st, dragging, lastValue, progress]);

  const flushPending = () => {
    rafRef.current = null;
    timerRef.current = null;
    lastFlushAt.current = Date.now();
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next == null || next === lastSent.current) return;
    lastSent.current = next;
    onChangeRef.current(next);
  };

  const scheduleOnChange = (next: number) => {
    pendingRef.current = next;
    if (rafRef.current != null || timerRef.current != null) return;
    const wait = throttleRef.current - (Date.now() - lastFlushAt.current);
    if (wait > 0) {
      timerRef.current = setTimeout(flushPending, wait);
      return;
    }
    rafRef.current = requestAnimationFrame(flushPending);
  };

  const endDrag = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    flushPending();
  };

  const gesture = useMemo(() => {
    const moveTo = (absoluteX: number) => {
      'worklet';
      const w = trackWidth.value || 1;
      const ratio = Math.min(1, Math.max(0, (absoluteX - originX.value) / w));
      const next = snapValue(lo.value + ratio * (hi.value - lo.value), lo.value, hi.value, st.value);
      const span = hi.value - lo.value;
      progress.value = span > 0 ? (next - lo.value) / span : 0;
      if (next !== lastValue.value) {
        lastValue.value = next;
        runOnJS(scheduleOnChange)(next);
      }
    };
    const begin = (absoluteX: number, localX: number) => {
      'worklet';
      originX.value = absoluteX - localX;
      dragging.value = true;
      grow.value = withTiming(1, { duration: 120 });
      moveTo(absoluteX);
    };
    const finish = () => {
      'worklet';
      dragging.value = false;
      grow.value = withTiming(0, { duration: 160 });
      runOnJS(endDrag)();
    };
    const pan = Gesture.Pan()
      .activeOffsetX([-2, 2])
      .failOffsetY([-16, 16])
      .onBegin((e) => {
        begin(e.absoluteX, e.x);
      })
      .onUpdate((e) => {
        moveTo(e.absoluteX);
      })
      .onFinalize(() => {
        finish();
      });
    const tap = Gesture.Tap().onEnd((e) => {
      begin(e.absoluteX, e.x);
      finish();
    });
    return Gesture.Exclusive(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * trackWidth.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * trackWidth.value - THUMB_SIZE / 2 }, { scale: 1 + 0.15 * grow.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.sliderBlock, compact && styles.sliderBlockCompact]}
        onLayout={(event) => {
          trackWidth.value = event.nativeEvent.layout.width || 1;
        }}
        hitSlop={{ top: 12, bottom: 12 }}>
        <View style={styles.trackWrap}>
          <View style={styles.sliderTrack}>
            <Animated.View style={[styles.sliderFill, fillStyle]} />
          </View>
          <Animated.View style={[styles.sliderThumb, thumbStyle]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = themedStyles((c) => ({
  sliderBlock: {
    marginTop: 10,
    paddingBottom: 4,
    minHeight: THUMB_SIZE,
    justifyContent: 'center',
  },
  sliderBlockCompact: {
    marginTop: 0,
    paddingBottom: 0,
    height: 28,
  },
  trackWrap: {
    height: THUMB_SIZE,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrack: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: c.fillStrong,
    overflow: 'hidden',
  },
  sliderFill: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: c.accent,
  },
  sliderThumb: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.accent,
  },
}));
