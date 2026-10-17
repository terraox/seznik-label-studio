import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { rulerTicksFor, type RulerTick } from '@/lib/editor/ruler-ticks';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/** Ruler gutter: large enough for legible mm labels while the canvas gives up only this much. */
export const RULER_SIZE = 22;

export type LiveRulerBounds = {
  leftMm: SharedValue<number>;
  topMm: SharedValue<number>;
  widthMm: SharedValue<number>;
  heightMm: SharedValue<number>;
  visible: SharedValue<boolean>;
};


type Tick = RulerTick;

function formatTick(mm: number) {
  return Number.isInteger(mm) ? String(mm) : mm.toFixed(1);
}

function spacedMajor(ticks: Tick[], minGapPx: number, lengthMm?: number) {
  const majors = ticks.filter((t) => t.kind === 'major');
  const kept: Tick[] = [];
  for (const tick of majors) {
    // If this is the exact end-boundary tick of the ruler (e.g. 80mm on an 80mm label),
    // omit its label so it doesn't compress or crowd the final segment.
    // The ruler boundary is clearly demarcated by the end tick mark line and artboard edge.
    if (lengthMm !== undefined && Math.abs(tick.mm - lengthMm) < 0.01) {
      continue;
    }
    const prev = kept[kept.length - 1];
    if (prev && Math.abs(tick.px - prev.px) < minGapPx) continue;
    kept.push(tick);
  }
  return kept;
}

function tickLen(kind: Tick['kind'], major: number, mid: number, minor: number) {
  if (kind === 'major') return major;
  if (kind === 'mid') return mid;
  return minor;
}

/**
 * Stable millimetre scale along the main canvas. Ticks align flush to the nested artboard.
 *
 * Memoised on purpose: a ruler is ~100 native SVG nodes, and it used to be
 * rebuilt on every editor render — including every selection change — for a
 * selection band that `liveBounds` already draws on the UI thread.
 */
export const HorizontalRuler = memo(function HorizontalRuler({
  trackWidthPx,
  originPx,
  contentWidthPx,
  lengthMm,
  selectedRangeMm,
  liveBounds,
}: {
  trackWidthPx: number;
  originPx: number;
  contentWidthPx: number;
  lengthMm: number;
  selectedRangeMm?: { start: number; end: number } | null;
  liveBounds?: LiveRulerBounds;
}) {
  useThemeRefresh();
  const track = Math.max(1, trackWidthPx);
  const content = Math.max(1, contentWidthPx);
  const origin = Math.max(0, originPx);
  const ticks = useMemo(() => rulerTicksFor(lengthMm, content), [lengthMm, content]);
  const labels = useMemo(() => spacedMajor(ticks, 28, lengthMm), [ticks, lengthMm]);

  // Selected element projection on horizontal ruler (fallback for static prop)
  const selectionProjection = useMemo(() => {
    if (liveBounds || !selectedRangeMm || lengthMm <= 0) return null;
    const x1 = Math.max(0, Math.min(track, origin + (selectedRangeMm.start / lengthMm) * content));
    const x2 = Math.max(0, Math.min(track, origin + (selectedRangeMm.end / lengthMm) * content));
    const left = Math.min(x1, x2);
    const width = Math.max(1, Math.abs(x2 - x1));
    return { x1, x2, left, width };
  }, [liveBounds, selectedRangeMm, lengthMm, content, origin, track]);

  const animatedOverlayStyle = useAnimatedStyle(() => {
    if (!liveBounds || !liveBounds.visible.value || lengthMm <= 0) {
      return { opacity: 0 };
    }
    const leftVal = liveBounds.leftMm.value;
    const widthVal = liveBounds.widthMm.value;
    const x1 = Math.max(0, Math.min(track, origin + (leftVal / lengthMm) * content));
    const x2 = Math.max(0, Math.min(track, origin + ((leftVal + widthVal) / lengthMm) * content));
    const left = Math.min(x1, x2);
    const width = Math.max(1, Math.abs(x2 - x1));
    return {
      opacity: 1,
      left,
      width,
    };
  }, [liveBounds, lengthMm, content, origin, track]);

  return (
    <View style={[styles.hTrack, { width: track }]}>
      <Svg width={track} height={RULER_SIZE} style={StyleSheet.absoluteFill}>
        {/* Light blue-grey background */}
        <Rect x={0} y={0} width={track} height={RULER_SIZE} fill={C.fill} />

        {/* Selected element projection band & edge indicators (static fallback) */}
        {selectionProjection && (
          <>
            <Rect
              x={selectionProjection.left}
              y={0}
              width={selectionProjection.width}
              height={RULER_SIZE - 1}
              fill={C.brandInk}
              opacity={0.12}
            />
            <Line
              x1={selectionProjection.x1}
              y1={0}
              x2={selectionProjection.x1}
              y2={RULER_SIZE - 1}
              stroke={C.brandInk}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            <Line
              x1={selectionProjection.x2}
              y1={0}
              x2={selectionProjection.x2}
              y2={RULER_SIZE - 1}
              stroke={C.brandInk}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          </>
        )}

        {/* Ticks: touching the bottom divider line at y = RULER_SIZE - 1 */}
        {ticks.map((tick) => {
          const h = tickLen(tick.kind, 7, 5, 3);
          const isStart = tick.mm < 0.001;
          const isEnd = Math.abs(tick.mm - lengthMm) < 0.01;
          const isMajor = tick.kind === 'major';
          const stroke = isMajor
            ? C.brandInk
            : tick.kind === 'mid'
              ? C.textMuted
              : C.textDisabled;
          const strokeWidth = isMajor ? 1.25 : 1;
          const halfStroke = strokeWidth / 2;
          // Inset stroke at bounds so boundary ticks are crisp and not clipped by overflow: 'hidden'
          let x = origin + tick.px;
          if (isStart) {
            x = origin + halfStroke;
          } else if (isEnd) {
            x = origin + track - halfStroke;
          }
          return (
            <Line
              key={`h-${tick.mm}`}
              x1={x}
              y1={RULER_SIZE - 1 - h}
              x2={x}
              y2={RULER_SIZE - 1}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="square"
            />
          );
        })}

        {/* Thin 1px divider seam line in brand blue connecting ruler flush to canvas */}
        <Line
          x1={0}
          y1={RULER_SIZE - 0.5}
          x2={track}
          y2={RULER_SIZE - 0.5}
          stroke={C.brandInk}
          strokeWidth={1}
        />
      </Svg>

      {/* Real-time Reanimated selection projection overlay */}
      {liveBounds && (
        <Animated.View
          style={[styles.hSelectionOverlay, animatedOverlayStyle]}
          pointerEvents="none"
        />
      )}

      {labels.map((tick) => {
        const isStart = tick.mm < 0.001;
        return (
          <Text
            key={`hl-${tick.mm}`}
            style={[
              styles.hLabel,
              isStart ? styles.endLabel : null,
              { left: origin + tick.px + 2 },
            ]}>
            {formatTick(tick.mm)}
          </Text>
        );
      })}
    </View>
  );
});

