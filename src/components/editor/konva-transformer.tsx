import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path as SvgPath, Line as SvgLine } from 'react-native-svg';
import { AppIcon } from '@/components/app-icon';
import { type LiveRulerBounds } from '@/components/canvas-rulers';
import { ElementContentView } from '@/components/editor/element-renderer';
import {
  ensureTableCells,
  hitTestTableCell,
  hitTestTableCellFromViewPoint,
  pointerMmToTableLocal,
  sameTableCellSelection,
} from '@/lib/editor/table-cells';
import { elementSizeMm, type LabelElement, type MediaShape } from '@/lib/label-document';
import { clampToLabelBounds } from '@/lib/editor/label-bounds';
import { DIVIDER_HIT_SIZE_PX } from '@/lib/editor/canvas-split';
import { finiteMm, roundMm } from '@/lib/editor/engine';
import { fullyInsideLabelMm } from '@/lib/editor/safe-mode';
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';
import { grabOffsetMm } from '@/lib/editor/view-transform';
import { formatDataSourceColumn } from '@/lib/editor/data-source-display';
import { createFrameThrottled } from '@/lib/editor/drag-layer';
import { useSettingsStore } from '@/stores/settings-store';
import {
  aspectRatioOf,
  resizeMemberByScale,
  resizePolicyFor,
  type ResizeAnchor,
  type ResizeBehavior,
} from '@/lib/editor/resize-policy';
import { computeTextElementHeightMm } from '@/lib/text-metrics';
import {
  buildLiveLayoutBank,
  useVisibleTextRevision,
  visibleTextHeightMm,
} from '@/lib/visible-text-layout';
import {
  CHROME_HANDLE_FILL,
  CHROME_HANDLE_ICON_COLOR,
  CHROME_HANDLE_ICON_SIZE,
  CHROME_HANDLE_RADIUS_PX,
  CHROME_HANDLE_SIZE_PX,
  CHROME_SELECTION_STROKE,
  DRAG_LIFT_OPACITY,
} from '@/lib/editor/canvas-chrome';

export type TransformCommitPayload = {
  id: string;
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  fontSize?: number;
};

export type TransformMovePayload = {
  id: string;
  leftMm: number;
  topMm: number;
};

export type TransformStartKind = 'move' | 'resize';

/** 'touch' = touch-down (add-only in Multiple mode); 'toggle' = tap that may remove. */
export type SelectSource = 'touch' | 'toggle';

import { type ElementAnchorRect } from '@/lib/editor/quick-value';
import { themedStyles, useThemeRefresh } from '@/theme';

export type KonvaTransformerProps = {
  element: LabelElement;
  pxPerMM: number;
  padZoom: number;
  selected: boolean;
  selectionColor: string;
  canvasWidthMm: number;
  canvasHeightMm: number;
  /** Stock shape from the document — the print capture uses this, so the editor must too. */
  mediaShape?: MediaShape;
  liveBounds?: LiveRulerBounds;
  deselectGesture?: GestureType;
  activeSelectedIdSv?: SharedValue<string>;
  topBarSelectionVisibleSv?: SharedValue<number>;
  bottomPanelVisibleSv?: SharedValue<number>;
  multipleMode?: boolean;
  /** 1 when selectedIds.length > 1 */
  groupEligibleSv?: SharedValue<number>;
  groupAnchorIdSv?: SharedValue<string>;
  groupDeltaLeftMm?: SharedValue<number>;
  groupDeltaTopMm?: SharedValue<number>;
  groupScaleXSv?: SharedValue<number>;
  groupScaleYSv?: SharedValue<number>;
  /** 0 = east, 1 = south */
  groupHandleSv?: SharedValue<number>;
  groupScaleMinSv?: SharedValue<number>;
  groupScaleMaxSv?: SharedValue<number>;
  onGroupResizeHandleBegin?: (handle: 'e' | 's') => void;
  /** 1 when Safe Mode is on — drags may leave the label, then spring back on release. */
  safeModeSv?: SharedValue<number>;
  onSelect: (id: string, source?: SelectSource) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onQuickEdit?: (id: string, anchorRect?: ElementAnchorRect) => void;
  onTransformStart?: (id: string, kind: TransformStartKind) => void;
  onTransformMove?: (payload: TransformMovePayload) => void;
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
  /** cell=null clears cell selection and shows table-level panel. */
  onTableCellPress?: (tableId: string, cell: { row: number; col: number } | null) => void;
  /** Double-tap a cell: open the existing QuickValueModal for that cell's text. */
  onTableCellQuickEdit?: (
    tableId: string,
    cell: { row: number; col: number },
    anchorRect?: ElementAnchorRect,
  ) => void;
  selectedTableCell?: { row: number; col: number } | null;
  tableSelectionColor?: string;
  /** Window point → artboard mm. Drag commit goes through this, not raw px. */
  pointerToMm?: (windowX: number, windowY: number) => { x: number; y: number } | null;
  /** Magnetic snap for move-drag. Returns millimetre left/top. */
  snapMoveMm?: (input: {
    id: string;
    leftMm: number;
    topMm: number;
    widthMm: number;
    heightMm: number;
  }) => { leftMm: number; topMm: number };
};

const HIT_TARGET_PX = 36;

/**
 * Drag activation / tap tolerance.
 * A finger must travel >10px before the element starts following (kills sudden-drag
 * on what was meant to be a tap). Once that threshold is crossed, the move is kept —
 * even a short seating onto a corner. Treating those as taps was snapping them back.
 */
const DRAG_ACTIVATE_DIST_SQ_PX = 100; // (10px)^2

/** Standard double-tap window. Wider gaps are two unrelated taps, not a double tap. */
const DOUBLE_TAP_MAX_GAP_MS = 300;
/** Soft overshoot so a Safe Mode release outside the label settles back inside. */
const SAFE_MODE_SPRING = { damping: 12, stiffness: 180, mass: 0.6 };

/** Below this the two reports are one physical tap double-counted. */
const DOUBLE_TAP_MIN_GAP_MS = 30;
/** Both taps must land on roughly the same spot, not opposite ends of a wide element. */
const DOUBLE_TAP_MAX_DIST_PX = 32;
/** Dedupes the native, UI-thread, and JS-thread detectors firing for one gesture. */
const DOUBLE_TAP_DEDUPE_MS = 350;

function asResizeBehavior(value: string | ResizeBehavior): ResizeBehavior {
  'worklet';
  if (value === 'aspect' || value === 'square' || value === 'height' || value === 'width') {
    return value;
  }
  return 'width';
}

function logMultiTransformBox(
  phase: string,
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  console.log(
    `[multi-transform] ${phase} ${id} l=${left.toFixed(2)} t=${top.toFixed(2)} w=${width.toFixed(2)} h=${height.toFixed(2)}`,
  );
}

type HandlePosition = ResizeAnchor;

