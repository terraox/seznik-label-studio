import { memo, useMemo } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { dotsPerMm } from '@/lib/printer/print-spec';
import { gridRectsToPath } from '@/lib/print-grid';
import { buildPrintRulerGeometry, PRINT_RULER_LINE_MM } from '@/lib/print-ruler';

function mmRectsToPath(
  rects: { left: number; top: number; width: number; height: number }[],
  unitsPerMm: number,
  lineUnits: number,
  dx = 0,
  dy = 0,
): string {
  const t = Math.max(1, lineUnits);
  const grid = rects.map((r) => ({
    left: Math.round(r.left * unitsPerMm) + dx,
    top: Math.round(r.top * unitsPerMm) + dy,
    width: Math.max(t, Math.round(r.width * unitsPerMm)),
    height: Math.max(t, Math.round(r.height * unitsPerMm)),
  }));
  return gridRectsToPath(grid);
}

/** Block-digit ruler — screen matches print (solid rects, no antialiased text). */
export const PrintRulerLayer = memo(function PrintRulerLayer({
  widthMm,
  heightMm,
  widthPx,
  heightPx,
  printDpi,
  shiftMm,
}: {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  printDpi?: number;
  shiftMm?: { x: number; y: number };
}) {
  const inkPath = useMemo(() => {
    const shiftX = shiftMm?.x ?? 0;
    const shiftY = shiftMm?.y ?? 0;
    const geometry = buildPrintRulerGeometry(widthMm, heightMm);

    if (printDpi != null) {
      const dpm = dotsPerMm(printDpi);
      const lineUnits = Math.max(1, Math.round(PRINT_RULER_LINE_MM * dpm));
      return {
        viewW: Math.max(1, Math.round(widthMm * dpm)),
        viewH: Math.max(1, Math.round(heightMm * dpm)),
        d: mmRectsToPath(
          geometry.inkRects,
          dpm,
          lineUnits,
          Math.round(shiftX * dpm),
          Math.round(shiftY * dpm),
        ),
      };
    }

    const density = PixelRatio.get() || 1;
    const viewW = Math.max(1, Math.round(widthPx * density));
    const upm = viewW / Math.max(widthMm, 0.01);
    const lineUnits = Math.max(1, Math.round(PRINT_RULER_LINE_MM * upm));
    return {
      viewW,
      viewH: Math.max(1, Math.round(heightPx * density)),
      d: mmRectsToPath(geometry.inkRects, upm, lineUnits),
    };
  }, [widthMm, heightMm, widthPx, heightPx, printDpi, shiftMm?.x, shiftMm?.y]);

  if (!inkPath.d) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Svg
        width={widthPx}
        height={heightPx}
        viewBox={`0 0 ${inkPath.viewW} ${inkPath.viewH}`}
        preserveAspectRatio="none">
        <Path d={inkPath.d} fill="#0F172A" />
      </Svg>
    </View>
  );
});