export const VerticalRuler = memo(function VerticalRuler({
  trackHeightPx,
  originPx,
  contentHeightPx,
  lengthMm,
  selectedRangeMm,
  liveBounds,
}: {
  trackHeightPx: number;
  originPx: number;
  contentHeightPx: number;
  lengthMm: number;
  selectedRangeMm?: { start: number; end: number } | null;
  liveBounds?: LiveRulerBounds;
}) {
  useThemeRefresh();
  const track = Math.max(1, trackHeightPx);
  const content = Math.max(1, contentHeightPx);
  const origin = Math.max(0, originPx);
  const ticks = useMemo(() => rulerTicksFor(lengthMm, content), [lengthMm, content]);
  const labels = useMemo(() => spacedMajor(ticks, 22, lengthMm), [ticks, lengthMm]);

  // Selected element projection on vertical ruler (fallback for static prop)
  const selectionProjection = useMemo(() => {
    if (liveBounds || !selectedRangeMm || lengthMm <= 0) return null;
    const y1 = Math.max(0, Math.min(track, origin + (selectedRangeMm.start / lengthMm) * content));
    const y2 = Math.max(0, Math.min(track, origin + (selectedRangeMm.end / lengthMm) * content));
    const top = Math.min(y1, y2);
    const height = Math.max(1, Math.abs(y2 - y1));
    return { y1, y2, top, height };
  }, [liveBounds, selectedRangeMm, lengthMm, content, origin, track]);

  const animatedOverlayStyle = useAnimatedStyle(() => {
    if (!liveBounds || !liveBounds.visible.value || lengthMm <= 0) {
      return { opacity: 0 };
    }
    const topVal = liveBounds.topMm.value;
    const heightVal = liveBounds.heightMm.value;
    const y1 = Math.max(0, Math.min(track, origin + (topVal / lengthMm) * content));
    const y2 = Math.max(0, Math.min(track, origin + ((topVal + heightVal) / lengthMm) * content));
    const top = Math.min(y1, y2);
    const height = Math.max(1, Math.abs(y2 - y1));
    return {
      opacity: 1,
      top,
      height,
    };
  }, [liveBounds, lengthMm, content, origin, track]);

  return (
    <View style={[styles.vTrack, { height: track }]}>
      <Svg width={RULER_SIZE} height={track} style={StyleSheet.absoluteFill}>
        {/* Light blue-grey background */}
        <Rect x={0} y={0} width={RULER_SIZE} height={track} fill={C.fill} />

        {/* Selected element projection band & edge indicators (static fallback) */}
        {selectionProjection && (
          <>
            <Rect
              x={0}
              y={selectionProjection.top}
              width={RULER_SIZE - 1}
              height={selectionProjection.height}
              fill={C.brandInk}
              opacity={0.12}
            />
            <Line
              x1={0}
              y1={selectionProjection.y1}
              x2={RULER_SIZE - 1}
              y2={selectionProjection.y1}
              stroke={C.brandInk}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            <Line
              x1={0}
              y1={selectionProjection.y2}
              x2={RULER_SIZE - 1}
              y2={selectionProjection.y2}
              stroke={C.brandInk}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          </>
        )}

        {/* Ticks: touching the right divider line at x = RULER_SIZE - 1 */}
        {ticks.map((tick) => {
          const w = tickLen(tick.kind, 7, 5, 3);
          const isStart = tick.mm < 0.001;
          const isEnd = Math.abs(tick.mm - lengthMm) < 0.01;
          const isMajor = tick.kind === 'major';
          const stroke = isMajor
            ? C.brandInk
            : tick.kind === 'mid'
              ? C.textMuted
              : C.textDisabled;
          const strokeWidth = isMajor ? 1.25 : 1;
          const halfStroke = strokeWidth / 2;
          let y = origin + tick.px;
          if (isStart) {
            y = origin + halfStroke;
          } else if (isEnd) {
            y = origin + track - halfStroke;
          }
          return (
            <Line
              key={`v-${tick.mm}`}
              x1={RULER_SIZE - 1 - w}
              y1={y}
              x2={RULER_SIZE - 1}
              y2={y}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="square"
            />
          );
        })}

        {/* Thin 1px divider seam line in brand blue connecting ruler flush to canvas */}
        <Line
          x1={RULER_SIZE - 0.5}
          y1={0}
          x2={RULER_SIZE - 0.5}
          y2={track}
          stroke={C.brandInk}
          strokeWidth={1}
        />
      </Svg>

      {/* Real-time Reanimated selection projection overlay */}
      {liveBounds && (
        <Animated.View
          style={[styles.vSelectionOverlay, animatedOverlayStyle]}
          pointerEvents="none"
        />
      )}

      {labels.map((tick) => {
        const isStart = tick.mm < 0.001;
        return (
          <Text
            key={`vl-${tick.mm}`}
            style={[
              styles.vLabel,
              isStart ? styles.endLabel : null,
              { top: origin + tick.px + 2 },
            ]}>
            {formatTick(tick.mm)}
          </Text>
        );
      })}
    </View>
  );
});

