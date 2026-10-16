import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Signature strokes as drawn on the label. Print-safe: rendered by element-renderer (canvas,
 * previews and print capture), so it must never read the app theme.
 */

export type SignaturePoint = { x: number; y: number };

export type SignatureStroke = {
  points: SignaturePoint[];
  strokeWidth: number;
};

/** Signature ink (label content, printed). */
export const SIGNATURE_INK = '#111827';

export function pointsToPath(points: SignaturePoint[]) {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y}${rest.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

export function denormalizeStrokes(strokes: SignatureStroke[], width: number, height: number): SignatureStroke[] {
  return strokes.map((stroke) => ({
    strokeWidth: stroke.strokeWidth * width,
    points: stroke.points.map((point) => ({
      x: point.x * width,
      y: point.y * height,
    })),
  }));
}

type SignaturePreviewProps = {
  strokes: SignatureStroke[];
  width: number;
  height: number;
  color?: string;
};

export function SignaturePreview({
  strokes,
  width,
  height,
  color = SIGNATURE_INK,
}: SignaturePreviewProps) {
  const pixelStrokes = useMemo(
    () => denormalizeStrokes(strokes, width, height),
    [height, strokes, width],
  );

  if (pixelStrokes.length === 0) {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: '#CBD5E1',
            backgroundColor: 'rgba(248,250,252,0.6)',
          },
        ]}
      />
    );
  }

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
      preserveAspectRatio="none">
      {pixelStrokes.map((stroke, index) => (
        <Path
          key={`preview-stroke-${index}`}
          d={pointsToPath(stroke.points)}
          stroke={color}
          strokeWidth={stroke.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
