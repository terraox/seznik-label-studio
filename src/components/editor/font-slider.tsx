import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

const ACCENT = '#48C3C7';
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
  const trackWidth = useRef(1);
  const clamped = clampFontSize(value, min, max, step);
  const ratio = (clamped - min) / (max - min);

  const setFromX = (x: number) => {
    const nextRatio = Math.min(1, Math.max(0, x / trackWidth.current));
    onChange(clampFontSize(min + nextRatio * (max - min), min, max, step));
  };

  return (
    <View style={styles.sliderBlock}>
      <View
        style={styles.sliderHit}
        onLayout={(event) => {
          trackWidth.current = event.nativeEvent.layout.width || 1;
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => setFromX(event.nativeEvent.locationX)}
        onResponderMove={(event) => setFromX(event.nativeEvent.locationX)}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  sliderBlock: {
    marginTop: 10,
    paddingBottom: 4,
  },
  sliderHit: {
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
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  sliderFill: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: ACCENT,
  },
  sliderThumb: {
    position: 'absolute',
    top: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: ACCENT,
  },
});
