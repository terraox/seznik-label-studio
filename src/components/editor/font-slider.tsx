import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { themedStyles, useThemeRefresh } from '@/theme';

const THUMB_SIZE = 20;
const TRACK_HEIGHT = 4;

function clampFontSize(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export function FontSlider({
  value,
  onChange,
  min = 6,
  max = 72,
  step = 0.5,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  useThemeRefresh();
  const trackWidth = useRef(1);
  /** Page-X of the track's left edge, frozen for the active gesture. */
  const originPageX = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const boundsRef = useRef({ min, max, step });
  boundsRef.current = { min, max, step };
  const lastSent = useRef(value);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  if (!dragging) lastSent.current = value;

  const displayValue = dragging ? dragValue : value;
  const clamped = clampFontSize(displayValue, min, max, step);
  const ratio = max > min ? (clamped - min) / (max - min) : 0;

  const applyAbsoluteX = (absoluteX: number) => {
    const { min: lo, max: hi, step: st } = boundsRef.current;
    const w = trackWidth.current || 1;
    const nextRatio = Math.min(1, Math.max(0, (absoluteX - originPageX.current) / w));
    const next = clampFontSize(lo + nextRatio * (hi - lo), lo, hi, st);
    setDragValue(next);
    if (next === lastSent.current) return;
    lastSent.current = next;
    onChangeRef.current(next);
  };

  const beginDrag = (absoluteX: number, localX: number) => {
    // absoluteX - localX is the detector view's left edge in window coords at gesture start.
    // Freeze it so later panel/layout shifts cannot yank the value under the finger.
    originPageX.current = absoluteX - localX;
    setDragging(true);
    applyAbsoluteX(absoluteX);
  };

  const endDrag = () => {
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
        style={styles.sliderBlock}
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