export const KonvaTransformer = memo(function KonvaTransformer({
  element,
  pxPerMM,
  padZoom,
  selected,
  selectionColor,
  canvasWidthMm,
  canvasHeightMm,
  mediaShape,
  liveBounds,
  deselectGesture,
  activeSelectedIdSv,
  topBarSelectionVisibleSv,
  bottomPanelVisibleSv,
  multipleMode = false,
  groupEligibleSv,
  groupAnchorIdSv,
  groupDeltaLeftMm,
  groupDeltaTopMm,
  groupScaleXSv,
  groupScaleYSv,
  groupHandleSv,
  groupScaleMinSv,
  groupScaleMaxSv,
  onGroupResizeHandleBegin,
  onSelect,
  onOpenPanel,
  onEditText,
  onQuickEdit,
  onTransformStart,
  onTransformMove,
  onTransformEnd,
  onQuickRotate,
  onTableCellPress,
  onTableCellQuickEdit,
  selectedTableCell,
  tableSelectionColor,
  pointerToMm,
  snapMoveMm,
  safeModeSv,
}: KonvaTransformerProps) {
  useThemeRefresh();
  const pxPerMMSafe = pxPerMM > 0 && Number.isFinite(pxPerMM) ? pxPerMM : 1;
  const sx = pxPerMMSafe;
  const sy = pxPerMMSafe;
  const resizePolicy = resizePolicyFor(element);
  const naturalSize = elementSizeMm(element);
  const isTextElement = element.type === 'text' || element.type === 'degrees';
  const isAutoHeight = isTextElement && element.autoTextHeight !== false && element.autoWrapping !== 'Close';
  // Auto-height text keeps every wrapped line even when that runs past the label edge —
  // capping to frameRoomH was clipping the last lines after a narrow resize.
  // Not capped to the room left of the element's origin either: a box pushed toward an edge
  // keeps its size (the canvas clips it); capping shrank it on every push and the commit saved that.
  const sizeMm = {
    width: naturalSize.width,
    height: naturalSize.height,
  };
  const hidden = element.visible === false;
  const aspectRatio = Math.max(1e-6, aspectRatioOf(element));

  const baseLeftPx = mmToPx(finiteMm(element.left), pxPerMMSafe);
  const baseTopPx = mmToPx(finiteMm(element.top), pxPerMMSafe);
  const baseWidthPx = Math.max(1, mmToPx(sizeMm.width, pxPerMMSafe));
  const baseHeightPx = Math.max(element.type === 'line' ? 2 : 1, mmToPx(sizeMm.height, pxPerMMSafe));
  const minResizePx = Math.max(2, resizePolicy.minMm * pxPerMMSafe);
  const baseRotation = element.rotation ?? 0;
  // Border shape comes from the stock shape, never from how square the label
  // happens to be. The print capture decides this from `mediaShape`
  // (label-preview -> element-renderer), so a squareness guess here meant a
  // square rectangular label drew an ellipse ring on screen and a rectangle on paper.
  const borderMediaShape = element.type === 'border' ? mediaShape : undefined;

  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const originLeftSv = useSharedValue(baseLeftPx);
  const originTopSv = useSharedValue(baseTopPx);
  const padZoomSv = useSharedValue(padZoom > 0 ? padZoom : 1);
  const sizeWMmSv = useSharedValue(sizeMm.width);
  const sizeHMmSv = useSharedValue(sizeMm.height);
  const canvasWMmSv = useSharedValue(canvasWidthMm);
  const canvasHMmSv = useSharedValue(canvasHeightMm);
  const sxSv = useSharedValue(sx);
  const sySv = useSharedValue(sy);
  const startTX = useSharedValue(0);
  const startTY = useSharedValue(0);
  const startW = useSharedValue(baseWidthPx);
  const startH = useSharedValue(baseHeightPx);
  const startRot = useSharedValue(0);
  const startAbsX = useSharedValue(0);
  const startAbsY = useSharedValue(0);
  const animW = useSharedValue(baseWidthPx);
  const animH = useSharedValue(baseHeightPx);
  const animRot = useSharedValue<number>(baseRotation);
  const minResizeMmSv = useSharedValue(resizePolicy.minMm);
  const aspectSv = useSharedValue(aspectRatio);
  const lastTapTimeSv = useSharedValue(0);
  const lastTapXSv = useSharedValue(0);
  const lastTapYSv = useSharedValue(0);
  const tapHandledSv = useSharedValue(false);

  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const textContent =
    element.type === 'text'
      ? element.contentType === 'Data Source' && element.columnNameContent
        ? formatDataSourceColumn(element.columnNameContent, showColumnName)
        : element.text
      : element.type === 'degrees'
        ? element.contentType === 'Data Source' && element.columnNameContent
          ? formatDataSourceColumn(element.columnNameContent, showColumnName)
          : element.content
        : '';
  const textFontSize = 'fontSize' in element && typeof element.fontSize === 'number' ? element.fontSize : 12;
  const textAutoWrapping = 'autoWrapping' in element ? element.autoWrapping ?? 'Word' : 'Word';
  const textLineSpacing = 'lineSpacing' in element ? element.lineSpacing ?? '1.0' : '1.0';
  const textCharSpacing = 'charSpacing' in element && typeof element.charSpacing === 'number' ? element.charSpacing : 0;
  const textBold = 'bold' in element ? element.bold ?? false : false;
  const textAlign = 'align' in element && typeof element.align === 'string' ? element.align : 'left';
  const textVerticalDisplay = 'verticalDisplay' in element ? element.verticalDisplay ?? false : false;
  const textFontFamily = 'fontFamily' in element && typeof element.fontFamily === 'string' ? element.fontFamily : '';

  const isAutoTextSv = useSharedValue(isAutoHeight);
  const wrapTextOnWidthSv = useSharedValue(isTextElement);
  const textContentSv = useSharedValue(textContent);
  const textFontSizeSv = useSharedValue(textFontSize);
  const autoWrappingSv = useSharedValue(textAutoWrapping);
  const lineSpacingSv = useSharedValue(textLineSpacing);
  const charSpacingSv = useSharedValue(textCharSpacing);
  const boldSv = useSharedValue(textBold);
  const verticalDisplaySv = useSharedValue(textVerticalDisplay);
  const fontFamilySv = useSharedValue(textFontFamily);

  const isInteracting = useSharedValue(false);
  useVisibleTextRevision();

  // True from the first frame of a text width drag until the committed size is on screen.
  // The content swaps to a natively wrapping Text on the UI thread, so words reflow with
  // the frame instead of being clipped while React catches up.
  const textLiveSv = useSharedValue(false);
  // Native live-text laid-out height in px. Skia wrap can undershoot RN wrap on narrow boxes;
  // the frame grows to whichever is taller so the last lines are never clipped mid-drag.
  const liveNativeHeightSv = useSharedValue(0);
  // Height lookup built while idle (on select). Drag start only flips textLiveSv — no JS work.
  const liveHeightStartsSv = useSharedValue<number[]>([]);
  const liveHeightValuesSv = useSharedValue<number[]>([]);
  const liveHeightReadySv = useSharedValue(false);
  const lastLiveLogTickSv = useSharedValue(0);
  const textLiveReleaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTextLiveTimer = useCallback(() => {
    if (textLiveReleaseTimer.current != null) {
      clearTimeout(textLiveReleaseTimer.current);
      textLiveReleaseTimer.current = null;
    }
  }, []);
  // Hold the live text until the commit lands. The timer covers a commit that changes nothing.
  const releaseTextLiveJS = useCallback(() => {
    clearTextLiveTimer();
    textLiveReleaseTimer.current = setTimeout(() => {
      textLiveReleaseTimer.current = null;
      textLiveSv.value = false;
    }, 450);
  }, [clearTextLiveTimer, textLiveSv]);
  useEffect(() => clearTextLiveTimer, [clearTextLiveTimer]);
  // The committed size is on screen: hand back to the resting, print-accurate lines.
  useEffect(() => {
    clearTextLiveTimer();
    textLiveSv.value = false;
  }, [sizeMm.width, sizeMm.height, clearTextLiveTimer, textLiveSv]);

  // When native wrap lays out taller than the Skia estimate, grow the live frame immediately
  // even if the finger is still — otherwise the last lines stay clipped until the next move.
  useAnimatedReaction(
    () => (textLiveSv.value ? liveNativeHeightSv.value : 0),
    (hPx) => {
      if (hPx <= 1) return;
      if (hPx > animH.value + 0.5) {
        animH.value = hPx;
      }
    },
  );

  // Prefetch wrapped heights for every reachable width while the element is selected, so a
  // width drag never blocks the JS thread measuring text mid-gesture.
  useEffect(() => {
    if (!isTextElement || !selected) {
      liveHeightReadySv.value = false;
      return;
    }
    if (textVerticalDisplay || textAlign === 'justify' || textAlign === 'spacing') {
      liveHeightReadySv.value = false;
      return;
    }
    let cancelled = false;
    const handle = requestAnimationFrame(() => {
      if (cancelled) return;
      const minW = Math.max(0.5, resizePolicy.minMm);
      const maxW = Math.max(minW, canvasWidthMm - Math.max(0, finiteMm(element.left)));
      const bank = buildLiveLayoutBank(
        {
          text: textContent,
          fontSize: textFontSize,
          autoWrapping: textAutoWrapping === 'Close' ? 'Word' : textAutoWrapping,
          lineSpacing: textLineSpacing,
          charSpacing: textCharSpacing,
          bold: textBold,
          verticalDisplay: textVerticalDisplay,
          fontFamily: textFontFamily || undefined,
        },
        minW,
        maxW,
        0.5,
      );
      if (cancelled) return;
      liveHeightStartsSv.value = bank.starts;
      liveHeightValuesSv.value = bank.heights;
      liveHeightReadySv.value = bank.starts.length > 0;
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [
    isTextElement,
    selected,
    textContent,
    textFontSize,
    textAutoWrapping,
    textLineSpacing,
    textCharSpacing,
    textBold,
    textVerticalDisplay,
    textFontFamily,
    textAlign,
    resizePolicy.minMm,
    canvasWidthMm,
    element.left,
    liveHeightStartsSv,
    liveHeightValuesSv,
    liveHeightReadySv,
  ]);

  const liftSv = useSharedValue(1);
  const selectedSv = useSharedValue(selected);
  const multipleModeSv = useSharedValue(multipleMode);
  const anchorStartLeftMmSv = useSharedValue(finiteMm(element.left));
  const anchorStartTopMmSv = useSharedValue(finiteMm(element.top));
  const hasMovedSv = useSharedValue(false);
  const followerStartLeftMmSv = useSharedValue(finiteMm(element.left));
  const followerStartTopMmSv = useSharedValue(finiteMm(element.top));
  const followerStartWidthMmSv = useSharedValue(sizeMm.width);
  const followerStartHeightMmSv = useSharedValue(sizeMm.height);
  const resizeBehaviorESv = useSharedValue(resizePolicy.behavior.e ?? 'none');
  const resizeBehaviorSSv = useSharedValue(resizePolicy.behavior.s ?? 'none');
  const beginTimeSv = useSharedValue(0);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    selectedSv.value = selected;
  }, [selected, selectedSv]);

  useEffect(() => {
    multipleModeSv.value = multipleMode;
  }, [multipleMode, multipleModeSv]);

  useEffect(() => {
    padZoomSv.value = padZoom > 0 ? padZoom : 1;
    sizeWMmSv.value = sizeMm.width;
    sizeHMmSv.value = sizeMm.height;
    canvasWMmSv.value = canvasWidthMm;
    canvasHMmSv.value = canvasHeightMm;
    sxSv.value = sx;
    sySv.value = sy;
    minResizeMmSv.value = resizePolicy.minMm;
    aspectSv.value = aspectRatio;
    isAutoTextSv.value = isAutoHeight;
    wrapTextOnWidthSv.value = isTextElement;
    textContentSv.value = textContent;
    textFontSizeSv.value = textFontSize;
    autoWrappingSv.value = textAutoWrapping;
    lineSpacingSv.value = textLineSpacing;
    charSpacingSv.value = textCharSpacing;
    boldSv.value = textBold;
    verticalDisplaySv.value = textVerticalDisplay;
    fontFamilySv.value = textFontFamily;
    resizeBehaviorESv.value = resizePolicy.behavior.e ?? 'none';
    resizeBehaviorSSv.value = resizePolicy.behavior.s ?? 'none';
  }, [
    padZoom,
    sizeMm.width,
    sizeMm.height,
    canvasWidthMm,
    canvasHeightMm,
    sx,
    sy,
    resizePolicy.minMm,
    aspectRatio,
    isAutoHeight,
    isTextElement,
    textContent,
    textFontSize,
    textAutoWrapping,
    textLineSpacing,
    textCharSpacing,
    textBold,
    textVerticalDisplay,
    textFontFamily,
    padZoomSv,
    sizeWMmSv,
    sizeHMmSv,
    canvasWMmSv,
    canvasHMmSv,
    sxSv,
    sySv,
    minResizeMmSv,
    aspectSv,
    isAutoTextSv,
    wrapTextOnWidthSv,
    textContentSv,
    textFontSizeSv,
    autoWrappingSv,
    lineSpacingSv,
    charSpacingSv,
    boldSv,
    verticalDisplaySv,
    fontFamilySv,
    resizeBehaviorESv,
    resizeBehaviorSSv,
    resizePolicy.behavior.e,
    resizePolicy.behavior.s,
  ]);

  useEffect(() => {
    // Don't clobber an in-progress gesture. A gesture folds its own final
    // position/size into these shared values synchronously as soon as it ends.
    const groupActive = Boolean(
      groupAnchorIdSv?.value &&
        groupAnchorIdSv.value !== '' &&
        selectedSv.value,
    );
    if (isInteracting.value || groupActive) {
      return;
    }

    transX.value = 0;
    transY.value = 0;
    originLeftSv.value = baseLeftPx;
    originTopSv.value = baseTopPx;
    animW.value = baseWidthPx;
    animH.value = baseHeightPx;
    animRot.value = baseRotation;
    startW.value = baseWidthPx;
    startH.value = baseHeightPx;
    liftSv.value = 1;
  }, [
    element.left,
    element.top,
    sizeMm.width,
    sizeMm.height,
    element.rotation,
    baseLeftPx,
    baseTopPx,
    baseWidthPx,
    baseHeightPx,
    baseRotation,
    transX,
    transY,
    originLeftSv,
    originTopSv,
    animW,
    animH,
    animRot,
    isInteracting,
    groupAnchorIdSv,
    selectedSv,
    startW,
    startH,
    liftSv,
  ]);

  const lastTapRef = useRef({ id: '', time: 0 });
  const lastTapAbsRef = useRef({ x: NaN, y: NaN });
  const lastTapViewRef = useRef({ x: NaN, y: NaN });
  const pendingRemoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({
    onSelect,
    onOpenPanel,
    onEditText,
    onQuickEdit,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    onTableCellPress,
    onTableCellQuickEdit,
    selected,
    multipleMode,
  });
  callbacksRef.current = {
    onSelect,
    onOpenPanel,
    onEditText,
    onQuickEdit,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    onTableCellPress,
    onTableCellQuickEdit,
    selected,
    multipleMode,
  };
  const pointerToMmRef = useRef(pointerToMm);
  pointerToMmRef.current = pointerToMm;
  const elementBoxRef = useRef({
    left: finiteMm(element.left),
    top: finiteMm(element.top),
    width: sizeMm.width,
    height: sizeMm.height,
  });
  elementBoxRef.current = {
    left: finiteMm(element.left),
    top: finiteMm(element.top),
    width: sizeMm.width,
    height: sizeMm.height,
  };
  const resizeStartRef = useRef(elementBoxRef.current);
  const grabOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const emitMoveRef = useRef(onTransformMove);
  emitMoveRef.current = onTransformMove;
  const dragMovePump = useMemo(
    () =>
      createFrameThrottled<{ leftMm: number; topMm: number }>((pos) => {
        emitMoveRef.current?.({ id: element.id, leftMm: pos.leftMm, topMm: pos.topMm });
      }),
    [element.id],
  );
  useEffect(() => () => dragMovePump.cancel(), [dragMovePump]);

  /** Committed drag: moves position only. NEVER alters width, height, or fontSize. */
  const dispatchDragCommitMm = useCallback(
    (leftMm: number, topMm: number) => {
      const widthMm = sizeMm.width;
      const heightMm = sizeMm.height;
      const clamped = clampToLabelBounds(
        { left: leftMm, top: topMm, width: widthMm, height: heightMm },
        { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
        { anchor: 'body' },
      );
      const roundedLeft = clamped.left;
      const roundedTop = clamped.top;
      logMultiTransformBox('commit', element.id, roundedLeft, roundedTop, widthMm, heightMm);

      if (Math.abs(roundedLeft - element.left) < 0.005 && Math.abs(roundedTop - element.top) < 0.005) {
        if (groupAnchorIdSv?.value === element.id) {
          groupAnchorIdSv.value = '';
          if (groupDeltaLeftMm) groupDeltaLeftMm.value = 0;
          if (groupDeltaTopMm) groupDeltaTopMm.value = 0;
        }
        isInteracting.value = false;
        return;
      }

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: roundedLeft,
        topMm: roundedTop,
        widthMm: roundMm(widthMm),
        heightMm: roundMm(heightMm),
        rotation: ((Math.round(baseRotation / 90) * 90) % 360 + 360) % 360,
      });
      isInteracting.value = false;
    },
    [
      sizeMm.width,
      sizeMm.height,
      canvasWidthMm,
      canvasHeightMm,
      element.id,
      element.left,
      element.top,
      baseRotation,
      isInteracting,
      groupAnchorIdSv,
      groupDeltaLeftMm,
      groupDeltaTopMm,
    ],
  );

  useAnimatedReaction(
    () => groupAnchorIdSv?.value ?? '',
    (anchorId) => {
      if (anchorId && anchorId !== element.id && selectedSv.value) {
        followerStartLeftMmSv.value =
          (originLeftSv.value + transX.value) / sxSv.value;
        followerStartTopMmSv.value =
          (originTopSv.value + transY.value) / sySv.value;
        followerStartWidthMmSv.value = animW.value / sxSv.value;
        followerStartHeightMmSv.value = animH.value / sySv.value;
      }
    },
  );

  useAnimatedReaction(
    () => ({
      anchor: groupAnchorIdSv?.value ?? '',
      dx: groupDeltaLeftMm?.value ?? 0,
      dy: groupDeltaTopMm?.value ?? 0,
      scaleX: groupScaleXSv?.value ?? 1,
      scaleY: groupScaleYSv?.value ?? 1,
      handle: groupHandleSv?.value ?? 0,
    }),
    (cur) => {
      if (!cur.anchor || cur.anchor === element.id || !selectedSv.value) {
        return;
      }
      const handle: ResizeAnchor = cur.handle === 1 ? 's' : 'e';
      const rawBehavior = handle === 'e' ? resizeBehaviorESv.value : resizeBehaviorSSv.value;
      const start = {
        left: followerStartLeftMmSv.value,
        top: followerStartTopMmSv.value,
        width: followerStartWidthMmSv.value,
        height: followerStartHeightMmSv.value,
      };
      const box =
        rawBehavior === 'none'
          ? start
          : resizeMemberByScale({
              start,
              handle,
              behavior: asResizeBehavior(rawBehavior),
              scaleX: cur.scaleX,
              scaleY: cur.scaleY,
              aspect: aspectSv.value > 0 ? aspectSv.value : 1,
              minMm: minResizeMmSv.value,
              canvas: { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
            });
      originLeftSv.value = (box.left + cur.dx) * sxSv.value;
      originTopSv.value = (box.top + cur.dy) * sySv.value;
      transX.value = 0;
      transY.value = 0;
      if (wrapTextOnWidthSv.value && handle === 'e') {
        const wrapH = computeTextElementHeightMm({
          text: textContentSv.value,
          fontSize: textFontSizeSv.value,
          widthMm: Math.max(0.5, box.width),
          autoWrapping: autoWrappingSv.value,
          lineSpacing: lineSpacingSv.value,
          charSpacing: charSpacingSv.value,
          bold: boldSv.value,
          verticalDisplay: verticalDisplaySv.value,
          fontFamily: fontFamilySv.value || undefined,
        });
        const maxH = Math.max(minResizeMmSv.value, canvasHMmSv.value - (box.top + cur.dy));
        animW.value = Math.max(1, box.width * sxSv.value);
        animH.value = Math.max(1, Math.min(maxH, wrapH) * sySv.value);
      } else {
        animW.value = Math.max(1, box.width * sxSv.value);
        animH.value = Math.max(1, box.height * sySv.value);
      }
    },
  );

  const captureDragGrab = useCallback((windowX: number, windowY: number) => {
    const pointerMm = pointerToMmRef.current?.(windowX, windowY);
    if (!pointerMm) {
      grabOffsetRef.current = null;
      return;
    }
    grabOffsetRef.current = grabOffsetMm(pointerMm, {
      x: elementBoxRef.current.left,
      y: elementBoxRef.current.top,
    });
  }, []);

  const reportDragMove = useCallback(
    (_windowX: number, _windowY: number, fallbackLeftPx: number, fallbackTopPx: number) => {
      if (!emitMoveRef.current) return;
      dragMovePump.push({
        leftMm: pxToMm(fallbackLeftPx, pxPerMMSafe),
        topMm: pxToMm(fallbackTopPx, pxPerMMSafe),
      });
    },
    [dragMovePump, pxPerMMSafe],
  );

  const commitDragFromPointer = useCallback(
    (_windowX: number, _windowY: number, fallbackLeftPx: number, fallbackTopPx: number) => {
      dragMovePump.cancel();
      const leftMm = pxToMm(fallbackLeftPx, pxPerMMSafe);
      const topMm = pxToMm(fallbackTopPx, pxPerMMSafe);
      dispatchDragCommitMm(leftMm, topMm);
    },
    [dispatchDragCommitMm, dragMovePump, pxPerMMSafe],
  );

  const captureResizeStartFromPx = useCallback(
    (leftPx: number, topPx: number, wPx: number, hPx: number) => {
      resizeStartRef.current = {
        left: pxToMm(leftPx, pxPerMMSafe),
        top: pxToMm(topPx, pxPerMMSafe),
        width: pxToMm(wPx, pxPerMMSafe),
        height: pxToMm(hPx, pxPerMMSafe),
      };
    },
    [pxPerMMSafe],
  );

  /** Committed resize: same resizeMemberByScale as live preview. Origin never moves. */
  const dispatchResizeCommit = useCallback(
    (handle: ResizeAnchor, nextWPx: number, nextHPx: number, rot: number) => {
      const behavior = resizePolicy.behavior[handle];
      if (!behavior) {
        isInteracting.value = false;
        return;
      }
      const start = resizeStartRef.current;
      const startW = Math.max(0.001, start.width);
      const startH = Math.max(0.001, start.height);
      const scaleX = pxToMm(nextWPx, pxPerMMSafe) / startW;
      const scaleY = pxToMm(nextHPx, pxPerMMSafe) / startH;

      let fontSize: number | undefined;
      let naturalHeightMm: number | undefined;
      if (
        element.type !== 'barcode' &&
        element.type !== 'text' &&
        element.type !== 'degrees' &&
        element.type !== 'time' &&
        'fontSize' in element &&
        typeof element.fontSize === 'number'
      ) {
        const drivingScale = handle === 'e' ? scaleX : scaleY;
        fontSize = Math.max(4, Math.round(element.fontSize * drivingScale * 2) / 2);
      }

      const next = resizeMemberByScale({
        start,
        handle,
        behavior,
        scaleX,
        scaleY,
        aspect: aspectRatioOf(element),
        minMm: resizePolicy.minMm,
        canvas: { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
        naturalHeightMm,
        rotation: rot,
      });
      if (isTextElement && handle === 'e') {
        const wrapParams = {
          text: textContent,
          fontSize: textFontSize,
          widthMm: next.width,
          autoWrapping: textAutoWrapping,
          lineSpacing: textLineSpacing,
          charSpacing: textCharSpacing,
          bold: textBold,
          verticalDisplay: textVerticalDisplay,
          fontFamily: textFontFamily || undefined,
        };
        // Prefer the taller of Skia wrap and the native live layout so a narrow drag never
        // commits a frame that clips the last line on screen.
        const skiaH = visibleTextHeightMm(wrapParams);
        const nativeH = liveNativeHeightSv.value > 0 ? liveNativeHeightSv.value / pxPerMMSafe : 0;
        next.height = roundMm(Math.max(skiaH, nativeH));
      }

      const rotation = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
      if (rotation !== 0) {
        const rad = (rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const halfDw = (next.width - start.width) / 2;
        const halfDh = (next.height - start.height) / 2;
        next.left = roundMm(next.left + halfDw * cos - halfDh * sin - halfDw);
        next.top = roundMm(next.top + halfDw * sin + halfDh * cos - halfDh);
      }
      logMultiTransformBox('commit', element.id, next.left, next.top, next.width, next.height);

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: next.left,
        topMm: next.top,
        widthMm: next.width,
        heightMm: next.height,
        rotation,
        fontSize,
      });
      isInteracting.value = false;
    },
    [
      pxPerMMSafe,
      canvasWidthMm,
      canvasHeightMm,
      element,
      resizePolicy,
      isInteracting,
      isTextElement,
      isAutoHeight,
      textContent,
      textFontSize,
      textAutoWrapping,
      textLineSpacing,
      textCharSpacing,
      textBold,
      textVerticalDisplay,
      textFontFamily,
    ],
  );

  const bodyHitSlop = useMemo(() => {
    const target = 48;
    const minSlop = 16;
    return {
      top: Math.max(minSlop, (target - Math.max(1, baseHeightPx)) / 2),
      bottom: Math.max(minSlop, (target - Math.max(1, baseHeightPx)) / 2),
      left: Math.max(minSlop, (target - Math.max(1, baseWidthPx)) / 2),
      right: Math.max(minSlop, (target - Math.max(1, baseWidthPx)) / 2),
    };
  }, [baseHeightPx, baseWidthPx]);

  const notifyTransformStartJS = useCallback((id: string, kind: TransformStartKind) => {
    callbacksRef.current.onTransformStart?.(id, kind);
  }, []);

  /**
   * Touch-down selection so drag on another element switches panel before the move threshold.
   * Add-only: in Multiple mode touch-down never removes, so a group drag keeps every member.
   */
  const wasSelectedAtTouchRef = useRef(false);
  const notifySelectJS = useCallback((id: string) => {
    wasSelectedAtTouchRef.current = callbacksRef.current.selected;
    callbacksRef.current.onSelect(id, 'touch');
  }, []);

  const noteTapAbsJS = useCallback((x: number, y: number) => {
    lastTapAbsRef.current = { x, y };
  }, []);

  const noteTapViewJS = useCallback((x: number, y: number) => {
    lastTapViewRef.current = { x, y };
  }, []);

  const resolveTableCellHitJS = useCallback(
    (
      viewX?: number,
      viewY?: number,
      windowX?: number,
      windowY?: number,
    ): { row: number; col: number } | null => {
      if (element.type !== 'table') return null;
      const box = elementBoxRef.current;
      const table = ensureTableCells({
        ...element,
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      });
      const vx = Number.isFinite(viewX) ? viewX! : lastTapViewRef.current.x;
      const vy = Number.isFinite(viewY) ? viewY! : lastTapViewRef.current.y;
      if (Number.isFinite(vx) && Number.isFinite(vy) && baseWidthPx > 0 && baseHeightPx > 0) {
        const hit = hitTestTableCellFromViewPoint(table, vx, vy, baseWidthPx, baseHeightPx);
        if (hit) return hit;
      }
      const wx = Number.isFinite(windowX) ? windowX! : lastTapAbsRef.current.x;
      const wy = Number.isFinite(windowY) ? windowY! : lastTapAbsRef.current.y;
      const pt = pointerToMmRef.current?.(wx, wy);
      if (!pt) return null;
      const local = pointerMmToTableLocal(table, pt);
      return hitTestTableCell(table, local.x, local.y);
    },
    [element, baseWidthPx, baseHeightPx],
  );

  /** Highlight the cell under the finger on touch-down, before the gesture ends. */
  const highlightTableCellJS = useCallback(
    (viewX?: number, viewY?: number, windowX?: number, windowY?: number) => {
      if (element.type !== 'table' || !callbacksRef.current.onTableCellPress) return;
      const hit = resolveTableCellHitJS(viewX, viewY, windowX, windowY);
      if (hit) callbacksRef.current.onTableCellPress(element.id, hit);
    },
    [element.id, element.type, resolveTableCellHitJS],
  );

  const notifyGroupResizeHandleBeginJS = useCallback(
    (handle: 'e' | 's') => {
      onGroupResizeHandleBegin?.(handle);
    },
    [onGroupResizeHandleBegin],
  );

  const lastDoubleTapTimeRef = useRef(0);
  const lastLiveLogAtRef = useRef(0);
  const cancelPendingRemoveJS = useCallback(() => {
    if (pendingRemoveTimerRef.current) {
      clearTimeout(pendingRemoveTimerRef.current);
      pendingRemoveTimerRef.current = null;
    }
  }, []);
  useEffect(() => () => cancelPendingRemoveJS(), [cancelPendingRemoveJS]);

  const logLiveBoxJS = useCallback(
    (left: number, top: number, width: number, height: number) => {
      const now = Date.now();
      if (now - lastLiveLogAtRef.current < 200) return;
      lastLiveLogAtRef.current = now;
      logMultiTransformBox('live', element.id, left, top, width, height);
    },
    [element.id],
  );

  const triggerDoubleTapJS = useCallback(
    (viewX?: number, viewY?: number, windowX?: number, windowY?: number) => {
    cancelPendingRemoveJS();
    const now = Date.now();
    if (now - lastDoubleTapTimeRef.current < DOUBLE_TAP_DEDUPE_MS) {
      return;
    }
    lastDoubleTapTimeRef.current = now;
    lastTapRef.current = { id: '', time: 0 };
    lastTapTimeSv.value = 0;

    const openWithAnchor = (anchor?: ElementAnchorRect) => {
      if (element.type === 'table') {
        const hit = resolveTableCellHitJS(viewX, viewY, windowX, windowY);
        console.log(
          `[table-cell] double-tap tableId=${element.id} view=${viewX},${viewY} window=${windowX},${windowY} hit=${JSON.stringify(hit)} handler=${hit ? 'per-cell-quick-edit' : 'whole-table-onOpenPanel'}`,
        );
        if (hit && callbacksRef.current.onTableCellQuickEdit) {
          callbacksRef.current.onTableCellPress?.(element.id, hit);
          callbacksRef.current.onTableCellQuickEdit(element.id, hit, anchor);
          return;
        }
        callbacksRef.current.onOpenPanel(element.id);
        return;
      }
      if (
        element.type === 'text' ||
        element.type === 'barcode' ||
        element.type === 'qrcode' ||
        element.type === 'arctext' ||
        element.type === 'degrees'
      ) {
        if (callbacksRef.current.onQuickEdit) {
          callbacksRef.current.onQuickEdit(element.id, anchor);
        } else if (element.type === 'text' || element.type === 'degrees') {
          callbacksRef.current.onEditText(element.id);
        } else {
          callbacksRef.current.onOpenPanel(element.id);
        }
      } else {
        callbacksRef.current.onOpenPanel(element.id);
      }
    };

    if (containerRef.current && typeof (containerRef.current as any).measureInWindow === 'function') {
      (containerRef.current as any).measureInWindow((x: number, y: number, width: number, height: number) => {
        if (Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0) {
          openWithAnchor({ x, y, width, height });
        } else {
          openWithAnchor();
        }
      });
    } else {
      openWithAnchor();
    }
  },
  [element.id, element.type, lastTapTimeSv, cancelPendingRemoveJS, resolveTableCellHitJS],
  );

  const triggerSingleTapJS = useCallback(
    (viewX?: number, viewY?: number, windowX?: number, windowY?: number) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDouble =
      last.id === element.id &&
      now - last.time > DOUBLE_TAP_MIN_GAP_MS &&
      now - last.time < DOUBLE_TAP_MAX_GAP_MS;
    lastTapRef.current = { id: element.id, time: now };

    if (isDouble) {
      lastTapRef.current = { id: '', time: 0 };
      triggerDoubleTapJS(viewX, viewY, windowX, windowY);
      return;
    }

    if (element.type === 'table' && callbacksRef.current.onTableCellPress) {
      const hit = resolveTableCellHitJS(viewX, viewY, windowX, windowY);
      console.log(
        `[table-cell] single-tap tableId=${element.id} wasSelected=${wasSelectedAtTouchRef.current} view=${viewX},${viewY} window=${windowX},${windowY} computedHit=${JSON.stringify(hit)}`,
      );
      if (hit) {
        callbacksRef.current.onTableCellPress(element.id, hit);
      }
      return;
    }

    // Touch-down already added the element. Only a tap on an element that was selected
    // *before* this touch toggles it off, deferred so a double tap can open quick-edit instead.
    if (callbacksRef.current.multipleMode && wasSelectedAtTouchRef.current) {
      cancelPendingRemoveJS();
      pendingRemoveTimerRef.current = setTimeout(() => {
        pendingRemoveTimerRef.current = null;
        callbacksRef.current.onSelect(element.id, 'toggle');
      }, DOUBLE_TAP_MAX_GAP_MS);
    }
  },
  [element.id, element.type, triggerDoubleTapJS, cancelPendingRemoveJS, resolveTableCellHitJS],
  );

  const bodyDragGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(true)
      .minDistance(0)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .hitSlop(bodyHitSlop);

    if (deselectGesture) {
      pan.blocksExternalGesture(deselectGesture);
    }

    return pan
      .onBegin((_e) => {
        'worklet';
        runOnJS(noteTapAbsJS)(_e.absoluteX, _e.absoluteY);
        runOnJS(noteTapViewJS)(_e.x, _e.y);
        const tNow = Date.now();
        beginTimeSv.value = tNow;
        hasMovedSv.value = false;
        tapHandledSv.value = false;
        // Prime selection chrome and chrome bars on the UI thread before JS catches up.
        isInteracting.value = true;
        selectedSv.value = true;
        if (activeSelectedIdSv) {
          activeSelectedIdSv.value = element.id;
        }
        if (topBarSelectionVisibleSv) {
          topBarSelectionVisibleSv.value = 1;
        }
        if (bottomPanelVisibleSv) {
          bottomPanelVisibleSv.value = 1;
        }
        runOnJS(notifySelectJS)(element.id);
        if (element.type === 'table') {
          runOnJS(highlightTableCellJS)(_e.x, _e.y, _e.absoluteX, _e.absoluteY);
        }
        originLeftSv.value = originLeftSv.value + transX.value;
        originTopSv.value = originTopSv.value + transY.value;
        transX.value = 0;
        transY.value = 0;
        if (liveBounds) {
          liveBounds.leftMm.value = originLeftSv.value / sxSv.value;
          liveBounds.topMm.value = originTopSv.value / sySv.value;
          liveBounds.widthMm.value = animW.value / sxSv.value;
          liveBounds.heightMm.value = animH.value / sySv.value;
          liveBounds.visible.value = true;
        }
      })
      .onStart((_e) => {
        'worklet';
      })
      .onUpdate((e) => {
        'worklet';
        const distSq = e.translationX * e.translationX + e.translationY * e.translationY;
        if (!hasMovedSv.value) {
          if (element.lockMovement) {
            return;
          }
          if (distSq < DRAG_ACTIVATE_DIST_SQ_PX) {
            // Under 10px: stationary touch noise / tap intent — don't start dragging.
            return;
          }
          hasMovedSv.value = true;
          liftSv.value = DRAG_LIFT_OPACITY;
          runOnJS(cancelPendingRemoveJS)();

          if (
            groupEligibleSv &&
            groupEligibleSv.value === 1 &&
            groupAnchorIdSv &&
            groupDeltaLeftMm &&
            groupDeltaTopMm
          ) {
            groupAnchorIdSv.value = element.id;
            anchorStartLeftMmSv.value = originLeftSv.value / sxSv.value;
            anchorStartTopMmSv.value = originTopSv.value / sySv.value;
            groupDeltaLeftMm.value = 0;
            groupDeltaTopMm.value = 0;
            if (groupScaleXSv) groupScaleXSv.value = 1;
            if (groupScaleYSv) groupScaleYSv.value = 1;
          }

          runOnJS(notifyTransformStartJS)(element.id, 'move');
        }

        if (element.lockMovement) {
          return;
        }

        const z = padZoomSv.value > 0 ? padZoomSv.value : 1;
        const dx = e.translationX / z;
        const dy = e.translationY / z;

        const curLeftMm = (originLeftSv.value + dx) / sxSv.value;
        const curTopMm = (originTopSv.value + dy) / sySv.value;
        const curWMm = animW.value / sxSv.value;
        const curHMm = animH.value / sySv.value;

        const placed =
          safeModeSv && safeModeSv.value > 0.5
            ? { left: curLeftMm, top: curTopMm, width: curWMm, height: curHMm }
            : clampToLabelBounds(
                { left: curLeftMm, top: curTopMm, width: curWMm, height: curHMm },
                { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
                { anchor: 'body' },
              );

        const targetLeftPx = placed.left * sxSv.value;
        const targetTopPx = placed.top * sySv.value;

        transX.value = targetLeftPx - originLeftSv.value;
        transY.value = targetTopPx - originTopSv.value;

        if (liveBounds) {
          liveBounds.leftMm.value = placed.left;
          liveBounds.topMm.value = placed.top;
          liveBounds.widthMm.value = placed.width;
          liveBounds.heightMm.value = placed.height;
          liveBounds.visible.value = true;
        }

        if (
          groupAnchorIdSv &&
          groupAnchorIdSv.value === element.id &&
          groupDeltaLeftMm &&
          groupDeltaTopMm
        ) {
          groupDeltaLeftMm.value = placed.left - anchorStartLeftMmSv.value;
          groupDeltaTopMm.value = placed.top - anchorStartTopMmSv.value;
        }

        runOnJS(logLiveBoxJS)(placed.left, placed.top, placed.width, placed.height);
      })
      .onEnd((e) => {
        'worklet';
        liftSv.value = 1;
        // A real move (past the 10px noise gate) keeps its position.
        // Treating short corner seats as taps snapped them back.
        const isTap = !hasMovedSv.value || element.lockMovement;

        if (isTap) {
          tapHandledSv.value = true;
          transX.value = 0;
          transY.value = 0;
          isInteracting.value = false;

          if (
            groupAnchorIdSv &&
            groupAnchorIdSv.value === element.id &&
            groupDeltaLeftMm &&
            groupDeltaTopMm
          ) {
            groupAnchorIdSv.value = '';
            groupDeltaLeftMm.value = 0;
            groupDeltaTopMm.value = 0;
          }

          const tNow = Date.now();
          const deltaSinceLastTap = tNow - lastTapTimeSv.value;
          const dxTap = e.absoluteX - lastTapXSv.value;
          const dyTap = e.absoluteY - lastTapYSv.value;
          const distKnown = Number.isFinite(dxTap) && Number.isFinite(dyTap);
          const nearLastTap =
            !distKnown ||
            dxTap * dxTap + dyTap * dyTap <=
              DOUBLE_TAP_MAX_DIST_PX * DOUBLE_TAP_MAX_DIST_PX;

          if (
            deltaSinceLastTap > DOUBLE_TAP_MIN_GAP_MS &&
            deltaSinceLastTap < DOUBLE_TAP_MAX_GAP_MS &&
            nearLastTap
          ) {
            // Confirmed double tap on UI thread
            lastTapTimeSv.value = 0;
            runOnJS(noteTapViewJS)(e.x, e.y);
            runOnJS(noteTapAbsJS)(e.absoluteX, e.absoluteY);
            runOnJS(triggerDoubleTapJS)(e.x, e.y, e.absoluteX, e.absoluteY);
          } else {
            // First tap
            lastTapTimeSv.value = tNow;
            lastTapXSv.value = e.absoluteX;
            lastTapYSv.value = e.absoluteY;
            runOnJS(noteTapViewJS)(e.x, e.y);
            runOnJS(noteTapAbsJS)(e.absoluteX, e.absoluteY);
            runOnJS(triggerSingleTapJS)(e.x, e.y, e.absoluteX, e.absoluteY);
          }
        } else {
          originLeftSv.value = originLeftSv.value + transX.value;
          originTopSv.value = originTopSv.value + transY.value;
          transX.value = 0;
          transY.value = 0;

          let commitLeftPx = originLeftSv.value;
          let commitTopPx = originTopSv.value;
          if (safeModeSv && safeModeSv.value > 0.5) {
            const leftMm = originLeftSv.value / sxSv.value;
            const topMm = originTopSv.value / sySv.value;
            const inside = fullyInsideLabelMm(
              leftMm,
              topMm,
              animW.value / sxSv.value,
              animH.value / sySv.value,
              canvasWMmSv.value,
              canvasHMmSv.value,
            );
            commitLeftPx = inside.left * sxSv.value;
            commitTopPx = inside.top * sySv.value;
            const bounce =
              Math.abs(commitLeftPx - originLeftSv.value) > 0.5 ||
              Math.abs(commitTopPx - originTopSv.value) > 0.5;
            if (
              groupAnchorIdSv &&
              groupAnchorIdSv.value === element.id &&
              groupDeltaLeftMm &&
              groupDeltaTopMm
            ) {
              groupDeltaLeftMm.value = inside.left - anchorStartLeftMmSv.value;
              groupDeltaTopMm.value = inside.top - anchorStartTopMmSv.value;
            }
            if (liveBounds && bounce) {
              liveBounds.leftMm.value = withSpring(inside.left, SAFE_MODE_SPRING);
              liveBounds.topMm.value = withSpring(inside.top, SAFE_MODE_SPRING);
            }
            if (bounce) {
              originLeftSv.value = withSpring(commitLeftPx, SAFE_MODE_SPRING);
              originTopSv.value = withSpring(commitTopPx, SAFE_MODE_SPRING, (finished) => {
                if (finished) {
                  runOnJS(commitDragFromPointer)(0, 0, commitLeftPx, commitTopPx);
                }
              });
              return;
            }
          }

          runOnJS(commitDragFromPointer)(
            e.absoluteX,
            e.absoluteY,
            commitLeftPx,
            commitTopPx,
          );
        }
      })
      .onFinalize((_e, success) => {
        'worklet';
        if (!hasMovedSv.value) {
          isInteracting.value = false;
        }
        liftSv.value = 1;
        transX.value = 0;
        transY.value = 0;

        // If onEnd did not run (e.g. pan failed because touch ended before drag threshold),
        // but the finger did not drag, this was a stationary tap! Process it here!
        if (!tapHandledSv.value && !hasMovedSv.value) {
          tapHandledSv.value = true;

          if (
            groupAnchorIdSv &&
            groupAnchorIdSv.value === element.id &&
            groupDeltaLeftMm &&
            groupDeltaTopMm
          ) {
            groupAnchorIdSv.value = '';
            groupDeltaLeftMm.value = 0;
            groupDeltaTopMm.value = 0;
          }

          const tNow = Date.now();
          const deltaSinceLastTap = tNow - lastTapTimeSv.value;
          // This fallback can run without an event, so NaN marks the position
          // unknown and the distance gate is skipped rather than compared to 0,0.
          const tapX = _e ? _e.absoluteX : NaN;
          const tapY = _e ? _e.absoluteY : NaN;
          const dxTap = tapX - lastTapXSv.value;
          const dyTap = tapY - lastTapYSv.value;
          const distKnown = Number.isFinite(dxTap) && Number.isFinite(dyTap);
          const nearLastTap =
            !distKnown ||
            dxTap * dxTap + dyTap * dyTap <=
              DOUBLE_TAP_MAX_DIST_PX * DOUBLE_TAP_MAX_DIST_PX;

          if (
            deltaSinceLastTap > DOUBLE_TAP_MIN_GAP_MS &&
            deltaSinceLastTap < DOUBLE_TAP_MAX_GAP_MS &&
            nearLastTap
          ) {
            lastTapTimeSv.value = 0;
            if (_e) {
              runOnJS(noteTapViewJS)(_e.x, _e.y);
              runOnJS(noteTapAbsJS)(_e.absoluteX, _e.absoluteY);
              runOnJS(triggerDoubleTapJS)(_e.x, _e.y, _e.absoluteX, _e.absoluteY);
            } else {
              runOnJS(triggerDoubleTapJS)();
            }
          } else {
            lastTapTimeSv.value = tNow;
            lastTapXSv.value = tapX;
            lastTapYSv.value = tapY;
            if (_e) {
              runOnJS(noteTapViewJS)(_e.x, _e.y);
              runOnJS(noteTapAbsJS)(_e.absoluteX, _e.absoluteY);
              runOnJS(triggerSingleTapJS)(_e.x, _e.y, _e.absoluteX, _e.absoluteY);
            } else {
              runOnJS(triggerSingleTapJS)();
            }
          }
        }
      });
  }, [
    element.lockMovement,
    bodyHitSlop,
    deselectGesture,
    commitDragFromPointer,
    element.id,
    originLeftSv,
    originTopSv,
    transX,
    transY,
    animW,
    animH,
    isInteracting,
    liftSv,
    selectedSv,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    padZoomSv,
    canvasWMmSv,
    canvasHMmSv,
    sxSv,
    sySv,
    liveBounds,
    hasMovedSv,
    beginTimeSv,
    lastTapTimeSv,
    lastTapXSv,
    lastTapYSv,
    tapHandledSv,
    notifyTransformStartJS,
    notifySelectJS,
    highlightTableCellJS,
    noteTapAbsJS,
    noteTapViewJS,
    activeSelectedIdSv,
    groupEligibleSv,
    groupAnchorIdSv,
    groupDeltaLeftMm,
    groupDeltaTopMm,
    groupScaleXSv,
    groupScaleYSv,
    anchorStartLeftMmSv,
    anchorStartTopMmSv,
    triggerDoubleTapJS,
    triggerSingleTapJS,
    safeModeSv,
    cancelPendingRemoveJS,
    logLiveBoxJS,
  ]);

  const createHandleGesture = useCallback(
    (handle: HandlePosition, behavior: ResizeBehavior) => {
      const handlePan = Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false);

      if (deselectGesture) {
        handlePan.blocksExternalGesture(bodyDragGesture, deselectGesture);
      } else {
        handlePan.blocksExternalGesture(bodyDragGesture);
      }

      return handlePan
        .onStart((_e) => {
          'worklet';
          isInteracting.value = true;
          originLeftSv.value = originLeftSv.value + transX.value;
          originTopSv.value = originTopSv.value + transY.value;
          transX.value = 0;
          transY.value = 0;
          startW.value = animW.value;
          startH.value = animH.value;
          startTX.value = 0;
          startTY.value = 0;
          startRot.value = animRot.value;
          runOnJS(captureResizeStartFromPx)(
            originLeftSv.value,
            originTopSv.value,
            startW.value,
            startH.value,
          );
          runOnJS(notifyTransformStartJS)(element.id, 'resize');
          // Flip live reflow on the UI thread only — height table was prefetched on select.
          if (wrapTextOnWidthSv.value && handle === 'e') {
            liveNativeHeightSv.value = 0;
            textLiveSv.value = true;
          }
          if (
            groupEligibleSv &&
            groupEligibleSv.value === 1 &&
            groupAnchorIdSv &&
            groupScaleXSv &&
            groupScaleYSv
          ) {
            groupAnchorIdSv.value = element.id;
            groupScaleXSv.value = 1;
            groupScaleYSv.value = 1;
            if (groupHandleSv) groupHandleSv.value = handle === 's' ? 1 : 0;
            if (groupDeltaLeftMm) groupDeltaLeftMm.value = 0;
            if (groupDeltaTopMm) groupDeltaTopMm.value = 0;
            runOnJS(notifyGroupResizeHandleBeginJS)(handle);
          }
        })
        .onUpdate((e) => {
          'worklet';
          const z = padZoomSv.value > 0 ? padZoomSv.value : 1;
          const rad = (startRot.value * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const rawDx = e.translationX / z;
          const rawDy = e.translationY / z;
          const dx = rawDx * cos + rawDy * sin;
          const dy = -rawDx * sin + rawDy * cos;

          const originW = Math.max(1, startW.value);
          const originH = Math.max(1, startH.value);
          let scaleX = 1;
          let scaleY = 1;
          if (handle === 'e') {
            scaleX = (originW + dx) / originW;
            if (behavior === 'square' || behavior === 'aspect') {
              scaleY = scaleX;
            }
          } else {
            scaleY = (originH + dy) / originH;
            if (behavior === 'square' || behavior === 'aspect') {
              scaleX = scaleY;
            }
          }

          if (
            groupEligibleSv &&
            groupEligibleSv.value === 1 &&
            groupAnchorIdSv &&
            groupAnchorIdSv.value === element.id &&
            groupScaleXSv &&
            groupScaleYSv &&
            groupScaleMinSv &&
            groupScaleMaxSv
          ) {
            const driving = handle === 'e' ? scaleX : scaleY;
            const capped = Math.min(
              Math.max(driving, groupScaleMinSv.value),
              groupScaleMaxSv.value,
            );
            if (handle === 'e') {
              scaleX = capped;
              scaleY = behavior === 'square' || behavior === 'aspect' ? capped : 1;
            } else {
              scaleY = capped;
              scaleX = behavior === 'square' || behavior === 'aspect' ? capped : 1;
            }
            groupScaleXSv.value = scaleX;
            groupScaleYSv.value = scaleY;
            if (groupHandleSv) groupHandleSv.value = handle === 's' ? 1 : 0;
          }

          const startWMm = originW / sxSv.value;
          const startHMm = originH / sySv.value;

          const box = resizeMemberByScale({
            start: {
              left: originLeftSv.value / sxSv.value,
              top: originTopSv.value / sySv.value,
              width: startWMm,
              height: startHMm,
            },
            handle,
            behavior,
            scaleX,
            scaleY,
            aspect: aspectSv.value > 0 ? aspectSv.value : 1,
            minMm: minResizeMmSv.value,
            canvas: { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
            rotation: startRot.value,
          });

          let liveHeightMm = box.height;
          if (wrapTextOnWidthSv.value && handle === 'e') {
            let wrapH: number;
            if (liveHeightReadySv.value) {
              const starts = liveHeightStartsSv.value;
              let idx = 0;
              for (let i = 0; i < starts.length; i += 1) {
                if (starts[i] <= box.width + 0.0001) idx = i;
                else break;
              }
              wrapH = liveHeightValuesSv.value[idx] ?? liveHeightValuesSv.value[0];
            } else {
              wrapH = computeTextElementHeightMm({
                text: textContentSv.value,
                fontSize: textFontSizeSv.value,
                widthMm: Math.max(0.5, box.width),
                autoWrapping: autoWrappingSv.value,
                lineSpacing: lineSpacingSv.value,
                charSpacing: charSpacingSv.value,
                bold: boldSv.value,
                verticalDisplay: verticalDisplaySv.value,
                fontFamily: fontFamilySv.value || undefined,
              });
            }
            const nativeHMm = liveNativeHeightSv.value / Math.max(0.0001, sySv.value);
            if (nativeHMm > wrapH) wrapH = nativeHMm;
            // Not capped at the label's bottom edge: the canvas clips, the frame keeps every line.
            liveHeightMm = wrapH;
          }
          animW.value = Math.max(1, box.width * sxSv.value);
          animH.value = Math.max(1, liveHeightMm * sySv.value);
          // The box rotates about its centre, so growing it moves the unrotated
          // top-left. Shift it so the top-left corner stays put on screen.
          const halfDw = (animW.value - originW) / 2;
          const halfDh = (animH.value - originH) / 2;
          const shiftX = halfDw * cos - halfDh * sin - halfDw;
          const shiftY = halfDw * sin + halfDh * cos - halfDh;
          transX.value = shiftX;
          transY.value = shiftY;

          if (liveBounds) {
            liveBounds.leftMm.value = box.left + shiftX / sxSv.value;
            liveBounds.topMm.value = box.top + shiftY / sySv.value;
            liveBounds.widthMm.value = box.width;
            liveBounds.heightMm.value = liveHeightMm;
            liveBounds.visible.value = true;
          }

          const nowMs = Date.now();
          if (nowMs - lastLiveLogTickSv.value > 200) {
            lastLiveLogTickSv.value = nowMs;
            runOnJS(logLiveBoxJS)(box.left, box.top, box.width, box.height);
          }
        })
        .onEnd(() => {
          'worklet';
          if (wrapTextOnWidthSv.value && handle === 'e') {
            runOnJS(releaseTextLiveJS)();
          }
          runOnJS(dispatchResizeCommit)(handle, animW.value, animH.value, animRot.value);
        })
        .onFinalize(() => {
          'worklet';
          if (wrapTextOnWidthSv.value && handle === 'e') {
            runOnJS(releaseTextLiveJS)();
          }
        });
    },
    [
      liveHeightReadySv,
      liveHeightStartsSv,
      liveHeightValuesSv,
      liveNativeHeightSv,
      lastLiveLogTickSv,
      deselectGesture,
      originLeftSv,
      originTopSv,
      animW,
      animH,
      animRot,
      releaseTextLiveJS,
      textLiveSv,
      transX,
      transY,
      startW,
      startH,
      startTX,
      startTY,
      startRot,
      isInteracting,
      element.id,
      dispatchResizeCommit,
      captureResizeStartFromPx,
      notifyTransformStartJS,
      notifyGroupResizeHandleBeginJS,
      groupEligibleSv,
      groupAnchorIdSv,
      groupScaleXSv,
      groupScaleYSv,
      groupHandleSv,
      groupScaleMinSv,
      groupScaleMaxSv,
      groupDeltaLeftMm,
      groupDeltaTopMm,
      bodyDragGesture,
      padZoomSv,
      canvasWMmSv,
      canvasHMmSv,
      sxSv,
      sySv,
      minResizeMmSv,
      aspectSv,
      isAutoTextSv,
      wrapTextOnWidthSv,
      textContentSv,
      textFontSizeSv,
      autoWrappingSv,
      lineSpacingSv,
      charSpacingSv,
      boldSv,
      verticalDisplaySv,
      fontFamilySv,
      liveBounds,
      logLiveBoxJS,
    ],
  );

  const handleGestures = useMemo(() => {
    const map: Partial<Record<HandlePosition, ReturnType<typeof createHandleGesture>>> = {};
    for (const anchor of resizePolicy.anchors) {
      const b = resizePolicy.behavior[anchor];
      if (b) map[anchor] = createHandleGesture(anchor, b);
    }
    return map;
  }, [createHandleGesture, resizePolicy]);

  const containerStyle = useAnimatedStyle(() => {
    const liveW = Math.max(1, animW.value);
    const liveH = Math.max(1, animH.value);
    const liveLeft = originLeftSv.value + transX.value;
    const liveTop = originTopSv.value + transY.value;
    const isPrimaryTouch = activeSelectedIdSv?.value === element.id;
    const zBoost = isPrimaryTouch ? 100 : selectedSv.value ? 50 : 0;

    return {
      position: 'absolute' as const,
      left: liveLeft,
      top: liveTop,
      width: liveW,
      height: liveH,
      overflow: 'visible' as const,
      opacity: (element.opacity ?? 1) * liftSv.value,
      zIndex: zBoost + (element.zIndex ?? 1),
      // Whole box turns, so the outline and handles follow the content.
      transform: [{ rotate: `${animRot.value}deg` }],
    };
  });

  // Match pre-cb5cf2e QR/barcode: fill the live box. Transform-scaling the
  // inner SVG is what made modules flicker while dragging.
  // Line emoji fills its box from the SVG viewBox. Scaling a snapshot of it
  // keeps the stroke at the start size, so the margin inside the frame grows
  // as the box grows. The frame's own width/height is the size instead.
  const lineEmojiFrame =
    element.type === 'clipart' && element.clipartId.startsWith('le-') && element.tile !== true;
  const liveScaleContent =
    !lineEmojiFrame &&
    element.type !== 'border' &&
    element.type !== 'barcode' &&
    element.type !== 'qrcode' &&
    element.type !== 'text' &&
    element.type !== 'degrees' &&
    element.type !== 'time';

  // The glyph is laid out at this size. The scale must use the same number in
  // the same frame: startW stays at the gesture-start size until the commit
  // effect, so a line-art emoji already redrawn at the final size was scaled
  // again and flickered before it settled.
  const layoutW = Math.max(1, baseWidthPx);
  const layoutH = Math.max(1, baseHeightPx);
  const layoutWSv = useSharedValue(layoutW);
  const layoutHSv = useSharedValue(layoutH);
  layoutWSv.value = layoutW;
  layoutHSv.value = layoutH;

  const contentRotateStyle = useAnimatedStyle(() => {
    if (!liveScaleContent) {
      return {
        width: '100%' as const,
        height: '100%' as const,
      };
    }
    const liveW = Math.max(1, animW.value);
    const liveH = Math.max(1, animH.value);
    const baseW = Math.max(1, layoutWSv.value);
    const baseH = Math.max(1, layoutHSv.value);
    // Transform only — never animate layout width/height. Resizing layout
    // forces barcode/QR SVG to re-rasterize every frame (flicker).
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      transformOrigin: 'top left' as const,
      transform: [{ scaleX: liveW / baseW }, { scaleY: liveH / baseH }],
    };
  });

  // Always call this hook. Borders and hidden elements return before the
  // selection frame is drawn; skipping the hook here changes the hook count and crashes.
  const selectionOverlayStyle = useAnimatedStyle(() => {
    // In Multiple mode every selected member keeps its frame; keying on the touched id
    // hid the others until React caught up with the new group size (blink on add).
    const multiGroup = multipleModeSv.value || groupEligibleSv?.value === 1;
    const touchId = activeSelectedIdSv?.value ?? '';
    const showChrome = multiGroup
      ? selectedSv.value
      : touchId.length > 0
        ? touchId === element.id
        : selectedSv.value;
    return {
      opacity: showChrome ? 1 : 0,
      pointerEvents: (showChrome ? 'box-none' : 'none') as 'box-none' | 'none',
    };
  });

  // Borders are not canvas-selectable (clicks pass through). Edit via the Border tool in the menu.
  if (element.type === 'border' || element.needPrinting === false) {
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: baseLeftPx,
          top: baseTopPx,
          width: baseWidthPx,
          height: baseHeightPx,
          zIndex: 0,
          transform: [{ rotate: `${baseRotation}deg` }],
          opacity: element.opacity ?? 1,
        }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <ElementContentView
            element={element}
            widthPx={baseWidthPx}
            heightPx={baseHeightPx}
            scale={pxPerMMSafe}
            mediaShape={borderMediaShape}
            selectedTableCell={element.type === 'table' ? selectedTableCell : null}
            tableSelectionColor={tableSelectionColor}
          />
        </View>
        {element.type === 'border' && selected ? (
          <View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: selectionColor || '#48C3C7', // theme-fixed: canvas selection chrome
            }}
          />
        ) : null}
      </View>
    );
  }

  if (hidden) return null;

  const borderStrokeColor = selectionColor || CHROME_SELECTION_STROKE;

  return (
    <Animated.View ref={containerRef} style={containerStyle} collapsable={false}>
      <GestureDetector gesture={bodyDragGesture}>
        <View
          collapsable={false}
          style={styles.fillContainer}
          {...(Platform.OS === 'web'
            ? {
                onClick: (e: any) => {
                  e?.stopPropagation?.();
                  const ne = e?.nativeEvent;
                  triggerSingleTapJS(ne?.locationX, ne?.locationY, ne?.pageX, ne?.pageY);
                },
                onDoubleClick: (e: any) => {
                  e?.stopPropagation?.();
                  const ne = e?.nativeEvent;
                  triggerDoubleTapJS(ne?.locationX, ne?.locationY, ne?.pageX, ne?.pageY);
                },
              }
            : {})}>
          <Animated.View
            pointerEvents="none"
            collapsable={false}
            renderToHardwareTextureAndroid={liveScaleContent}
            style={contentRotateStyle}>
            {liveScaleContent ? (
              <View
                collapsable={false}
                style={{
                  width: baseWidthPx,
                  height: baseHeightPx,
                  overflow: isTextElement ? 'visible' : 'hidden',
                }}>
                <ElementContentView
                  element={element}
                  widthPx={baseWidthPx}
                  heightPx={baseHeightPx}
                  scale={pxPerMMSafe}
                  mediaShape={borderMediaShape}
                  selectedTableCell={element.type === 'table' ? selectedTableCell : null}
                  tableSelectionColor={tableSelectionColor}
                />
              </View>
            ) : (
              <ElementContentView
                element={element}
                widthPx={baseWidthPx}
                heightPx={baseHeightPx}
                scale={pxPerMMSafe}
                mediaShape={borderMediaShape}
                selectedTableCell={null}
                tableSelectionColor={tableSelectionColor}
                liveReflowSv={isTextElement ? textLiveSv : undefined}
                liveWidthSv={isTextElement ? animW : undefined}
                liveHeightSv={isTextElement ? liveNativeHeightSv : undefined}
                frameWidth={lineEmojiFrame ? animW : undefined}
                frameHeight={lineEmojiFrame ? animH : undefined}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      <Animated.View
        style={[StyleSheet.absoluteFill, selectionOverlayStyle]}>
        <View
          pointerEvents="none"
          style={[
            styles.selectionOutline,
            { borderColor: borderStrokeColor },
          ]}
        />

        {element.lockMovement ? null : (
          <>
            {handleGestures.e ? (
              <EdgeResizeHandle position="e" gesture={handleGestures.e} viewScaleSv={padZoomSv} />
            ) : null}
            {handleGestures.s ? (
              <EdgeResizeHandle position="s" gesture={handleGestures.s} viewScaleSv={padZoomSv} />
            ) : null}
          </>
        )}

        {element.lockMovement ? (
          <View pointerEvents="none" style={styles.lockBadge}>
            <AppIcon name="lock.fill" tintColor="#FFFFFF" size={9} /* theme-fixed: lock badge */ />
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}, (prev, next) => {
  // Cell selection is value-identity, not reference-identity: chrome rebuilds the
  // {row,col} object on every pass, so a reference check would force needless renders
  // while omitting it entirely would freeze the highlight on its last painted cell.
  if (!sameTableCellSelection(prev.selectedTableCell, next.selectedTableCell)) return false;
  return (
    prev.tableSelectionColor === next.tableSelectionColor &&
    prev.onTableCellPress === next.onTableCellPress &&
    prev.onTableCellQuickEdit === next.onTableCellQuickEdit &&
    prev.element === next.element &&
    prev.selected === next.selected &&
    prev.pxPerMM === next.pxPerMM &&
    prev.padZoom === next.padZoom &&
    prev.selectionColor === next.selectionColor &&
    prev.canvasWidthMm === next.canvasWidthMm &&
    prev.canvasHeightMm === next.canvasHeightMm &&
    prev.mediaShape === next.mediaShape &&
    prev.liveBounds === next.liveBounds &&
    prev.deselectGesture === next.deselectGesture &&
    prev.activeSelectedIdSv === next.activeSelectedIdSv &&
    prev.topBarSelectionVisibleSv === next.topBarSelectionVisibleSv &&
    prev.bottomPanelVisibleSv === next.bottomPanelVisibleSv &&
    prev.multipleMode === next.multipleMode &&
    prev.groupEligibleSv === next.groupEligibleSv &&
    prev.groupAnchorIdSv === next.groupAnchorIdSv &&
    prev.groupDeltaLeftMm === next.groupDeltaLeftMm &&
    prev.groupDeltaTopMm === next.groupDeltaTopMm &&
    prev.groupScaleXSv === next.groupScaleXSv &&
    prev.groupScaleYSv === next.groupScaleYSv &&
    prev.groupHandleSv === next.groupHandleSv &&
    prev.groupScaleMinSv === next.groupScaleMinSv &&
    prev.groupScaleMaxSv === next.groupScaleMaxSv
  );
});

const EdgeResizeHandle = memo(function EdgeResizeHandle({
  position,
  gesture,
  viewScaleSv,
}: {
  position: HandlePosition;
  gesture: ReturnType<typeof Gesture.Pan>;
  /** Artboard zoom (pinch × fit). Handles counter-scale so they stay screen-constant. */
  viewScaleSv: SharedValue<number>;
}) {
  useThemeRefresh();
  const counterScaleStyle = useAnimatedStyle(() => {
    const z = viewScaleSv.value > 0.05 ? viewScaleSv.value : 1;
    return { transform: [{ scale: 1 / z }] };
  });
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        style={[
          styles.handleCircle,
          position === 'e' ? styles.handleE : styles.handleS,
          counterScaleStyle,
        ]}>
        <View pointerEvents="none">
          {position === 'e' ? (
            <Svg width={CHROME_HANDLE_ICON_SIZE} height={CHROME_HANDLE_ICON_SIZE} viewBox="-10 -10 20 20">
              <SvgPath
                d="M -3 -5 L -8.5 0 L -3 5 L -3 1.5 L 3 1.5 L 3 5 L 8.5 0 L 3 -5 L 3 -1.5 L -3 -1.5 Z"
                fill="#FFFFFF" // theme-fixed: handle icon
              />
            </Svg>
          ) : (
            <Svg width={CHROME_HANDLE_ICON_SIZE} height={CHROME_HANDLE_ICON_SIZE} viewBox="-10 -10 20 20">
              <SvgPath
                d="M -5 -3 L 0 -8.5 L 5 -3 L 1.5 -3 L 1.5 3 L 5 3 L 0 8.5 L -5 3 L -1.5 3 L -1.5 -3 Z"
                fill="#FFFFFF" // theme-fixed: handle icon
              />
            </Svg>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = themedStyles((c) => ({
  fillContainer: {
    width: '100%',
    height: '100%',
    overflow: 'visible',
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: CHROME_SELECTION_STROKE,
  },
  handleCircle: {
    position: 'absolute',
    width: CHROME_HANDLE_SIZE_PX,
    height: CHROME_HANDLE_SIZE_PX,
    borderRadius: CHROME_HANDLE_RADIUS_PX,
    backgroundColor: CHROME_HANDLE_FILL,
    opacity: 0.75, // slightly see-through so the content under the handle stays visible
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
    elevation: 2,
  },
  // Handles are centred on the box edge line (half in, half out); slightly transparent.
  handleS: {
    bottom: -CHROME_HANDLE_RADIUS_PX,
    left: '50%',
    marginLeft: -CHROME_HANDLE_RADIUS_PX,
  },
  handleE: {
    top: '50%',
    right: -CHROME_HANDLE_RADIUS_PX,
    marginTop: -CHROME_HANDLE_RADIUS_PX,
  },
  lockBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.7)', // theme-fixed: light preview (lockBadge)
    borderRadius: 8,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
