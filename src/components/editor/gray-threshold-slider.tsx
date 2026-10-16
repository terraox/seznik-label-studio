import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { themedStyles, useThemeRefresh } from '@/theme';

export function GrayThresholdSlider({
  value,
  onChange,
  min = 0,
  max = 255,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Range and snap step. Defaults give the original 0-255 threshold slider. */
  min?: number;
  max?: number;
  step?: number;
}) {
  useThemeRefresh();
  const widthRef = useRef(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setFromX = (x: number) => {
    const w = widthRef.current || 1;
    const ratio = Math.max(0, Math.min(1, x / w));
    const raw = min + ratio * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    onChangeRef.current(Math.max(min, Math.min(max, Number(snapped.toFixed(4)))));
  };

  const gesture = useMemo(() => {
    const fire = (x: number) => setFromX(x);
    const pan = Gesture.Pan()
      .activeOffsetX([-2, 2])
      .failOffsetY([-16, 16])
      .onBegin((e) => {
        runOnJS(fire)(e.x);
      })
      .onUpdate((e) => {
        runOnJS(fire)(e.x);
      });
    const tap = Gesture.Tap().onEnd((e) => {
      runOnJS(fire)(e.x);
    });
    return Gesture.Exclusive(pan, tap);
  }, []);

  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.sliderBlock}
        onLayout={(event) => {
          widthRef.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        hitSlop={{ top: 12, bottom: 12 }}>
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${ratio * 100}%` }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = themedStyles((c) => ({
  sliderBlock: {
    height: 28,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: c.fillStrong,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: c.accent,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.accent,
  },
}));