export const RulerCorner = memo(function RulerCorner() {
  useThemeRefresh();
  return (
    <View style={styles.corner}>
      <Text style={styles.cornerText}>mm</Text>
    </View>
  );
});

const styles = themedStyles((c, scheme) => ({
  hTrack: {
    height: RULER_SIZE,
    backgroundColor: c.fill,
    overflow: 'hidden',
  },
  vTrack: {
    width: RULER_SIZE,
    backgroundColor: c.fill,
    overflow: 'hidden',
  },
  hSelectionOverlay: {
    position: 'absolute',
    top: 0,
    height: RULER_SIZE - 1,
    backgroundColor: scheme === 'light' ? 'rgba(33, 70, 104, 0.12)' : c.accentSoft, // theme-fixed: light keeps its navy band
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderLeftColor: c.brandInk,
    borderRightColor: c.brandInk,
  },
  vSelectionOverlay: {
    position: 'absolute',
    left: 0,
    width: RULER_SIZE - 1,
    backgroundColor: scheme === 'light' ? 'rgba(33, 70, 104, 0.12)' : c.accentSoft, // theme-fixed: light keeps its navy band
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: c.brandInk,
    borderBottomColor: c.brandInk,
  },
  hLabel: {
    position: 'absolute',
    top: 2,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
    color: c.textMuted,
  },
  vLabel: {
    position: 'absolute',
    left: 2,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
    color: c.textMuted,
  },
  endLabel: {
    color: c.brandInk,
    fontWeight: '700',
  },
  corner: {
    width: RULER_SIZE,
    height: RULER_SIZE,
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.brandInk,
  },
  cornerText: {
    color: c.brandInk,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'lowercase',
  },
}));
