/**
 * Horizontal split handle between the label artboard and the bottom tools sheet.
 * Lean bar, 44px hit target, Gesture.Pan (Reanimated UI thread worklet).
 *
 * During active drag:
 * Updates `canvasHeightSv` directly on the UI thread worklet for 60/120fps live resize.
 * Zero React component re-renders on the JS thread during active dragging.
 *
 * On release:
 * Computes `resolveSplitRelease` on the UI thread and notifies `onDragEnd` to persist settled state.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  DIVIDER_BAR_THICKNESS_PX,
  DIVIDER_HIT_SIZE_PX,
  PANEL_MIN_HEIGHT_PX,
  canvasHeightAfterDrag,
  resolveSplitRelease,
  type SplitReleaseResult,
} from '@/lib/editor/canvas-split';
import { TopToolbarIcon } from '@/components/editor/editor-menu-icons';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type CanvasPanelDividerProps = {
  canvasHeightPx: number;
  canvasHeightSv?: SharedValue<number>;
  isDraggingSv?: SharedValue<boolean>;
  viewportPx: number;
  panelMinPx?: number;
  onCanvasHeightChange?: (nextCanvasPx: number) => void;
  onDragStart?: () => void;
  onDragEnd?: (result: SplitReleaseResult) => void;
  /** Finger lifted without a split-drag (tap or cancelled pan). */
  onDragCancel?: () => void;
  /** Stationary tap in the gap — used to clear canvas selection. */
  onTap?: () => void;
  /** `toolbar`: a compact "Drag" button for the end of the toolbar row (no layout strip). */
  variant?: 'bar' | 'toolbar';
};

export function CanvasPanelDivider({
  canvasHeightPx,
  canvasHeightSv,
  isDraggingSv,
  viewportPx,
  panelMinPx = PANEL_MIN_HEIGHT_PX,
  onCanvasHeightChange,
  onDragStart,
  onDragEnd,
  onDragCancel,
  onTap,
  variant = 'bar',
}: CanvasPanelDividerProps) {
  useThemeRefresh();
  const fallbackHeightSv = useSharedValue(canvasHeightPx);
  const activeHeightSv = canvasHeightSv ?? fallbackHeightSv;
  const startPxSv = useSharedValue(canvasHeightPx);
  const viewportPxSv = useSharedValue(viewportPx);
  const panelMinPxSv = useSharedValue(panelMinPx);

  useEffect(() => {
    viewportPxSv.value = viewportPx;
  }, [viewportPx, viewportPxSv]);

  useEffect(() => {
    panelMinPxSv.value = panelMinPx;
  }, [panelMinPx, panelMinPxSv]);

  const callbacksRef = useRef({ onDragStart, onDragEnd, onDragCancel, onCanvasHeightChange, onTap });
  callbacksRef.current = { onDragStart, onDragEnd, onDragCancel, onCanvasHeightChange, onTap };

  const fireDragStart = useCallback(() => {
    callbacksRef.current.onDragStart?.();
  }, []);

  const fireCanvasHeightChange = useCallback((nextPx: number) => {
    callbacksRef.current.onCanvasHeightChange?.(nextPx);
  }, []);

  const fireDragEnd = useCallback((result: SplitReleaseResult) => {
    callbacksRef.current.onDragEnd?.(result);
  }, []);

  const fireTap = useCallback(() => {
    callbacksRef.current.onTap?.();
  }, []);

  const fireDragCancel = useCallback(() => {
    callbacksRef.current.onDragCancel?.();
  }, []);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(8)
      .activeOffsetY([-8, 8])
      .shouldCancelWhenOutside(false)
      .hitSlop({ top: 12, bottom: 12 })
      .onBegin(() => {
        'worklet';
        startPxSv.value = activeHeightSv.value;
      })
      .onStart(() => {
        'worklet';
        if (isDraggingSv) {
          isDraggingSv.value = true;
        }
        runOnJS(fireDragStart)();
      })
      .onUpdate((e) => {
        'worklet';
        const nextPx = canvasHeightAfterDrag({
          startCanvasPx: startPxSv.value,
          deltaY: e.translationY,
          viewportPx: viewportPxSv.value,
          panelMinPx: panelMinPxSv.value,
        });
        activeHeightSv.value = nextPx;
        runOnJS(fireCanvasHeightChange)(nextPx);
      })
      .onEnd((e) => {
        'worklet';
        const rawFinalPx = canvasHeightAfterDrag({
          startCanvasPx: startPxSv.value,
          deltaY: e.translationY,
          viewportPx: viewportPxSv.value,
          panelMinPx: panelMinPxSv.value,
        });
        const result = resolveSplitRelease({
          canvasPx: rawFinalPx,
          viewportPx: viewportPxSv.value,
          panelMinPx: panelMinPxSv.value,
        });
        activeHeightSv.value = result.canvasPx;
        if (isDraggingSv) {
          isDraggingSv.value = false;
        }
        runOnJS(fireDragEnd)(result);
      })
      .onFinalize(() => {
        'worklet';
        if (isDraggingSv) {
          isDraggingSv.value = false;
        }
        runOnJS(fireDragCancel)();
      });

    const tap = Gesture.Tap()
      .maxDuration(400)
      .maxDistance(10)
      .onEnd((_e, success) => {
        'worklet';
        if (success) {
          runOnJS(fireTap)();
        }
      });

    return Gesture.Exclusive(pan, tap);
  }, [
    activeHeightSv,
    fireCanvasHeightChange,
    fireDragCancel,
    fireDragEnd,
    fireDragStart,
    fireTap,
    isDraggingSv,
    panelMinPxSv,
    startPxSv,
    viewportPxSv,
  ]);

  if (variant === 'toolbar') {
    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          collapsable={false}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to resize canvas and editing panel"
          style={[styles.toolbarHandle, Platform.OS === 'web' ? (webHandleStyle as object) : null]}>
          <TopToolbarIcon name="Drag" size={22} color={C.textSecondary} />
          <Text numberOfLines={1} style={styles.toolbarHandleLabel}>
            Drag
          </Text>
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        accessibilityRole="adjustable"
        accessibilityLabel="Resize canvas and editing panel"
        style={[styles.hit, Platform.OS === 'web' ? (webHandleStyle as object) : null]}>
        <View pointerEvents="none" style={styles.bar} />
      </Animated.View>
    </GestureDetector>
  );
}

const webHandleStyle = {
  touchAction: 'none',
  cursor: 'row-resize',
  userSelect: 'none',
} as const;

const styles = themedStyles((c) => ({
  toolbarHandle: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 0,
    paddingVertical: 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: c.hairline,
  },
  toolbarHandleLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: c.textSecondary,
    textAlign: 'center',
  },
  hit: {
    height: DIVIDER_HIT_SIZE_PX,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.bg,
    zIndex: 10,
  },
  bar: {
    width: 44,
    height: DIVIDER_BAR_THICKNESS_PX,
    borderRadius: 2,
    backgroundColor: c.textDisabled,
  },
}));
