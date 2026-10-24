import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { themedStyles, useThemeRefresh } from '@/theme';

const THUMB_SIZE = 20;
const TRACK_HEIGHT = 4;

function snapValue(value: number, min: number, max: number, step: number): number {
  if (!(step > 0)) return Math.min(max, Math.max(min, value));
  const stepped = Math.round((value - min) / step) * step + min;
  // Avoid 1.0000000002 style float noise on 0.25 steps.
  const rounded = Number(stepped.toFixed(6));
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
 * Shared element-menu slider. Finger position is tracked in window coords so
 * thumb/fill re-renders (and heavy canvas patches like line-emoji thickness)
 * cannot yank the value mid-drag. Parent updates are rAF-coalesced; the thumb
 * follows a local drag value so the control stays smooth even when React lags.
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
  const trackWidth = useRef(1);
  /** Page-X of the track's left edge, frozen for the active gesture. */
  const originPageX = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const boundsRef = useRef({ min, max, step });
  boundsRef.current = { min, max, step };
  const lastSent = useRef(value);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushAt = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  if (!dragging) lastSent.current = value;

  const displayValue = dragging ? dragValue : value;
  const clamped = snapValue(displayValue, min, max, step);
  const ratio = max > min ? (clamped - min) / (max - min) : 0;

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
    const wait = throttleMs - (Date.now() - lastFlushAt.current);
    if (wait > 0) {
      timerRef.current = setTimeout(flushPending, wait);
      return;
    }
    rafRef.current = requestAnimationFrame(flushPending);
  };

  const applyAbsoluteX = (absoluteX: number) => {
    const { min: lo, max: hi, step: st } = boundsRef.current;
    const w = trackWidth.current || 1;
    const nextRatio = Math.min(1, Math.max(0, (absoluteX - originPageX.current) / w));
    const next = snapValue(lo + nextRatio * (hi - lo), lo, hi, st);
    setDragValue(next);
    scheduleOnChange(next);
  };

  const beginDrag = (absoluteX: number, localX: number) => {
    originPageX.current = absoluteX - localX;
    setDragging(true);
    applyAbsoluteX(absoluteX);
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
    setDragging(false);
  };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-2, 2])
      .failOffsetY([-16, 16])
      .onBegin((e) => {
        runOnJS(beginDrag)(e.absoluteX, e.x);
      })
      .onUpdate((e) => {
        runOnJS(applyAbsoluteX)(e.absoluteX);
      })
      .onFinalize(() => {
        runOnJS(endDrag)();
      });
    const tap = Gesture.Tap().onEnd((e) => {
      runOnJS(beginDrag)(e.absoluteX, e.x);
      runOnJS(endDrag)();
    });
    return Gesture.Exclusive(pan, tap);
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.sliderBlock, compact && styles.sliderBlockCompact]}
        onLayout={(event) => {
          trackWidth.current = event.nativeEvent.layout.width || 1;
        }}
        hitSlop={{ top: 12, bottom: 12 }}>
        <View style={styles.trackWrap}>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
          </View>
          <View
            style={[
              styles.sliderThumb,
              { left: `${ratio * 100}%`, transform: [{ translateX: -THUMB_SIZE / 2 }] },
            ]}
          />
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
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.accent,
  },
}));
