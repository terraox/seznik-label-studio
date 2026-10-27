import { goBack } from '@/lib/go-back';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { PrintRulerIcon, SafeModeIcon } from '@/components/editor/chrome-icons';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppState,
  ActivityIndicator,
  InteractionManager,
  LayoutAnimation,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  Vibration,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { TextInput } from '@/components/ui/text-input';
import ViewShot from 'react-native-view-shot';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { IosAlertModal, IosAlertInput } from '@/components/ui/ios-alert-modal';
import { WalkthroughOverlay } from '@/components/walkthrough/walkthrough-overlay';
import { CANVAS_WALKTHROUGH } from '@/lib/walkthrough/canvas-steps';
import { registerWalkthroughTarget } from '@/lib/walkthrough/registry';
import { useWalkthroughStore } from '@/stores/walkthrough-store';

import {
  clampElementToLabel,
  fitBarcodeDefaults,
  scaleElementAboutCenter,
  fitClipartDefaults,
  fitLineDefaults,
  fitQrcodeDefaults,
  fitShapeDefaults,
  fitTableDefaults,
  fitTextDefaults,
  fitNewTextDefaults,
  fitTextBoxToContent,
  fitCounterDefaults,
  fitTimeDefaults,
  mergeTextElementPatch,
  growTextFrameHeightForWidth,
  NEW_TEXT_PLACEHOLDER,
  textBlockHeightMm,
  normalizeDocumentElements,
  scaleDocumentToSize,
} from '@/lib/element-sizing';
import { borderBoxForCenterGap, defaultBorderPlacement } from '@/lib/border-geometry';
import {
  acrossLayout,
  applyAcrossBorder,
  hasAnyBorder,
  removeAcrossBorders,
  type BorderScope,
  type BorderStyleInput,
} from '@/lib/across';
import { visibleTextHeightMm } from '@/lib/visible-text-layout';
import { labelOverlapRegionsMm, overlapBannerPositionsPx } from '@/lib/editor/safe-mode';
import { clampToLabelBounds, fitFontSizeToLabel } from '@/lib/editor/label-bounds';
import { GridSpacingPopover } from '@/components/editor/grid-spacing-popover';
import { requestEditorGridToggle } from '@/lib/editor/editor-grid-toggle';
import {
  aspectRatioOf,
  resizeMemberByScale,
  resizePolicyFor,
  sharedScaleLimits,
  type MmBox,
  type ScaleCapMember,
} from '@/lib/editor/resize-policy';
import {
  BULK_LABEL_NAV_HEIGHT_PX,
  BULK_PANEL_DEFAULT_HEIGHT_PX,
  SPLIT_GAP_PX,
  NUDGE_PAD_SPLIT_EXTRA_PX,
  PANEL_DEFAULT_HEIGHT_PX,
  PANEL_MIN_HEIGHT_PX,
  SPLIT_ANIMATION_MS,
  clampStoredSplitRatio,
  persistableSplitRatio,
  restoreCanvasSplitHeight,
  usableSplitViewportPx,
  type SplitReleaseResult,
} from '@/lib/editor/canvas-split';
import {
  EDITOR_WORKSPACE_PAD_BOTTOM_PX,
  editorViewTransform,
  snapThresholdMm,
  stepViewZoom,
  windowPointToMm,
  type EditorViewTransform,
} from '@/lib/editor/view-transform';
import { collectImageFileUris, placeImportedImageMm } from '@/lib/editor/image-ingest';
import { ingestEditorImage, sweepEditorImageFiles } from '@/lib/editor/image-ingest-native';
import {
  applySourceCropToElementMm,
  cropFormatFromUri,
  FULL_CROP,
  type NormalizedCrop,
} from '@/lib/editor/image-crop-math';
import {
  createDefaultTableCell,
  ensureTableCells,
  patchTableCellInElement,
  tableCellToEditorState,
  type SelectedTableCell,
} from '@/lib/editor/table-cells';
import {
  isPaletteDropOnArtboard,
  paletteDropTopLeftMm,
  paletteDropTypeForLabel,
} from '@/lib/editor/palette-drop';
import { formatDataSourceColumn } from '@/lib/editor/data-source-display';
import { applyPictureAdsorption } from '@/lib/editor/picture-adsorption';
import { chromeStrokeForFill, paletteGhostSizePx } from '@/lib/editor/canvas-chrome';
import { PaletteDragGhost } from '@/components/editor/palette-drag-ghost';
import { PaletteToolItem } from '@/components/editor/palette-tool-item';
import { ToolMenuIcon, TopToolbarIcon } from '@/components/editor/editor-menu-icons';
import { DegreesPropertyPanel } from '@/components/editor/degrees-property-panel';
import { ArcTextPropertyPanel } from '@/components/editor/arctext-property-panel';
import { BarcodePropertyPanel } from '@/components/editor/barcode-property-panel';
import { ImagePropertyPanel, type ImagePropertyTab } from '@/components/editor/image-property-panel';
import { ReferenceImagePanel } from '@/components/editor/reference-image-panel';
import {
  ClipartPropertyPanel,
  type ClipartPropertyTab,
} from '@/components/editor/clipart-property-panel';
import {
  SignaturePropertyPanel,
  type SignaturePropertyTab,
} from '@/components/editor/signature-property-panel';
import { ElementContentView } from '@/components/editor/element-renderer';
import { ZoomableEditPad } from '@/components/editor/zoomable-edit-pad';
import { EditingPad } from '@/components/editor/editing-pad';
import { KonvaCanvas } from '@/components/editor/konva-canvas';
import type {
  TransformCommitPayload,
  TransformMovePayload,
  SelectSource,
  TransformStartKind,
} from '@/components/editor/konva-transformer';
import { CanvasPanelDivider } from '@/components/editor/canvas-panel-divider';
import { StaticToolPalette } from '@/components/editor/static-tool-palette';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const smoothEasing = Easing.out(Easing.cubic);
import {
  ArtboardFrame,
  CATALOG_STOCK_LINER,
  EDITOR_ARTBOARD_COLOR,
  fitLabelCanvas,
  LABEL_PAD_STAGE_MIN_HEIGHT,
} from '@/components/label-preview';
import {
  HorizontalRuler,
  RULER_SIZE,
  RulerCorner,
  VerticalRuler,
  type LiveRulerBounds,
} from '@/components/canvas-rulers';
import { ResizeSizeHud } from '@/components/editor/resize-size-hud';
import { LabelSettingsMenu } from '@/components/editor/more-menu';
import { LabelSizeDialog } from '@/components/label-size-dialog';
import { BorderPropertyPanel } from '@/components/editor/border-property-panel';
import { LinePropertyPanel } from '@/components/editor/line-property-panel';
import { QrcodePropertyPanel } from '@/components/editor/qrcode-property-panel';
import { ShapePropertyPanel } from '@/components/editor/shape-property-panel';
import { TablePropertyPanel } from '@/components/editor/table-property-panel';
import {
  SignatureDrawingBoard,
  type SignatureStroke,
} from '@/components/editor/signature-drawing-board';
import { TableSizePicker } from '@/components/editor/table-size-picker';
import { TextPropertyPanel } from '@/components/editor/text-property-panel';
import { TimePropertyPanel } from '@/components/editor/time-property-panel';
import { QuickValueModal } from '@/components/editor/quick-value-modal';
import { PositionLayerActionsProvider } from '@/components/editor/position-controls';
import {
  getQuickEditPatch,
  getQuickEditPlaceholder,
  getQuickEditTitle,
  isQuickEditableType,
  type ElementAnchorRect,
} from '@/lib/editor/quick-value';
import {
  alignGroupBounds,
  alignMembersToEachOther,
  distributeMembers,
  reduceMultipleModeToggle,
  reduceTapSelect,
  selectionFromIds,
  type MemberAlignKind,
} from '@/lib/editor/selection';
import {
  DEFAULT_ARCTEXT_STATE,
  DEFAULT_BARCODE_STATE,
  DEFAULT_DEGREES_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
  DEFAULT_TIME_STATE,
  createTableState,
  normalizeRotation,
  type ArcTextPropertyTab,
  type BarcodePropertyTab,
  type LinePropertyTab,
  type EditorElementState,
  type PropertyTab,
  type QrcodePropertyTab,
  type ShapePropertyTab,
  type TablePropertyTab,
  type TimePropertyTab,
} from '@/components/editor/types';
import { editorBridge, barcodeEncodeModeForScanType, isBorderRemoval, isQrScanType } from '@/constants/editor-bridge';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, Type } from '@/constants/ui';
import { resolveRowCopies } from '@/lib/bulk-row-copies';
import {
  applyGeometryToAllLabels,
  applyGeometryToThisLabel,
  geometryFromElements,
  hydrateBulkDocument,
  isBulkSlotId,
  projectBulkDocument,
  resolveBulkSheet,
  syncBulkFromProjectedElements,
} from '@/lib/bulk-labels';
import {
  applyUpsBatchMirror,
  createLabelDocument,
  elementSizeMm,
  generateId,
  mmToPt,
  parseOrientation,
  parsePaperType,
  switchUpsPanel,
  syncUpsActivePanel,
  type ElementType,
  type LabelDocument,
  type LabelElement,
  type LabelReferenceImage,
} from '@/lib/label-document';
import { isFontNameReady } from '@/lib/fonts/font-ready';
import { resolveLabelSettings } from '@/lib/label-settings';
import { BulkCopiesBar, BULK_COPIES_BAR_HEIGHT_PX } from '@/components/bulk-copies-bar';
import { BulkLabelNav } from '@/components/bulk-label-nav';
import { SerialEditorContext, type SerialEditorValue } from '@/components/editor/serial-context';
import { SerialBar, SERIAL_BAR_HEIGHT_PX } from '@/components/editor/serial-bar';
import { storedValuePatch } from '@/components/editor/serial-section';
import {
  collectSerialFields,
  isSerialActive,
  linkCandidates,
  resolveDocumentForIndex,
  serialMaps,
  serialBatchCount,
  describeSerialValues,
} from '@/lib/serial/resolve-document';
import { defaultSerialConfig, newSerialFieldId } from '@/lib/serial/legacy';
import { MAX_SERIAL_BATCH } from '@/lib/serial/types';
import { useSerialContinueStore } from '@/stores/serial-continue-store';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { useExcelImportFlow } from '@/lib/use-excel-import-flow';
import { stageImportedFile } from '@/lib/user-files/stage-import';
import { useDataStore } from '@/stores/data-store';
import { useInstalledFontStore } from '@/stores/installed-font-store';
import { CANVAS_BOTTOM_CHIP_CLEARANCE_PX, EDITOR_STAGE_MARGIN_PX, clampLabelMm, containFitImageOnLabel, fitEditorPadBoard } from '@/lib/label-geometry';
import { applyDocumentStockSize, type StockSizeHandling } from '@/lib/stock-size';
import { sortLayers } from '@/lib/template-schema';
import { useTranslation } from '@/lib/i18n';
import { editorFallbackViewportPx, ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';
import {
  isJewelryDieCutDocument,
  JEWELRY_DIECUT,
} from '@/constants/jewelry-diecut';
import { canonicalizeJewelryDieCutDocument } from '@/constants/jewelry-template-elements';
import { isRatTail143Document, refitRatTail143Document } from '@/constants/rat-tail-143';
import { hasStockSilhouette } from '@/lib/stock-silhouette';
import { isRatTailGeometry, ratTailBodyRectMm } from '@/lib/media-geometry';
import { useLabelStore } from '@/stores/label-store';
import {
  DEFAULT_EDITOR_SETTINGS,
  EDITOR_BORDER_SELECTION_COLORS,
  EDITOR_TABLE_SELECTION_COLORS,
  useSettingsStore,
} from '@/stores/settings-store';
import {
  EditorHistory,
  alignBox,
  boxOf,
  clipboardHasContent,
  copyElementsToClipboard,
  duplicateElements,
  guidesEqual,
  isEditorVisible,
  nudgeBox,
  pasteElementsFromClipboard,
  reorderElements,
  sanitizeTransform,
  snapBoxToGuides,
  type SnapGuide,
} from '@/lib/editor/engine';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type IconName = AppIconName;

const TOOL_ROWS: { icon: IconName; label: string }[][] = [
  [
    { icon: 'textformat', label: 'Text' },
    { icon: 'barcode', label: 'Barcode' },
    { icon: 'qrcode', label: 'QRCode' },
    { icon: 'photo', label: 'Image' },
    { icon: 'photo.artframe', label: 'Clipart' },
  ],
  [
    { icon: 'line.diagonal', label: 'Line' },
    { icon: 'square.on.circle', label: 'Shapes' },
    { icon: 'tablecells', label: 'Table' },
    { icon: 'clock', label: 'Time' },
    { icon: 'character', label: 'ArcText' },
  ],
  [
    { icon: 'list.number', label: 'Counter' },
    { icon: 'tablecells.badge.ellipsis', label: 'Excel' },
    { icon: 'eye', label: 'OCR' },
    { icon: 'face.smiling', label: 'Line Emoji' },
    { icon: 'square.dashed', label: 'Border' },
  ],
  [
    { icon: 'signature', label: 'Signature' },
  ],
];

const TOOLS = TOOL_ROWS.flat();

const MAX_HISTORY = 60;

function logMultiTransformBox(
  phase: string,
  id: string,
  box: { left: number; top: number; width: number; height: number },
) {
  console.log(
    `[multi-transform] ${phase} ${id} l=${box.left.toFixed(2)} t=${box.top.toFixed(2)} w=${box.width.toFixed(2)} h=${box.height.toFixed(2)}`,
  );
}

function boxOfElement(el: LabelElement): MmBox {
  const size = elementSizeMm(el);
  return { left: el.left, top: el.top, width: size.width, height: size.height };
}

function scaledFontSizeForResize(
  el: LabelElement,
  handle: 'e' | 's',
  scaleX: number,
  scaleY: number,
  fallbackFontSize?: number,
): number | undefined {
  if (
    el.type === 'barcode' ||
    el.type === 'text' ||
    el.type === 'degrees'
  ) {
    return undefined;
  }
  if ('fontSize' in el && typeof el.fontSize === 'number') {
    const drivingScale = handle === 'e' ? scaleX : scaleY;
    return Math.max(4, Math.round(el.fontSize * drivingScale * 2) / 2);
  }
  return fallbackFontSize;
}

function resizeElementByScale(
  el: LabelElement,
  start: MmBox,
  handle: 'e' | 's',
  scaleX: number,
  scaleY: number,
  canvas: { widthMm: number; heightMm: number },
  fontSize?: number,
): MmBox {
  const policy = resizePolicyFor(el);
  const behavior = policy.behavior[handle];
  if (!behavior) {
    return { left: start.left, top: start.top, width: start.width, height: start.height };
  }
  return resizeMemberByScale({
    start,
    handle,
    behavior,
    scaleX,
    scaleY,
    aspect: aspectRatioOf(el),
    minMm: policy.minMm,
    canvas,
  });
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateEditorSplit() {
  LayoutAnimation.configureNext({
    duration: SPLIT_ANIMATION_MS,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
  });
}

const PANEL_ELEMENT_TYPES: readonly ElementType[] = [
  'text',
  'barcode',
  'qrcode',
  'line',
  'shape',
  'table',
  'time',
  'arctext',
  'degrees',
  'image',
  'clipart',
  'signature',
  'border',
];

const TOOL_LABEL_TO_PANEL_TYPE: Record<string, ElementType> = {
  Text: 'text',
  Barcode: 'barcode',
  QRCode: 'qrcode',
  Line: 'line',
  Shapes: 'shape',
  Table: 'table',
  Time: 'time',
  ArcText: 'arctext',
  Degrees: 'degrees',
  Serial: 'degrees',
  Counter: 'degrees',
  Image: 'image',
  Clipart: 'clipart',
  Signature: 'signature',
  Border: 'border',
};

function hasPropertyPanel(type: ElementType) {
  return PANEL_ELEMENT_TYPES.includes(type);
}

function createPanelSeeds(): Map<ElementType, LabelElement> {
  const seeds = new Map<ElementType, LabelElement>();
  for (const type of PANEL_ELEMENT_TYPES) {
    seeds.set(type, panelWarmSeed(type));
  }
  return seeds;
}

/** Offline stub so a property panel can mount before that element type exists on the label. */
function panelWarmSeed(type: ElementType): LabelElement {
  const id = `__panel_seed_${type}`;
  switch (type) {
    case 'text':
      return { ...DEFAULT_ELEMENT_STATE, id, type: 'text', text: '' };
    case 'barcode':
      return { ...DEFAULT_BARCODE_STATE, id, type: 'barcode', content: '1234567890' };
    case 'qrcode':
      return { ...DEFAULT_QRCODE_STATE, id, type: 'qrcode', content: '' };
    case 'line':
      return { ...DEFAULT_LINE_STATE, id, type: 'line' };
    case 'shape':
      return { ...DEFAULT_SHAPE_STATE, id, type: 'shape' };
    case 'table': {
      const table = createTableState(2, 3);
      return { ...table, id, type: 'table' };
    }
    case 'time':
      return { ...DEFAULT_TIME_STATE, id, type: 'time' };
    case 'arctext':
      return { ...DEFAULT_ARCTEXT_STATE, id, type: 'arctext', text: 'Arc' };
    case 'degrees':
      return { ...DEFAULT_DEGREES_STATE, id, type: 'degrees', content: '1' };
    case 'image':
      return {
        id,
        type: 'image',
        uri: '',
        rotation: 0,
        left: 0,
        top: 0,
        width: 20,
        height: 20,
        lockMovement: false,
        needPrinting: true,
        antiColor: false,
        contentFit: 'contain',
        colorMode: 'B & W',
        grayThreshold: 128,
        contentType: 'Local Image',
      };
    case 'clipart':
      return {
        id,
        type: 'clipart',
        clipartId: '',
        rotation: 0,
        left: 0,
        top: 0,
        width: 20,
        height: 20,
        lockMovement: false,
        needPrinting: true,
        drawingColorIndex: 0,
        strokeScale: 1,
      };
    case 'signature':
      return {
        id,
        type: 'signature',
        strokes: [],
        rotation: 0,
        left: 0,
        top: 0,
        width: 20,
        height: 20,
        lockMovement: false,
        needPrinting: true,
        drawingColorIndex: 0,
        colorMode: 'B & W',
        grayThreshold: 128,
      };
    case 'border':
      return {
        id,
        type: 'border',
        borderStyle: 'solid-medium',
        lineWidth: 0.55,
        rotation: 0,
        left: 2,
        top: 2,
        width: 36,
        height: 26,
        lockMovement: true,
        needPrinting: true,
        drawingColorIndex: 0,
        geometryVersion: 1,
        edgeGapMm: 1,
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Keeps a property panel mounted after first use. Mounting a panel creates many native
 * views on the UI thread, which stalls an in-flight drag; toggling display does not.
 * Hidden slots skip re-rendering entirely.
 * Visible slots must flex-fill the sheet: panels use flex:1 scroll bodies, and without
 * a flex parent they collapse to zero height (looks like the bottom panel never opened).
 */
const KeepAlivePanelSlot = memo(
  function KeepAlivePanelSlot({ visible, children }: { visible: boolean; children: ReactNode }) {
    useThemeRefresh();
    return <View style={visible ? panelSlotVisible : panelSlotHidden}>{children}</View>;
  },
  (prev, next) => !prev.visible && !next.visible,
);

const panelSlotVisible = { flex: 1, minHeight: 0 } as const;
const panelSlotHidden = { display: 'none' } as const;

function HeaderAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
      <AppIcon name={icon} tintColor="#FFFFFF" size={20} /* theme-fixed: white icon on a coloured button */ />
      <Text numberOfLines={1} style={styles.headerActionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToolbarItem({
  name,
  label,
  active,
  disabled,
  onPress,
}: {
  name: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  useThemeRefresh();
  const color = disabled ? C.textDisabled : active ? C.accent : C.textSecondary;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      android_ripple={androidRipple}
      style={({ pressed }) => [
        styles.toolbarItem,
        pressed && !disabled && styles.pressed,
      ]}>
      <TopToolbarIcon name={name} size={22} color={color} active={active} />
      <Text numberOfLines={1} style={[styles.toolbarLabel, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToolItem({
  icon: _icon,
  label,
  onPress,
  style,
}: {
  icon?: IconName;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.toolItem, style, pressed && styles.pressed]}>
      <ToolMenuIcon name={label} size={32} />
      <Text numberOfLines={1} style={styles.toolLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const DOUBLE_TAP_MS = 350;
/** Finger must move this many px before a drag starts (avoids accidental nudges). */
const DRAG_ACTIVATION_PX = 4;
/** Commit snap after drag — fine enough for print, no visible jump. */
const POSITION_SNAP_MM = 0.1;

function snapMm(value: number, step = POSITION_SNAP_MM) {
  return Math.round(value / step) * step;
}

function isTextEditableElement(type: LabelElement['type']) {
  return type === 'text' || type === 'degrees';
}

function paletteDefaultSizeMm(
  type: ElementType,
  canvas: { widthMm: number; heightMm: number },
  elements: LabelElement[],
): { widthMm: number; heightMm: number } {
  switch (type) {
    case 'barcode': {
      const fit = fitBarcodeDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'qrcode': {
      const fit = fitQrcodeDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'line': {
      const fit = fitLineDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'shape': {
      const fit = fitShapeDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'arctext': {
      const fit = fitShapeDefaults(canvas.widthMm, canvas.heightMm, elements);
      const circleSize = Math.min(fit.width, fit.height);
      return { widthMm: circleSize, heightMm: circleSize };
    }
    case 'signature': {
      const fit = fitShapeDefaults(canvas.widthMm, canvas.heightMm, elements);
      const size = Math.min(fit.width, fit.height);
      return { widthMm: size, heightMm: size };
    }
    default: {
      const fit =
        type === 'time'
          ? fitTimeDefaults(canvas.widthMm, canvas.heightMm, elements)
          : type === 'text'
            ? fitNewTextDefaults(canvas.widthMm, canvas.heightMm, elements)
            : type === 'degrees'
              ? fitCounterDefaults(canvas.widthMm, canvas.heightMm, elements)
              : fitTextDefaults(canvas.widthMm, canvas.heightMm, elements);
      return {
        widthMm: fit.width,
        heightMm: 'height' in fit && typeof fit.height === 'number' ? fit.height : textBlockHeightMm(fit.fontSize, 1),
      };
    }
  }
}

export default function EditScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    labelId?: string;
    labelName?: string;
    labelWidth?: string;
    labelHeight?: string;
    orientation?: string;
    paperType?: string;
    /** From New Label: 'circle' makes a round label (width and height are the diameter). */
    mediaShape?: string;
    templateCategory?: string;
    templatePreviewType?: string;
    cloneFromId?: string;
    selectedElementId?: string;
    autoOpenPanel?: string;
    excelBulkRefresh?: string;
  }>();

  const defaults = useSettingsStore((s) => s.defaults);
  const editorSettings = useSettingsStore((s) => s.editor);
  // The mm scale along the top and left edges; off frees that space for the canvas.
  const showRulers = editorSettings.showRulers !== false;
  // Rulers off: no gutter and nothing rendered, so the board re-fits to the freed space. The
  // layout effect below publishes the new gutter in the same commit as the fit, so it can't flicker.
  const rulerSize = showRulers ? RULER_SIZE : 0;
  const patchEditor = useSettingsStore((s) => s.patchEditor);
  const setCanvasTutorialSeen = useSettingsStore((s) => s.setCanvasTutorialSeen);
  const startWalkthrough = useWalkthroughStore((s) => s.start);
  const stopWalkthrough = useWalkthroughStore((s) => s.stop);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const savedDocuments = useLabelStore((s) => s.documents);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const { t } = useTranslation();
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();
  const { importExcel, excelImportModal, documentSourceSheet } = useExcelImportFlow();

  const [doc, setDoc] = useState<LabelDocument>(() => {
    const name = params.labelName ?? 'New Label_1';
    const parsed = clampLabelMm(
      params.labelWidth ? parseFloat(params.labelWidth) : defaults.labelWidth,
      params.labelHeight ? parseFloat(params.labelHeight) : defaults.labelHeight,
    );
    const widthMm = parsed.widthMm;
    const heightMm = parsed.heightMm;

    if (params.labelId) {
      const existing = useLabelStore.getState().getDocument(params.labelId);
      if (existing) {
        const copy = JSON.parse(JSON.stringify(existing)) as LabelDocument;
        const hydrated = hydrateBulkDocument(copy, useDataStore.getState().excelFiles);
        const normalized = { ...hydrated, elements: normalizeDocumentElements(hydrated) };
        if (isJewelryDieCutDocument(normalized)) {
          return canonicalizeJewelryDieCutDocument(normalized);
        }
        if (isRatTail143Document(normalized)) return refitRatTail143Document(normalized);
        return normalized;
      }
    }

    // Industry templates: same JSON schema as the catalog card (no extra layers).
    if (params.templatePreviewType) {
      const created = createIndustryTemplateDocument({
        name,
        category: params.templateCategory ?? '',
        widthMm,
        heightMm,
        previewType: params.templatePreviewType,
      });
      return {
        ...created,
        id: params.labelId ?? created.id,
        orientation: parseOrientation(params.orientation),
        paperType: parsePaperType(params.paperType),
      };
    }

    // Clone / duplicate: copy elements from the source document with fresh ids.
    let elements: LabelElement[] = [];
    if (params.cloneFromId) {
      const source = useLabelStore.getState().getDocument(params.cloneFromId);
      if (source) {
        const cloned = (JSON.parse(JSON.stringify(source.elements)) as LabelElement[]).map((el) => ({
          ...el,
          id: generateId(),
        }));
        // Clone target size can differ from the source (2ups / duplicate-at-new-size
        // creation flow). Proportional rescale so a verbatim copy is not left with
        // stale mm geometry that clips at the new label's edges.
        elements =
          source.widthMm === widthMm && source.heightMm === heightMm
            ? cloned
            : scaleDocumentToSize(
                { ...source, elements: cloned, ups: undefined },
                widthMm,
                heightMm,
              ).elements;
      }
    } else if (params.templateCategory) {
      const created = createIndustryTemplateDocument({
        name,
        category: params.templateCategory,
        widthMm,
        heightMm,
        previewType: params.templatePreviewType ?? '',
      });
      return {
        ...created,
        orientation: parseOrientation(params.orientation),
        paperType: parsePaperType(params.paperType),
      };
    }

    const created = createLabelDocument({
      name,
      widthMm,
      heightMm,
      orientation: parseOrientation(params.orientation),
      paperType: parsePaperType(params.paperType),
      mediaShape: params.mediaShape === 'circle' ? 'circle' : undefined,
      elements,
    });
    return { ...created, elements: normalizeDocumentElements(created) };
  });
  const [savedToStore, setSavedToStore] = useState(() => Boolean(params.labelId));
  const [dirty, setDirty] = useState(false);
  const bulkSheet = doc.bulk ? resolveBulkSheet(excelFiles, doc.bulk) : null;

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    params.selectedElementId ? [params.selectedElementId] : []
  );
  const [primaryId, setPrimaryId] = useState<string | null>(() =>
    params.selectedElementId ? params.selectedElementId : null,
  );
  const [multipleMode, setMultipleMode] = useState(false);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const primaryIdRef = useRef(primaryId);
  primaryIdRef.current = primaryId;
  const dragStartPositionsRef = useRef<Map<string, { left: number; top: number }> | null>(null);
  const transformKindRef = useRef<TransformStartKind | null>(null);
  const groupDeltaLeftSv = useSharedValue(0);
  const groupDeltaTopSv = useSharedValue(0);
  const groupAnchorIdSv = useSharedValue('');
  const groupEligibleSv = useSharedValue(0);
  const safeModeSv = useSharedValue(editorSettings.safeMode ? 1 : 0);
  const resizeStartSnapshotsRef = useRef<Map<string, MmBox> | null>(null);
  const groupScaleXSv = useSharedValue(1);
  const groupScaleYSv = useSharedValue(1);
  const groupHandleSv = useSharedValue(0);
  const groupScaleMinSv = useSharedValue(0.001);
  const groupScaleMaxSv = useSharedValue(1000);
  const activeSelectedIdSv = useSharedValue(primaryId ?? (params.selectedElementId ?? ''));
  const resizeHudVisibleSv = useSharedValue(0);
  const [chromeStatus, setChromeStatus] = useState<string | null>(null);
  const chromeStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelOpen, setPanelOpen] = useState(() =>
    Boolean(params.autoOpenPanel === 'true' && params.selectedElementId),
  );
  const [referenceSelected, setReferenceSelected] = useState(false);
  const referenceSelectedRef = useRef(false);

  const historyRef = useRef(new EditorHistory(MAX_HISTORY));
  const [historyRev, setHistoryRev] = useState(0);
  const transformingRef = useRef(false);
  const mountedRef = useRef(true);
  const dirtyRef = useRef(false);
  const patchBurstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpHistory = useCallback(() => setHistoryRev((n) => n + 1), []);

  // First time the canvas is opened: run the canvas tour once persisted settings have loaded.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maybeStart = () => {
      if (useSettingsStore.getState().canvasTutorialSeen) return;
      // Long enough for the split layout and tool palette to settle before measuring.
      timer = setTimeout(() => startWalkthrough('canvas'), 900);
    };
    if (useSettingsStore.persist.hasHydrated()) maybeStart();
    const unsub = useSettingsStore.persist.onFinishHydration(maybeStart);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [startWalkthrough]);

  // Leaving the editor mid-tour must not leave the overlay armed for the next screen.
  useEffect(
    () => () => {
      const { active, tour } = useWalkthroughStore.getState();
      if (active && tour === 'canvas') useWalkthroughStore.getState().stop();
    },
    [],
  );

  const toolbarRef = useRef<View>(null);
  const canvasShotRef = useRef<ViewShot>(null);
  const clipartReplaceIdRef = useRef<string | null>(null);
  const clipartPendingPlacementRef = useRef<{
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  } | null>(null);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [labelMenuTop, setLabelMenuTop] = useState(0);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showSignatureBoard, setShowSignatureBoard] = useState(false);
  const signatureBoardIntentRef = useRef<'create' | 'edit'>('create');
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [bulkScopeApplyAll, setBulkScopeApplyAll] = useState(true);
  const bulkApplyAllRef = useRef(true);
  bulkApplyAllRef.current = bulkScopeApplyAll;
  const bulkGestureSnapshotRef = useRef<LabelElement[] | null>(null);
  const [pickerRows, setPickerRows] = useState(2);
  const [pickerColumns, setPickerColumns] = useState(3);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const initialStageWidth = useMemo(
    () => Math.min(windowWidth, MaxContentWidth),
    [windowWidth],
  );
  const [stageWidth, setStageWidth] = useState(initialStageWidth);
  const [padInner, setPadInner] = useState({ width: 0, height: 0 });
  const [splitViewportH, setSplitViewportH] = useState(0);
  const [splitDragging, setSplitDragging] = useState(false);
  const splitDraggingRef = useRef(false);
  splitDraggingRef.current = splitDragging;
  const [canvasFullscreen, setCanvasFullscreen] = useState(() =>
    Boolean(editorSettings.canvasSplitFullscreen),
  );
  const effectiveSplitRatio =
    editorSettings.canvasSplitRatio == null ||
    editorSettings.canvasSplitRatio === 0.55 ||
    editorSettings.canvasSplitRatio === 0.42
      ? null
      : editorSettings.canvasSplitRatio;

  const [canvasSplitH, setCanvasSplitH] = useState(() =>
    restoreCanvasSplitHeight({
      ratio: effectiveSplitRatio,
      fullscreen: Boolean(editorSettings.canvasSplitFullscreen),
      viewportPx: editorFallbackViewportPx(windowHeight),
      panelMinPx: PANEL_MIN_HEIGHT_PX,
      panelDefaultPx: PANEL_DEFAULT_HEIGHT_PX,
    }),
  );

  const canvasHeightSv = useSharedValue(canvasSplitH);
  const isDividerDraggingSv = useSharedValue(false);
  const splitViewportHSv = useSharedValue(
    splitViewportH > 0 ? splitViewportH : editorFallbackViewportPx(windowHeight),
  );
  const workspaceWSv = useSharedValue(120);
  const rulerSizeSv = useSharedValue(rulerSize);
  const docWidthMmSv = useSharedValue(doc.widthMm);
  const docHeightMmSv = useSharedValue(doc.heightMm);
  const basePxPerMMSv = useSharedValue(1);
  const liveScaleSv = useSharedValue(1);
  const showBulkNav = Boolean(doc.bulk && doc.bulk.rowCount > 1);
  const showBulkCopies = Boolean(doc.bulk);
  // Serial labels: the canvas shows the label at `serialPreviewIndex`; the saved design is never changed.
  const serialFields = useMemo(() => collectSerialFields(doc), [doc.elements]);
  const showSerialBar = serialFields.length > 0 && !doc.bulk && !doc.ups;
  const serialCount = serialBatchCount(doc);
  const [serialPreviewIndex, setSerialPreviewIndex] = useState(0);
  const serialIdx = Math.min(Math.max(0, serialPreviewIndex), serialCount - 1);
  const printerLinked = usePrinterStore((st) => st.status === 'connected' || st.status === 'printing');
  const continueEntry = useSerialContinueStore((st) => st.byLabel[doc.id]);
  const continueOffset = continueEntry?.enabled ? continueEntry.offset : 0;
  const canvasDoc = useMemo(
    () =>
      serialFields.length === 0
        ? doc
        : resolveDocumentForIndex(doc, (doc.bulk ? doc.bulk.activeRowIndex : serialIdx) + (doc.bulk ? 0 : continueOffset)),
    [doc, serialFields.length, serialIdx, continueOffset],
  );
  const addLinkedBarcodeRef = useRef<((fieldId: string) => void) | null>(null);
  const serialEditorValue = useMemo<SerialEditorValue>(
    () => ({
      count: doc.bulk ? Math.max(1, doc.bulk.rowCount) : serialCount,
      setCount: (n) =>
        setDoc((prev) => ({
          ...prev,
          serialBatch: { v: 1, count: Math.max(1, Math.min(MAX_SERIAL_BATCH, Math.floor(n) || 1)) },
          updatedAt: Date.now(),
        })),
      isBulk: Boolean(doc.bulk),
      blockedReason: doc.ups ? 'Serial labels are not available on multi-up labels yet.' : null,
      linkOptions: (excludeFieldId) => {
        const names: Record<string, string> = { text: 'Text', barcode: 'Barcode', qrcode: 'QR code', degrees: 'Counter', arctext: 'ArcText', table: 'Table cell' };
        const seen: Record<string, number> = {};
        return linkCandidates(doc, excludeFieldId).map((f) => {
          const base = names[f.type] ?? 'Field';
          seen[base] = (seen[base] ?? 0) + 1;
          return { id: f.config.id, label: `${base} ${seen[base]}` };
        });
      },
      printerDpi: printerLinked ? getPrinterManager().getPrintDpi() : null,
      configs: serialMaps(serialFields).configs,
      contexts: serialMaps(serialFields).contexts,
      offset: doc.bulk ? 0 : continueOffset,
      addLinkedBarcode: (fieldId) => addLinkedBarcodeRef.current?.(fieldId),
    }),
    [doc, serialCount, serialFields, continueOffset, printerLinked],
  );
  const bulkNavReservePx =
    (showBulkNav ? BULK_LABEL_NAV_HEIGHT_PX : 0) +
    (showBulkCopies ? BULK_COPIES_BAR_HEIGHT_PX : 0) +
    (showSerialBar ? SERIAL_BAR_HEIGHT_PX : 0);
  const splitViewportForCanvas = Math.max(0, splitViewportH - bulkNavReservePx);
  const panelDefaultBase = showBulkNav ? BULK_PANEL_DEFAULT_HEIGHT_PX : PANEL_DEFAULT_HEIGHT_PX;
  const panelDefaultForSplit =
    panelDefaultBase +
    (editorSettings.showNudgePad ? NUDGE_PAD_SPLIT_EXTRA_PX : 0) +
    Math.max(0, Math.round(insets.bottom));
  // Smallest sheet = pinned toolbar row + system nav inset, so dragging the divider all the
  // way down never pushes the toolbar (Label, Multiple, Undo…) under the nav/gesture bar.
  const bottomInsetPx = Math.max(0, Math.round(insets.bottom));
  const panelMinForSplit =
    PANEL_MIN_HEIGHT_PX +
    bottomInsetPx +
    (editorSettings.showNudgePad ? NUDGE_PAD_SPLIT_EXTRA_PX : 0);
  const panelMinForSplitSv = useSharedValue(panelMinForSplit);
  const bulkNavReserveSv = useSharedValue(bulkNavReservePx);

  const topBarSelectionVisibleSv = useSharedValue(0);
  const bottomPanelVisibleSv = useSharedValue(
    panelOpen && (selectedIds.length > 0 || referenceSelected) ? 1 : 0,
  );

  useEffect(() => {
    topBarSelectionVisibleSv.value = selectedIds.length > 0 || referenceSelected ? 1 : 0;
  }, [selectedIds.length, referenceSelected, topBarSelectionVisibleSv]);

  useEffect(() => {
    safeModeSv.value = editorSettings.safeMode ? 1 : 0;
  }, [editorSettings.safeMode, safeModeSv]);

  useEffect(() => {
    bottomPanelVisibleSv.value = panelOpen && (selectedIds.length > 0 || referenceSelected) ? 1 : 0;
  }, [panelOpen, selectedIds.length, referenceSelected, bottomPanelVisibleSv]);

  useEffect(() => {
    activeSelectedIdSv.value = primaryId ?? (selectedIds.length === 1 ? selectedIds[0] : '');
  }, [primaryId, selectedIds, activeSelectedIdSv]);

  useEffect(() => {
    groupEligibleSv.value = selectedIds.length > 1 ? 1 : 0;
  }, [selectedIds.length, groupEligibleSv]);

  const contextualToolbarAnimatedStyle = useAnimatedStyle(() => ({
    opacity: topBarSelectionVisibleSv.value > 0.5 ? 1 : 0,
    zIndex: topBarSelectionVisibleSv.value > 0.5 ? 1 : 0,
    pointerEvents: topBarSelectionVisibleSv.value > 0.5 ? 'auto' : 'none',
  }));

  const staticPaletteAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bottomPanelVisibleSv.value > 0.5 ? 0 : 1,
    zIndex: bottomPanelVisibleSv.value > 0.5 ? 0 : 1,
    pointerEvents: bottomPanelVisibleSv.value > 0.5 ? 'none' : 'auto',
  }));

  const propertyPanelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bottomPanelVisibleSv.value > 0.5 ? 1 : 0,
    zIndex: bottomPanelVisibleSv.value > 0.5 ? 1 : 0,
    pointerEvents: bottomPanelVisibleSv.value > 0.5 ? 'auto' : 'none',
  }));

  const panelCloseBtnAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bottomPanelVisibleSv.value > 0.5 ? 1 : 0,
    pointerEvents: bottomPanelVisibleSv.value > 0.5 ? 'auto' : 'none',
  }));

  const [gridSpacingPopoverVisible, setGridSpacingPopoverVisible] = useState(false);
  const [padZoom, setPadZoom] = useState(1);
  const padPanRef = useRef({ x: 0, y: 0 });
  const editorViewRef = useRef<EditorViewTransform | null>(null);
  const padWindowOriginRef = useRef({ x: 0, y: 0 });
  const overlayOriginRef = useRef({ x: 0, y: 0 });
  const overlayViewRef = useRef<View>(null);
  const paletteGhostRef = useRef<{
    type: ElementType;
    label: string;
    widthMm: number;
    heightMm: number;
  } | null>(null);
  const [paletteGhost, setPaletteGhost] = useState<{
    windowX: number;
    windowY: number;
    widthPx: number;
    heightPx: number;
    icon: AppIconName;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [imageIngesting, setImageIngesting] = useState(false);

  const [textTab, setTextTab] = useState<PropertyTab>('Regular');
  const [barcodeTab, setBarcodeTab] = useState<BarcodePropertyTab>('Regular');
  const [qrcodeTab, setQrcodeTab] = useState<QrcodePropertyTab>('Regular');
  const [lineTab, setLineTab] = useState<LinePropertyTab>('Regular');
  const [shapeTab, setShapeTab] = useState<ShapePropertyTab>('Regular');
  const [tableTab, setTableTab] = useState<TablePropertyTab>('Regular');
  const [selectedTableCell, setSelectedTableCell] = useState<SelectedTableCell | null>(null);
  const selectedTableCellRef = useRef<SelectedTableCell | null>(null);
  // Single writer for cell selection. The ref is the synchronous source of truth that
  // callbacks read; the state exists only so the canvas repaints the highlight. Assigning
  // either one directly lets the two consumers drift apart.
  const commitSelectedTableCell = useCallback((next: SelectedTableCell | null) => {
    selectedTableCellRef.current = next;
    setSelectedTableCell(next);
  }, []);
  const [timeTab, setTimeTab] = useState<TimePropertyTab>('Regular');
  const [arcTextTab, setArcTextTab] = useState<ArcTextPropertyTab>('Regular');
  const [degreesTab, setDegreesTab] = useState<PropertyTab>('Regular');
  const [imageTab, setImageTab] = useState<ImagePropertyTab>('Regular');
  const [clipartTab, setClipartTab] = useState<ClipartPropertyTab>('Regular');
  const [signatureTab, setSignatureTab] = useState<SignaturePropertyTab>('Regular');

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [textEditDraft, setTextEditDraft] = useState('');
  const [textEditField, setTextEditField] = useState<'text' | 'content'>('text');
  const textEditInputRef = useRef<TextInput>(null);
  const [contentFocusRequest, setContentFocusRequest] = useState(0);

  const [quickEditTarget, setQuickEditTarget] = useState<{
    id: string;
    type: ElementType;
    value: string;
    anchorRect?: ElementAnchorRect;
    tableCell?: { tableId: string; row: number; col: number };
  } | null>(null);

  const initialSplitRestoredRef = useRef(false);
  const fitSplitHRef = useRef(0);
  const lastSplitSeenRef = useRef(0);
  const skipNextRefitRef = useRef(false);
  const lastViewportHRef = useRef(0);
  const lastPanelMinRef = useRef(panelMinForSplit);
  const lastPanelDefaultRef = useRef(panelDefaultForSplit);

  useEffect(() => {
    if (splitViewportH <= 0) return;

    if (!initialSplitRestoredRef.current) {
      initialSplitRestoredRef.current = true;
      lastViewportHRef.current = splitViewportForCanvas;
      lastPanelMinRef.current = panelMinForSplit;
      lastPanelDefaultRef.current = panelDefaultForSplit;
      setCanvasSplitH(
        restoreCanvasSplitHeight({
          ratio: effectiveSplitRatio,
          fullscreen: canvasFullscreen,
          viewportPx: splitViewportForCanvas,
          panelMinPx: panelMinForSplit,
          panelDefaultPx: panelDefaultForSplit,
        }),
      );
      return;
    }

    const prevVp = lastViewportHRef.current;
    const vpChanged = Math.abs(splitViewportForCanvas - prevVp) > 2;
    const panelMinChanged = panelMinForSplit !== lastPanelMinRef.current;
    const panelDefaultChanged = panelDefaultForSplit !== lastPanelDefaultRef.current;

    if (vpChanged || panelMinChanged || panelDefaultChanged) {
      lastViewportHRef.current = splitViewportForCanvas;
      lastPanelMinRef.current = panelMinForSplit;
      lastPanelDefaultRef.current = panelDefaultForSplit;
      setCanvasSplitH((prevH) => {
        if (canvasFullscreen) {
          return restoreCanvasSplitHeight({
            ratio: effectiveSplitRatio,
            fullscreen: true,
            viewportPx: splitViewportForCanvas,
            panelMinPx: panelMinForSplit,
            panelDefaultPx: panelDefaultForSplit,
          });
        }
        const prevUsable = usableSplitViewportPx(prevVp > 0 ? prevVp : splitViewportForCanvas);
        const ratio = prevUsable > 0 ? prevH / prevUsable : effectiveSplitRatio;
        return restoreCanvasSplitHeight({
          ratio,
          fullscreen: false,
          viewportPx: splitViewportForCanvas,
          panelMinPx: panelMinForSplit,
          panelDefaultPx: panelDefaultForSplit,
        });
      });
    }
  }, [
    splitViewportForCanvas,
    panelMinForSplit,
    panelDefaultForSplit,
    canvasFullscreen,
    effectiveSplitRatio,
  ]);

  const layoutWidth = stageWidth > 0 ? stageWidth : initialStageWidth;
  // Phone workspace is constant. Label millimetres only change the inner artboard.
  const workspaceW = padInner.width > 1 ? padInner.width : Math.max(120, layoutWidth);
  // Fit the artboard to the visible canvas stage (above the resize divider). Using the
  // whole split column height letterboxes the label with empty gray above and below.
  // Divider drags still scale live on the UI thread; settled height refits pxPerMM here.
  // On divider release the board is NOT re-fitted: the live UI-thread scale keeps showing the final
  // size from the same layout, so there is no commit/scale race (that race was the release flicker).
  // Any other split change (first layout, viewport/panel resize) still re-fits.
  if (canvasSplitH !== lastSplitSeenRef.current) {
    lastSplitSeenRef.current = canvasSplitH;
    if (skipNextRefitRef.current) {
      skipNextRefitRef.current = false;
    } else {
      fitSplitHRef.current = canvasSplitH;
    }
  }
  const fitSplitH = fitSplitHRef.current;
  const baseWorkspaceH =
    fitSplitH > 0
      ? fitSplitH
      : splitViewportH > 0
        ? splitViewportH
        : editorFallbackViewportPx(windowHeight);
  const { canvasWidthPx, canvasHeightPx, pxPerMM, boardOffsetXPx, boardOffsetYPx, innerWidthPx, innerHeightPx } =
    useMemo(() => {
      const fitted = fitEditorPadBoard(doc.widthMm, doc.heightMm, workspaceW, baseWorkspaceH, rulerSize, EDITOR_STAGE_MARGIN_PX);
      return {
        canvasWidthPx: Math.max(1, fitted.widthPx),
        canvasHeightPx: Math.max(1, fitted.heightPx),
        pxPerMM: fitted.scale,
        boardOffsetXPx: fitted.offsetXPx,
        boardOffsetYPx: fitted.offsetYPx,
        innerWidthPx: Math.max(1, fitted.innerWidthPx),
        innerHeightPx: Math.max(1, fitted.innerHeightPx),
      };
    }, [workspaceW, baseWorkspaceH, doc.widthMm, doc.heightMm, rulerSize]);

  const committedScale = useMemo(() => {
    if (pxPerMM <= 0) return 1;
    const liveInnerH = Math.max(32, canvasSplitH - rulerSize - EDITOR_STAGE_MARGIN_PX * 2);
    const liveInnerW = Math.max(32, workspaceW - rulerSize - EDITOR_STAGE_MARGIN_PX * 2);
    const livePxPerMM = Math.min(
      liveInnerW / (doc.widthMm > 0 ? doc.widthMm : 1),
      liveInnerH / (doc.heightMm > 0 ? doc.heightMm : 1),
    );
    return livePxPerMM / pxPerMM;
  }, [canvasSplitH, workspaceW, doc.widthMm, doc.heightMm, pxPerMM, rulerSize]);

  if (__DEV__) {
    // TEMP (canvas-size audit): workspace/canvas numbers for the device log. Remove after review.
    console.log(
      `[canvas-fit] label=${doc.widthMm}x${doc.heightMm}mm rulers=${showRulers} workspace=${Math.round(workspaceW)}x${Math.round(canvasSplitH)} ` +
        `gutter=${rulerSize} margin=${EDITOR_STAGE_MARGIN_PX} canvas=${Math.round(canvasWidthPx * committedScale)}x${Math.round(canvasHeightPx * committedScale)} ` +
        `fill=${(Math.max((canvasWidthPx * committedScale) / Math.max(1, workspaceW), (canvasHeightPx * committedScale) / Math.max(1, canvasSplitH)) * 100).toFixed(1)}%`,
    );
  }

  const writeEditorView = useCallback(
    (zoom: number, panX: number, panY: number) => {
      const effectiveZoom = zoom * committedScale;
      editorViewRef.current = editorViewTransform({
        pxPerMM,
        viewZoom: effectiveZoom,
        panX,
        panY,
        viewWidthPx: workspaceW,
        viewHeightPx: canvasSplitH,
        innerWidthPx,
        innerHeightPx,
        rulerSizePx: rulerSize,
        boardOffsetXPx,
        boardOffsetYPx,
        workspacePaddingBottomPx: EDITOR_WORKSPACE_PAD_BOTTOM_PX,
      });
    },
    [pxPerMM, committedScale, workspaceW, canvasSplitH, innerWidthPx, innerHeightPx, boardOffsetXPx, boardOffsetYPx, rulerSize],
  );

  useLayoutEffect(() => {
    if (!splitDragging) {
      canvasHeightSv.value = canvasSplitH;
    }
  }, [canvasSplitH, splitDragging, canvasHeightSv]);

  useEffect(() => {
    splitViewportHSv.value = splitViewportH;
  }, [splitViewportH, splitViewportHSv]);

  useEffect(() => {
    workspaceWSv.value = workspaceW;
  }, [workspaceW, workspaceWSv]);

  // Layout effect (not useEffect): on divider release the board re-fits to a new pxPerMM in the
  // same commit that resets the live scale. The UI-thread base must update before paint or one
  // frame shows the new layout with the old scale (visible flicker).
  // The ruler size and workspace width join them: toggling the on-screen ruler changes the layout
  // and the fit in one commit, so all inputs to the live scale must change together.
  useLayoutEffect(() => {
    docWidthMmSv.value = doc.widthMm;
    docHeightMmSv.value = doc.heightMm;
    basePxPerMMSv.value = pxPerMM;
    rulerSizeSv.value = rulerSize;
    workspaceWSv.value = workspaceW;
  }, [
    doc.widthMm,
    doc.heightMm,
    pxPerMM,
    rulerSize,
    workspaceW,
    docWidthMmSv,
    docHeightMmSv,
    basePxPerMMSv,
    rulerSizeSv,
    workspaceWSv,
  ]);

  useEffect(() => {
    panelMinForSplitSv.value = panelMinForSplit;
  }, [panelMinForSplit, panelMinForSplitSv]);

  useEffect(() => {
    bulkNavReserveSv.value = bulkNavReservePx;
  }, [bulkNavReservePx, bulkNavReserveSv]);

  const stageAnimatedStyle = useAnimatedStyle(() => ({
    height: canvasHeightSv.value,
  }));

  const toolGridAnimatedStyle = useAnimatedStyle(() => {
    const vpH = splitViewportHSv.value > 0 ? splitViewportHSv.value : 600;
    const belowDividerH = Math.max(
      0,
      vpH - canvasHeightSv.value - bulkNavReserveSv.value - SPLIT_GAP_PX,
    );
    const nudgeH = panelMinForSplitSv.value - PANEL_MIN_HEIGHT_PX;
    const gridH = Math.max(0, belowDividerH - nudgeH - PANEL_MIN_HEIGHT_PX);
    return {
      height: gridH,
    };
  });

  const canvasAssemblyAnimatedStyle = useAnimatedStyle(() => {
    const liveH = canvasHeightSv.value;
    const liveInnerH = Math.max(32, liveH - rulerSizeSv.value - EDITOR_STAGE_MARGIN_PX * 2);
    const liveInnerW = Math.max(32, workspaceWSv.value - rulerSizeSv.value - EDITOR_STAGE_MARGIN_PX * 2);
    const wMm = docWidthMmSv.value > 0 ? docWidthMmSv.value : 1;
    const hMm = docHeightMmSv.value > 0 ? docHeightMmSv.value : 1;
    const livePxPerMM = Math.min(liveInnerW / wMm, liveInnerH / hMm);
    const base = basePxPerMMSv.value > 0 ? basePxPerMMSv.value : 1;
    const s = livePxPerMM / base;
    liveScaleSv.value = s;
    return {
      transform: [{ scale: s }],
    };
  });

  useEffect(() => {
    writeEditorView(padZoom, padPanRef.current.x, padPanRef.current.y);
  }, [writeEditorView, padZoom]);

  const handleViewTransformChange = useCallback(
    (view: { zoom: number; panX: number; panY: number }) => {
      padPanRef.current = { x: view.panX, y: view.panY };
      writeEditorView(view.zoom, view.panX, view.panY);
    },
    [writeEditorView],
  );

  const handlePadWindowOrigin = useCallback((origin: { x: number; y: number }) => {
    padWindowOriginRef.current = origin;
  }, []);

  const windowPointToArtboardMm = useCallback((windowX: number, windowY: number) => {
    const view = editorViewRef.current;
    if (!view || !(view.pxPerMM > 0)) return null;
    return windowPointToMm({ x: windowX, y: windowY }, padWindowOriginRef.current, view);
  }, []);

  const hadSnapGuidesRef = useRef(false);
  const publishSnapGuides = useCallback((next: SnapGuide[]) => {
    setSnapGuides((prev) => (guidesEqual(prev, next) ? prev : next));
  }, []);

  const persistSplit = useCallback(
    (canvasPx: number, fullscreen: boolean) => {
      patchEditor({
        canvasSplitFullscreen: fullscreen,
        canvasSplitRatio: persistableSplitRatio({
          canvasPx,
          viewportPx: splitViewportForCanvas,
          fullscreen,
          lastRatio: effectiveSplitRatio ?? undefined,
        }),
      });
    },
    [patchEditor, splitViewportForCanvas, effectiveSplitRatio],
  );

  const toggleCanvasFullscreen = useCallback(() => {
    animateEditorSplit();
    const next = !canvasFullscreen;
    const viewport =
      splitViewportForCanvas > 0
        ? splitViewportForCanvas
        : canvasSplitH + panelMinForSplit + bulkNavReservePx;
    const height = restoreCanvasSplitHeight({
      ratio: effectiveSplitRatio,
      fullscreen: next,
      viewportPx: viewport,
      panelMinPx: panelMinForSplit,
      panelDefaultPx: panelDefaultForSplit,
    });
    setCanvasFullscreen(next);
    setCanvasSplitH(height);
    persistSplit(height, next);
  }, [
    canvasFullscreen,
    canvasSplitH,
    effectiveSplitRatio,
    panelMinForSplit,
    persistSplit,
    splitViewportForCanvas,
    bulkNavReservePx,
  ]);

  const handleSplitDragStart = useCallback(() => {
    splitDraggingRef.current = true;
    setSplitDragging(true);
    if (!canvasFullscreen) return;
    setCanvasFullscreen(false);
  }, [canvasFullscreen]);

  const handleSplitDragCancel = useCallback(() => {
    splitDraggingRef.current = false;
    setSplitDragging(false);
  }, []);

  const handleSplitDragEnd = useCallback(
    (result: SplitReleaseResult) => {
      splitDraggingRef.current = false;
      setSplitDragging(false);
      if (result.snapped) {
        try {
          Vibration.vibrate(8);
        } catch {
          // web / unsupported
        }
        animateEditorSplit();
      }
      setCanvasFullscreen(result.fullscreen);
      skipNextRefitRef.current = result.canvasPx !== lastSplitSeenRef.current;
      setCanvasSplitH(result.canvasPx);
      persistSplit(result.canvasPx, result.fullscreen);
    },
    [persistSplit],
  );

  const dieCutPad =
    hasStockSilhouette(doc.templatePreviewType) || isRatTailGeometry(doc.mediaGeometry) || !!doc.templateSvg;
  // Area around the white label: light grey in light mode, black in dark mode.
  const stageBg = C.canvasArea;
  const artboardFill = dieCutPad ? CATALOG_STOCK_LINER : EDITOR_ARTBOARD_COLOR;

  // Always reopen at Fit. View zoom is optional; it must not change physical mm.
  useEffect(() => {
    setPadZoom(1);
  }, [doc.widthMm, doc.heightMm, doc.templatePreviewType]);

  const primaryElement = useMemo(() => {
    if (primaryId) {
      return doc.elements.find((el) => el.id === primaryId) ?? null;
    }
    if (selectedIds.length === 1) {
      return doc.elements.find((el) => el.id === selectedIds[0]) ?? null;
    }
    return null;
  }, [doc.elements, primaryId, selectedIds]);

  const selectionColor = useMemo(() => {
    const selectedType =
      primaryElement?.type ??
      (selectedIds.length === 1
        ? doc.elements.find((el) => el.id === selectedIds[0])?.type
        : undefined);
    if (selectedType === 'table') {
      const idx = Math.max(
        0,
        Math.min(EDITOR_TABLE_SELECTION_COLORS.length - 1, editorSettings.tableColorIndex),
      );
      return EDITOR_TABLE_SELECTION_COLORS[idx];
    }
    if (selectedIds.length > 0) {
      const idx = Math.max(
        0,
        Math.min(EDITOR_BORDER_SELECTION_COLORS.length - 1, editorSettings.borderColorIndex),
      );
      return EDITOR_BORDER_SELECTION_COLORS[idx];
    }
    return chromeStrokeForFill(artboardFill);
  }, [
    primaryElement?.type,
    selectedIds,
    doc.elements,
    editorSettings.borderColorIndex,
    editorSettings.tableColorIndex,
    artboardFill,
  ]);

  const selectedElement = selectedIds.length === 1 ? primaryElement : null;
  const lastSelectedElementRef = useRef<LabelElement | null>(null);
  if (primaryElement) {
    lastSelectedElementRef.current = primaryElement;
  }
  const displayElement = primaryElement ?? lastSelectedElementRef.current;

  // All panel types stay keep-alive mounted from editor open so Add never cold-mounts a
  // native property tree on the insert frame (that path was 300ms+).
  const panelSeedRef = useRef<Map<ElementType, LabelElement> | null>(null);
  if (panelSeedRef.current == null) panelSeedRef.current = createPanelSeeds();
  if (displayElement && hasPropertyPanel(displayElement.type)) {
    panelSeedRef.current.set(displayElement.type, displayElement);
  }
  const [mountedPanelTypes, setMountedPanelTypes] = useState<ElementType[]>(
    () => [...PANEL_ELEMENT_TYPES],
  );
  const mountedPanelTypesRef = useRef(mountedPanelTypes);
  mountedPanelTypesRef.current = mountedPanelTypes;
  const activePanelType =
    displayElement && hasPropertyPanel(displayElement.type) ? displayElement.type : null;

  /** No-op when already warm (default). Safety net only. */
  const ensurePanelMounted = useCallback((type: ElementType) => {
    if (!hasPropertyPanel(type)) return;
    if (!panelSeedRef.current.has(type)) {
      panelSeedRef.current.set(type, panelWarmSeed(type));
    }
    if (mountedPanelTypesRef.current.includes(type)) return;
    const next = [...mountedPanelTypesRef.current, type];
    mountedPanelTypesRef.current = next;
    setMountedPanelTypes(next);
  }, []);

  const selectedElements = useMemo(
    () => doc.elements.filter((el) => selectedIds.includes(el.id)),
    [doc.elements, selectedIds],
  );
  const overlapRegionsMm = useMemo(
    () => (editorSettings.safeMode ? labelOverlapRegionsMm(doc.elements) : []),
    [editorSettings.safeMode, doc.elements],
  );
  const overlapBannerPositions = useMemo(() => {
    if (overlapRegionsMm.length === 0 || pxPerMM <= 0) return [];
    return overlapBannerPositionsPx(
      overlapRegionsMm,
      pxPerMM,
      canvasWidthPx || 1,
      canvasHeightPx || 1,
      rulerSize,
    );
  }, [overlapRegionsMm, pxPerMM, canvasWidthPx, canvasHeightPx, rulerSize]);
  const docRef = useRef(doc);
  docRef.current = doc;
  dirtyRef.current = dirty;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (patchBurstTimer.current) clearTimeout(patchBurstTimer.current);
      if (chromeStatusTimer.current) clearTimeout(chromeStatusTimer.current);
    };
  }, []);

  const scheduleHistoryCommit = useCallback(() => {
    if (patchBurstTimer.current) clearTimeout(patchBurstTimer.current);
    patchBurstTimer.current = setTimeout(() => {
      historyRef.current.commit();
      bumpHistory();
    }, 400);
  }, [bumpHistory]);

  const pushHistory = useCallback(() => {
    historyRef.current.pushUndo(docRef.current.elements);
    bumpHistory();
  }, [bumpHistory]);

  const setElements = useCallback(
    (updater: (elements: LabelElement[]) => LabelElement[], recordHistory = false) => {
      if (recordHistory) pushHistory();
      setDoc((prev) => {
        const nextElements = updater(prev.elements).map((el) =>
          clampElementToLabel(el, prev),
        );
        let next: LabelDocument = { ...prev, elements: nextElements };
        if (next.ups) {
          next = syncUpsActivePanel(next);
          if (next.ups?.batchEdit) {
            next = applyUpsBatchMirror(next);
          }
        }
        if (next.bulk) {
          const sheet = resolveBulkSheet(useDataStore.getState().excelFiles, next.bulk);
          if (sheet) {
            next = {
              ...next,
              bulk: syncBulkFromProjectedElements(next.bulk, sheet, next.elements),
            };
          }
        }
        return next;
      });
      setDirty(true);
    },
    [pushHistory],
  );

  const commitBulkSlotGeometry = useCallback((slotIds: string[]) => {
    if (slotIds.length === 0) return;
    setDoc((prev) => {
      if (!prev.bulk) return prev;
      const geo = geometryFromElements(prev.elements, slotIds);
      if (Object.keys(geo).length === 0) return prev;
      const nextBulk = bulkApplyAllRef.current
        ? applyGeometryToAllLabels(prev.bulk, geo)
        : applyGeometryToThisLabel(prev.bulk, prev.bulk.activeRowIndex, geo);
      return { ...prev, bulk: nextBulk };
    });
  }, []);

  const goToUpsPanel = useCallback((nextIndex: number) => {
    setDoc((prev) => {
      if (!prev.ups || nextIndex === prev.ups.activeIndex) return prev;
      return switchUpsPanel(prev, nextIndex);
    });
    setSelectedIds([]);
    setPrimaryId(null);
    setPanelOpen(false);
    historyRef.current.clear();
    bumpHistory();
    setTextEditId(null);
    setDirty(true);
  }, [bumpHistory]);

  const goToBulkRow = useCallback((nextIndex: number) => {
    setDoc((prev) => {
      if (!prev.bulk || nextIndex === prev.bulk.activeRowIndex) return prev;
      const sheet = resolveBulkSheet(useDataStore.getState().excelFiles, prev.bulk);
      if (!sheet) return prev;
      const synced: LabelDocument = {
        ...prev,
        bulk: syncBulkFromProjectedElements(prev.bulk, sheet, prev.elements),
      };
      return projectBulkDocument(synced, sheet, nextIndex);
    });
    setSelectedIds([]);
    setPrimaryId(null);
    setPanelOpen(false);
    historyRef.current.clear();
    bumpHistory();
    setTextEditId(null);
    setDirty(true);
  }, [bumpHistory]);

  const syncSelectionAfterSnapshot = useCallback((snapshot: LabelElement[]) => {
    setSelectedIds((ids) => {
      const filtered = ids.filter((id) => snapshot.some((el) => el.id === id));
      setPrimaryId((pid) =>
        pid && filtered.includes(pid) ? pid : filtered[filtered.length - 1] ?? null,
      );
      return filtered;
    });
  }, []);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.undo(docRef.current.elements);
    if (!snapshot) return;
    setDoc((d) => {
      let next: LabelDocument = { ...d, elements: snapshot };
      if (next.ups) next = syncUpsActivePanel(next);
      return next;
    });
    setDirty(true);
    bumpHistory();
    syncSelectionAfterSnapshot(snapshot);
  }, [bumpHistory, syncSelectionAfterSnapshot]);

  const redo = useCallback(() => {
    const snapshot = historyRef.current.redo(docRef.current.elements);
    if (!snapshot) return;
    setDoc((d) => {
      let next: LabelDocument = { ...d, elements: snapshot };
      if (next.ups) next = syncUpsActivePanel(next);
      return next;
    });
    setDirty(true);
    bumpHistory();
    syncSelectionAfterSnapshot(snapshot);
  }, [bumpHistory, syncSelectionAfterSnapshot]);

  const patchElement = useCallback(
    (id: string, updates: Record<string, unknown>) => {
      const geoKeys = ['left', 'top', 'width', 'height'];
      const isGeo = geoKeys.some((key) => key in updates) && isBulkSlotId(id) && Boolean(docRef.current.bulk);
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) => {
          if (el.id !== id) return el;
          if (el.type === 'text' || el.type === 'degrees') {
            return mergeTextElementPatch(el, updates, {
              widthMm: docRef.current.widthMm,
              heightMm: docRef.current.heightMm,
            });
          }
          return { ...el, ...updates } as LabelElement;
        }),
      );
      scheduleHistoryCommit();
      if (isGeo) commitBulkSlotGeometry([id]);
    },
    [setElements, scheduleHistoryCommit, commitBulkSlotGeometry],
  );

  // Labels across: a border is one per label (separate) or one around the whole sheet (unified).
  const borderScopeRef = useRef<BorderScope | null>(null);
  const currentBorderScope = (d: LabelDocument): BorderScope =>
    d.ups
      ? d.ups.sheetBorder ? 'unified' : 'separate'
      : d.elements.filter((el) => el.type === 'border').length > 1 ? 'separate' : 'unified';

  const applyBorderAcross = useCallback(
    (scope: BorderScope, style: BorderStyleInput | null) => {
      pushHistory();
      setDoc((prev) => (style ? applyAcrossBorder(prev, scope, style) : removeAcrossBorders(prev)));
      setDirty(true);
    },
    [pushHistory],
  );

  const patchSelected = useCallback(
    (updates: Record<string, unknown>) => {
      const id =
        primaryId ??
        (selectedIds.length === 1
          ? selectedIds[0]
          : selectedIds.length > 1
          ? selectedIds[selectedIds.length - 1]
          : null);
      if (!id) return;
      const cur = docRef.current;
      const target = cur.elements.find((el) => el.id === id);
      // Restyling one border of a labels-across sheet restyles them all, each fitted to its own label.
      if (target?.type === 'border' && acrossLayout(cur) && ('lineWidth' in updates || 'edgeGapMm' in updates)) {
        applyBorderAcross(currentBorderScope(cur), {
          borderStyle: target.borderStyle,
          lineWidth: typeof updates.lineWidth === 'number' ? updates.lineWidth : target.lineWidth,
          edgeGapMm: typeof updates.edgeGapMm === 'number' ? updates.edgeGapMm : (target.edgeGapMm ?? 1),
        });
        return;
      }
      patchElement(id, updates);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [primaryId, selectedIds, patchElement, applyBorderAcross],
  );

  // "Add barcode with the same serial": the barcode becomes the root field and the source follows it,
  // so the text always shows what the barcode encodes (check digit included).
  addLinkedBarcodeRef.current = (fieldId: string) => {
    const cur = docRef.current;
    if (cur.ups) return;
    const src = collectSerialFields(cur).find((f) => f.config.id === fieldId);
    if (!src || src.config.linkTo || src.type === 'barcode') return;
    const barcodeConfig = { ...src.config, id: newSerialFieldId(), linkTo: undefined };
    addElement('barcode', { contentType: 'Degrees', ...storedValuePatch(barcodeConfig, 'content', { encodeMode: 'CODE-128' }) });
    patchElement(src.elementId, { serial: { ...src.config, linkTo: barcodeConfig.id } });
  };

  // Writes to an explicit cell target. Kept free of selection state so callers reached from
  // a focus effect (scan / font / column-name results) can't run against a stale closure.
  const patchTableCellAt = useCallback(
    (
      target: SelectedTableCell,
      updates: Partial<EditorElementState & { degreesOffset?: number }>,
    ) => {
      const table = docRef.current.elements.find(
        (el): el is Extract<LabelElement, { type: 'table' }> =>
          el.id === target.tableId && el.type === 'table',
      );
      if (
        !table ||
        target.row < 0 ||
        target.col < 0 ||
        target.row >= table.rowCount ||
        target.col >= table.columnCount
      ) {
        console.log(
          `[table-cell] patch-rejected target=${JSON.stringify(target)} found=${!!table} rowCount=${table?.rowCount} colCount=${table?.columnCount}`,
        );
        return false;
      }
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) => {
          if (el.id !== target.tableId || el.type !== 'table') return el;
          return patchTableCellInElement(el, target.row, target.col, updates);
        }),
      );
      scheduleHistoryCommit();
      return true;
    },
    [setElements, scheduleHistoryCommit],
  );

  const patchTableCellSelected = useCallback(
    (updates: Partial<EditorElementState & { degreesOffset?: number }>) => {
      const cell = selectedTableCellRef.current;
      if (!cell) return false;
      return patchTableCellAt(cell, updates);
    },
    [patchTableCellAt],
  );

  const handleTableCellPress = useCallback(
    (tableId: string, cell: { row: number; col: number } | null) => {
      if (cell) {
        const tableEl = docRef.current.elements.find(
          (el): el is Extract<LabelElement, { type: 'table' }> =>
            el.id === tableId && el.type === 'table',
        );
        if (
          !tableEl ||
          cell.row < 0 ||
          cell.col < 0 ||
          cell.row >= tableEl.rowCount ||
          cell.col >= tableEl.columnCount
        ) {
          console.log(
            `[table-cell] select-rejected tableId=${tableId} cell=${JSON.stringify(cell)} rowCount=${tableEl?.rowCount} colCount=${tableEl?.columnCount}`,
          );
          return;
        }
        const prev = selectedTableCellRef.current;
        commitSelectedTableCell({ tableId, row: cell.row, col: cell.col });
        // Only reset tabs when entering cell mode from the table menu — keep Content/Font
        // while hopping between cells so the panel does not reload on every tap.
        if (!prev || prev.tableId !== tableId) setTextTab('Regular');
        console.log(
          `[table-cell] select-highlight tableId=${tableId} row=${cell.row} col=${cell.col} panel=TextPropertyPanel`,
        );
      } else {
        const hadCell = selectedTableCellRef.current != null;
        commitSelectedTableCell(null);
        if (hadCell) setTableTab('Regular');
        console.log(`[table-cell] clear-cell tableId=${tableId} panel=TablePropertyPanel`);
      }
      topBarSelectionVisibleSv.value = 1;
      bottomPanelVisibleSv.value = 1;
      setPanelOpen(true);
    },
    [commitSelectedTableCell, topBarSelectionVisibleSv, bottomPanelVisibleSv],
  );

  /** Stash the scan target before leaving so a remounted edit screen still fills the right cell. */
  const handleContentScanPress = useCallback(() => {
    const cell = selectedTableCellRef.current;
    if (cell) {
      editorBridge.scanConsumer = {
        kind: 'tableCell',
        tableId: cell.tableId,
        row: cell.row,
        col: cell.col,
      };
    } else if (selectedIdsRef.current.length === 1) {
      editorBridge.scanConsumer = {
        kind: 'element',
        elementId: selectedIdsRef.current[0],
      };
    } else {
      editorBridge.scanConsumer = null;
    }
    router.push({ pathname: '/scan', params: { from: 'edit' } });
  }, []);

  const handleTableCellQuickEdit = useCallback(
    (tableId: string, cell: { row: number; col: number }, anchorRect?: ElementAnchorRect) => {
      handleTableCellPress(tableId, cell);
      const tableEl = docRef.current.elements.find(
        (el): el is Extract<LabelElement, { type: 'table' }> =>
          el.id === tableId && el.type === 'table',
      );
      if (!tableEl) {
        console.log(`[table-cell] quick-edit-miss tableId=${tableId} — table not found`);
        return;
      }
      const table = ensureTableCells(tableEl);
      const value = table.cells?.[cell.row]?.[cell.col]?.text ?? '';
      console.log(
        `[table-cell] quick-edit-open tableId=${tableId} row=${cell.row} col=${cell.col} valueLen=${value.length} dialog=QuickValueModal`,
      );
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          setQuickEditTarget({
            id: tableId,
            type: 'text',
            value: '',
            anchorRect,
            tableCell: { tableId, row: cell.row, col: cell.col },
          });
        }, 80);
      });
    },
    [handleTableCellPress],
  );

  const patchPrimary = useCallback(
    (updates: Record<string, unknown>) => {
      const id = primaryId ?? (selectedIds.length === 1 ? selectedIds[0] : null);
      if (!id) return;
      patchElement(id, updates);
    },
    [primaryId, selectedIds, patchElement],
  );

  const patchAllSelected = useCallback(
    (updates: Record<string, unknown>) => {
      if (selectedIds.length === 0) return;
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) =>
          selectedIds.includes(el.id) ? ({ ...el, ...updates } as LabelElement) : el,
        ),
      );
      scheduleHistoryCommit();
    },
    [selectedIds, setElements, scheduleHistoryCommit],
  );

  const addElement = useCallback(
    (type: ElementType, overrides: Record<string, unknown> = {}) => {
      const { widthMm: maxW, heightMm: maxH, elements } = docRef.current;
      const base = { id: generateId() };
      let element: LabelElement;
      switch (type) {
        case 'text': {
          const preferred =
            defaults.autoFitFont || defaults.autoFitSize
              ? fitTextDefaults(maxW, maxH, elements).fontSize
              : DEFAULT_ELEMENT_STATE.fontSize;
          const fit = fitNewTextDefaults(maxW, maxH, elements, preferred);
          element = {
            ...DEFAULT_ELEMENT_STATE,
            ...base,
            type: 'text',
            text: NEW_TEXT_PLACEHOLDER,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            fontSize: fit.fontSize,
            autoWrapping: defaults.autoWrap,
            autoTextHeight: defaults.autoTextHeight,
            ...overrides,
          };
          if (element.type === 'text') {
            const maxBoxW = Math.max(4, maxW - Math.max(0, element.left));
            const maxBoxH = Math.max(2, maxH - Math.max(0, element.top));
            const fitted = fitTextBoxToContent(element, { widthMm: maxW, heightMm: maxH });
            const width = Math.min(maxBoxW, fitted.width);
            const autoHeight = element.autoTextHeight !== false && element.autoWrapping !== 'Close';
            if (autoHeight) {
              const { height: _drop, ...rest } = element;
              element = { ...rest, width };
            } else {
              element = {
                ...element,
                width,
                height: Math.min(maxBoxH, Math.max(2, fitted.height)),
              };
            }
          }
          break;
        }
        case 'barcode': {
          const fit = fitBarcodeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_BARCODE_STATE,
            ...base,
            type: 'barcode',
            content: '1234567890',
            encodeMode: defaults.barcodeEncodeMode,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            fontSize: fit.fontSize,
            ...overrides,
          };
          break;
        }
        case 'qrcode': {
          const fit = fitQrcodeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_QRCODE_STATE,
            ...base,
            type: 'qrcode',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            errorLevel: defaults.qrErrorLevel,
            zoneSize: defaults.qrZoneSize,
            ...overrides,
          };
          break;
        }
        case 'line': {
          const fit = fitLineDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_LINE_STATE,
            ...base,
            type: 'line',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            ...overrides,
          };
          break;
        }
        case 'shape': {
          const fit = fitShapeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_SHAPE_STATE,
            ...base,
            type: 'shape',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            ...overrides,
          };
          break;
        }
        case 'table': {
          const fit = fitTableDefaults(maxW, maxH, pickerRows, pickerColumns, elements);
          const tableState = createTableState(pickerRows, pickerColumns);
          element = {
            ...tableState,
            ...base,
            type: 'table',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            rowHeights: fit.rowHeights,
            columnWidths: fit.columnWidths,
            ...overrides,
          };
          break;
        }
        case 'time': {
          const fit = fitTimeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_TIME_STATE,
            ...base,
            type: 'time',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            fontSize: fit.fontSize,
            ...overrides,
          };
          break;
        }
        case 'arctext': {
          const fit = fitShapeDefaults(maxW, maxH, elements);
          const circleSize = Math.min(fit.width, fit.height);
          element = {
            ...DEFAULT_ARCTEXT_STATE,
            ...base,
            type: 'arctext',
            left: fit.left,
            top: fit.top,
            width: circleSize,
            height: circleSize,
            fontSize: fitTextDefaults(maxW, maxH, elements).fontSize,
            ...overrides,
          };
          break;
        }
        case 'degrees': {
          // A new Counter (it carries a serial config) is a compact one-line box; an old one keeps the wide box.
          const isCounter = Boolean((overrides as { serial?: unknown }).serial);
          const fit = isCounter ? fitCounterDefaults(maxW, maxH, elements) : fitTextDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_DEGREES_STATE,
            ...base,
            type: 'degrees',
            left: fit.left,
            top: fit.top,
            ...(isCounter ? { autoWrapping: 'Close' as const } : {}),
            width: fit.width,
            fontSize: DEFAULT_DEGREES_STATE.fontSize,
            ...overrides,
          };
          break;
        }
        case 'image': {
          const fit = fitClipartDefaults(maxW, maxH, elements);
          const tiled = defaults.tileImage && overrides.contentFit == null && overrides.uri == null;
          element = {
            id: base.id,
            type: 'image',
            uri: '',
            rotation: 0,
            left: tiled ? 0 : fit.left,
            top: tiled ? 0 : fit.top,
            width: tiled ? maxW : fit.width,
            height: tiled ? maxH : fit.height,
            lockMovement: false,
            needPrinting: true,
            antiColor: false,
            contentFit: tiled ? 'fill' : 'contain',
            colorMode: 'B & W',
            grayThreshold: 128,
            contentType: 'Local Image',
            ...overrides,
          };
          break;
        }
        case 'clipart': {
          const fit = fitClipartDefaults(maxW, maxH, elements);
          const tiled =
            defaults.tileImage &&
            overrides.clipartId == null &&
            overrides.tile == null &&
            overrides.width == null;
          element = {
            id: base.id,
            type: 'clipart',
            clipartId: '',
            rotation: 0,
            left: tiled ? 0 : fit.left,
            top: tiled ? 0 : fit.top,
            width: tiled ? maxW : fit.width,
            height: tiled ? maxH : fit.height,
            lockMovement: false,
            needPrinting: true,
            drawingColorIndex: 0,
            tile: tiled,
            colorMode: defaults.colorMode,
            grayThreshold: defaults.grayThreshold,
            ...overrides,
          };
          break;
        }
        case 'border': {
          const placement = defaultBorderPlacement(maxW, maxH);
          element = {
            id: base.id,
            type: 'border',
            borderStyle: 'solid-medium',
            lineWidth: 0.55,
            ...placement,
            needPrinting: true,
            drawingColorIndex: 0,
            ...overrides,
          };
          break;
        }
        case 'signature': {
          const fit = fitShapeDefaults(maxW, maxH, elements);
          element = {
            id: base.id,
            type: 'signature',
            strokes: [],
            rotation: 0,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            lockMovement: false,
            needPrinting: true,
            drawingColorIndex: 0,
            colorMode: 'B & W',
            grayThreshold: 128,
            ...overrides,
          };
          break;
        }
        default:
          return null;
      }
      element = clampElementToLabel(element, docRef.current);
      if (
        editorSettings.pictureAdsorption &&
        (element.type === 'image' || element.type === 'clipart')
      ) {
        const snapped = applyPictureAdsorption(element, docRef.current.elements, true);
        if (snapped) {
          element = { ...element, ...snapped };
        }
      }
      const maxZ = docRef.current.elements.reduce((max, el) => Math.max(max, el.zIndex ?? 0), 0);
      element.zIndex = maxZ + 1;
      // Sync selection chrome before React commits so the new element + handles paint together.
      selectedIdsRef.current = [element.id];
      primaryIdRef.current = element.id;
      lastSelectedElementRef.current = element;
      activeSelectedIdSv.value = element.id;
      topBarSelectionVisibleSv.value = 1;
      bottomPanelVisibleSv.value = 1;
      if (hasPropertyPanel(element.type)) {
        panelSeedRef.current.set(element.type, element);
      }
      setElements((items) => [...items, element], true);
      setSelectedIds([element.id]);
      setPrimaryId(element.id);
      return element;
    },
    [
      defaults,
      pickerRows,
      pickerColumns,
      setElements,
      editorSettings.pictureAdsorption,
      activeSelectedIdSv,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
    ],
  );

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;

    transformingRef.current = false;
    transformKindRef.current = null;
    resizeHudVisibleSv.value = 0;
    dragStartPositionsRef.current = null;
    resizeStartSnapshotsRef.current = null;
    clearGroupPreview();

    setQuickEditTarget(null);
    setTextEditId(null);
    textEditInputRef.current?.blur();
    commitSelectedTableCell(null);

    const remaining = docRef.current.elements.filter((el) => !ids.includes(el.id));
    for (const type of PANEL_ELEMENT_TYPES) {
      const live = remaining.find((el) => el.type === type);
      if (live) panelSeedRef.current.set(type, live);
      else if (!panelSeedRef.current.has(type)) panelSeedRef.current.set(type, panelWarmSeed(type));
    }

    setElements((elements) => elements.filter((el) => !ids.includes(el.id)), true);

    // Prefer a remaining canvas-selectable element (not a border).
    const candidates = sortLayers(remaining).filter(
      (el) => el.type !== 'border' && isEditorVisible(el),
    );
    const next = candidates.length > 0 ? candidates[candidates.length - 1] : null;

    if (next) {
      selectedIdsRef.current = [next.id];
      primaryIdRef.current = next.id;
      lastSelectedElementRef.current = next;
      activeSelectedIdSv.value = next.id;
      topBarSelectionVisibleSv.value = 1;
      bottomPanelVisibleSv.value = 1;
      groupEligibleSv.value = 0;
      setSelectedIds([next.id]);
      setPrimaryId(next.id);
      ensurePanelMounted(next.type);
      setPanelOpen(true);
      return;
    }

    selectedIdsRef.current = [];
    primaryIdRef.current = null;
    lastSelectedElementRef.current = null;
    activeSelectedIdSv.value = '';
    topBarSelectionVisibleSv.value = 0;
    bottomPanelVisibleSv.value = 0;
    groupEligibleSv.value = 0;
    setSelectedIds([]);
    setPrimaryId(null);
    setPanelOpen(false);
  }, [
    setElements,
    commitSelectedTableCell,
    clearGroupPreview,
    activeSelectedIdSv,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    groupEligibleSv,
    ensurePanelMounted,
  ]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const bounds = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
    const result = duplicateElements(docRef.current.elements, selectedIds, bounds);
    if (result.newIds.length === 0) return;
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    setElements(() => result.elements, true);
    const next = selectionFromIds(result.newIds);
    setSelectedIds(next.ids);
    setPrimaryId(next.primaryId);
    commitSelectedTableCell(null);
  }, [
    selectedIds,
    setElements,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    commitSelectedTableCell,
    resizeHudVisibleSv,
  ]);

  const handleDeselectAll = useCallback(() => {
    referenceSelectedRef.current = false;
    setReferenceSelected(false);
    selectedIdsRef.current = [];
    primaryIdRef.current = null;
    activeSelectedIdSv.value = '';
    topBarSelectionVisibleSv.value = 0;
    bottomPanelVisibleSv.value = 0;
    groupEligibleSv.value = 0;
    resizeHudVisibleSv.value = 0;
    setSelectedIds([]);
    setPrimaryId(null);
    commitSelectedTableCell(null);
    setPanelOpen(false);
  }, [
    activeSelectedIdSv,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    groupEligibleSv,
    resizeHudVisibleSv,
    commitSelectedTableCell,
  ]);

  const handleCanvasBackgroundTap = useCallback(() => {
    if (referenceSelectedRef.current) {
      referenceSelectedRef.current = false;
      setReferenceSelected(false);
      setPanelOpen(false);
      bottomPanelVisibleSv.value = 0;
      topBarSelectionVisibleSv.value = 0;
      return;
    }
    if (docRef.current.referenceImage && selectedIdsRef.current.length === 0) {
      referenceSelectedRef.current = true;
      setReferenceSelected(true);
      topBarSelectionVisibleSv.value = 1;
      return;
    }
    handleDeselectAll();
  }, [bottomPanelVisibleSv, handleDeselectAll, topBarSelectionVisibleSv]);

  const patchReferenceImage = useCallback((updates: Partial<LabelReferenceImage>) => {
    setDoc((prev) => {
      if (!prev.referenceImage) return prev;
      return { ...prev, referenceImage: { ...prev.referenceImage, ...updates } };
    });
    setDirty(true);
  }, []);

  const toggleMultipleMode = useCallback(() => {
    const turningOn = !multipleMode;
    const next = reduceMultipleModeToggle(turningOn, {
      ids: selectedIdsRef.current,
      primaryId: primaryIdRef.current,
    });
    if (!turningOn) {
      topBarSelectionVisibleSv.value = 0;
      bottomPanelVisibleSv.value = 0;
      setPanelOpen(false);
    }
    setSelectedIds(next.ids);
    setPrimaryId(next.primaryId);
    setMultipleMode(turningOn);
  }, [multipleMode, topBarSelectionVisibleSv, bottomPanelVisibleSv]);

  const flashChromeStatus = useCallback((message: string, durationMs = 1600) => {
    if (chromeStatusTimer.current) clearTimeout(chromeStatusTimer.current);
    setChromeStatus(message);
    chromeStatusTimer.current = setTimeout(() => {
      chromeStatusTimer.current = null;
      if (mountedRef.current) setChromeStatus(null);
    }, durationMs);
  }, []);

  const gridShown = Boolean(editorSettings.editorGrid);

  const toggleEditorGrid = useCallback(() => {
    const next = !gridShown;
    requestEditorGridToggle(next, patchEditor);
    if (next) {
      flashChromeStatus('Grid enabled — long press to change grid size', 2400);
    } else {
      flashChromeStatus('Grid disabled');
    }
  }, [gridShown, patchEditor, flashChromeStatus]);

  const gridSpacingMm =
    editorSettings.editorGridSpacingMm ?? DEFAULT_EDITOR_SETTINGS.editorGridSpacingMm;
  const gridOverlay =
    editorSettings.editorGridOverlay ?? DEFAULT_EDITOR_SETTINGS.editorGridOverlay;

  const changeGridSpacing = useCallback(
    (mm: number) => {
      patchEditor({ editorGridSpacingMm: mm });
    },
    [patchEditor],
  );

  const changeGridOverlay = useCallback(
    (overlay: boolean) => {
      patchEditor({ editorGridOverlay: overlay });
    },
    [patchEditor],
  );

  const resetTabToRegularForElement = useCallback((type: ElementType) => {
    switch (type) {
      case 'barcode':
        setBarcodeTab('Regular');
        break;
      case 'image':
        setImageTab('Regular');
        break;
      case 'text':
        setTextTab('Regular');
        break;
      case 'qrcode':
        setQrcodeTab('Regular');
        break;
      case 'line':
        setLineTab('Regular');
        break;
      case 'shape':
        setShapeTab('Regular');
        break;
      case 'table':
        setTableTab('Regular');
        break;
      case 'time':
        setTimeTab('Regular');
        break;
      case 'arctext':
        setArcTextTab('Regular');
        break;
      case 'degrees':
        setDegreesTab('Regular');
        break;
      case 'clipart':
        setClipartTab('Regular');
        break;
      case 'signature':
        setSignatureTab('Regular');
        break;
      default:
        break;
    }
  }, []);

  const handleSelect = useCallback(
    (id: string, source: SelectSource = 'touch') => {
      const element = docRef.current.elements.find((el) => el.id === id);
      if (!element) return;
      if (!mountedRef.current) return;
      // Borders are not canvas-selectable — only the Border menu may open their panel.
      if (element.type === 'border' && source !== 'menu') return;
      if (referenceSelectedRef.current) {
        referenceSelectedRef.current = false;
        setReferenceSelected(false);
      }

      if (element.type === 'border') {
        selectedIdsRef.current = [id];
        primaryIdRef.current = id;
        lastSelectedElementRef.current = element;
        setSelectedIds([id]);
        setPrimaryId(id);
        topBarSelectionVisibleSv.value = 1;
        bottomPanelVisibleSv.value = 1;
        activeSelectedIdSv.value = id;
        setPanelOpen(true);
        return;
      }

      const current = { ids: selectedIdsRef.current, primaryId: primaryIdRef.current };
      const alreadySelected = current.ids.includes(id);

      // Touch-down is add-only: in Multiple mode it must never drop a member, or a group
      // drag loses elements and the tap-end toggle flips it back (flicker).
      if (multipleMode && source === 'touch' && alreadySelected) {
        activeSelectedIdSv.value = id;
        return;
      }
      // A deferred toggle whose element was already removed elsewhere is stale.
      if (multipleMode && source === 'toggle' && !alreadySelected) return;

      // Same element already selected with panel open — skip React churn on drag start.
      if (
        !multipleMode &&
        current.ids.length === 1 &&
        current.ids[0] === id &&
        panelOpen
      ) {
        activeSelectedIdSv.value = id;
        return;
      }

      const next = reduceTapSelect({ id, multipleMode, current });

      // Refs update synchronously so a rapid next touch never reads the pre-render selection.
      selectedIdsRef.current = next.ids;
      primaryIdRef.current = next.primaryId;
      setSelectedIds(next.ids);
      setPrimaryId(next.primaryId);

      if (next.ids.length === 0) {
        activeSelectedIdSv.value = '';
        topBarSelectionVisibleSv.value = 0;
        bottomPanelVisibleSv.value = 0;
        commitSelectedTableCell(null);
        setPanelOpen(false);
        return;
      }

      if (
        !next.primaryId ||
        next.primaryId !== selectedTableCellRef.current?.tableId
      ) {
        commitSelectedTableCell(null);
      }

      topBarSelectionVisibleSv.value = 1;
      bottomPanelVisibleSv.value = 1;
      activeSelectedIdSv.value = next.primaryId ?? id;
      lastSelectedElementRef.current =
        docRef.current.elements.find((el) => el.id === next.primaryId) ?? element;

      // Lightweight open on touch-down — no ensurePanelMounted / full tab reset (those stall drag).
      if (!multipleMode) {
        if (element.type === 'image') {
          setImageTab('Regular');
          setPanelOpen(true);
        } else if (element.type === 'clipart') {
          setClipartTab('Regular');
          setPanelOpen(true);
        } else {
          setPanelOpen(true);
        }
      } else {
        setPanelOpen(true);
      }
    },
    [
      multipleMode,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
      activeSelectedIdSv,
      panelOpen,
      commitSelectedTableCell,
    ],
  );

  const openPropertyPanelFor = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element || element.type === 'border') return;
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    setSelectedIds([id]);
    setPrimaryId(id);
    resetTabToRegularForElement(element.type);
    setPanelOpen(true);
  }, [topBarSelectionVisibleSv, bottomPanelVisibleSv, resetTabToRegularForElement]);

  const openPanelFor = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element || element.type === 'border') return;
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    setSelectedIds([id]);
    setPrimaryId(id);
    if (element.type === 'signature') {
      signatureBoardIntentRef.current = 'edit';
      setShowSignatureBoard(true);
      return;
    }
    resetTabToRegularForElement(element.type);
    setPanelOpen(true);
  }, [topBarSelectionVisibleSv, bottomPanelVisibleSv, resetTabToRegularForElement]);

  const beginTextEdit = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element) return;
    setSelectedIds([id]);
    setPrimaryId(id);
    setPanelOpen(true);

    // A serial element has no typed text; its settings live in the panel.
    if (isSerialActive(element)) {
      resetTabToRegularForElement(element.type);
      return;
    }

    if (element.type === 'text') {
      setTextTab('Content');
      setTextEditField('text');
      setTextEditDraft(element.text);
      setTextEditId(id);
      setContentFocusRequest((n) => n + 1);
    } else if (element.type === 'degrees') {
      setDegreesTab('Content');
      setTextEditField('content');
      setTextEditDraft(element.content);
      setTextEditId(id);
      setContentFocusRequest((n) => n + 1);
    } else {
      return;
    }

    requestAnimationFrame(() => {
      textEditInputRef.current?.focus();
    });
  }, [resetTabToRegularForElement]);

  const handleQuickEdit = useCallback((id: string, anchorRect?: ElementAnchorRect) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element || !isQuickEditableType(element.type)) return;
    setSelectedIds([id]);
    setPrimaryId(id);
    // Wait for the double-tap gesture to finish so it doesn't steal focus from the input.
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        setQuickEditTarget({
          id,
          type: element.type,
          // A fresh text box starts blank (placeholder cleared); once the user has typed, edit it.
          value: isSerialActive(element)
            ? ((element as unknown as { serial?: { start: string } }).serial?.start ?? '')
            : element.type === 'text' && element.text && element.text !== NEW_TEXT_PLACEHOLDER
              ? element.text
              : '',
          anchorRect,
        });
      }, 80);
    });
  }, []);

  const handleQuickEditConfirm = useCallback(
    (newValue: string) => {
      if (!quickEditTarget) return;
      const cell = quickEditTarget.tableCell;
      if (cell) {
        historyRef.current.begin(docRef.current.elements);
        setElements((elements) =>
          elements.map((el) => {
            if (el.id !== cell.tableId || el.type !== 'table') return el;
            return patchTableCellInElement(el, cell.row, cell.col, {
              text: newValue,
              contentType: 'Manual',
            });
          }),
        );
        scheduleHistoryCommit();
        commitSelectedTableCell(cell);
        setQuickEditTarget(null);
        return;
      }
      const element = docRef.current.elements.find((el) => el.id === quickEditTarget.id);
      if (element && isSerialActive(element)) {
        // Quick edit on a serial element changes its Start value.
        const serial = (element as unknown as { serial: Record<string, unknown> }).serial;
        patchElement(element.id, { serial: { ...serial, start: newValue.trim() } });
      } else if (element) {
        const patch = getQuickEditPatch(element, newValue);
        patchElement(element.id, patch);
      }
      setQuickEditTarget(null);
    },
    [
      quickEditTarget,
      patchElement,
      setElements,
      scheduleHistoryCommit,
      commitSelectedTableCell,
    ],
  );

  const handleQuickEditCancel = useCallback(() => {
    setQuickEditTarget(null);
  }, []);

  const commitTextEdit = useCallback(() => {
    setTextEditId(null);
    textEditInputRef.current?.blur();
  }, []);

  const handleTextEditChange = useCallback(
    (value: string) => {
      setTextEditDraft(value);
      if (!textEditId) return;
      patchElement(textEditId, { [textEditField]: value });
    },
    [patchElement, textEditField, textEditId],
  );

  const selectedElementHeightMm = primaryElement
    ? Math.min(
        elementSizeMm(primaryElement).height,
        Math.max(0.5, doc.heightMm - Math.max(0, primaryElement.top)),
      )
    : 0;
  const labelBounds = useMemo(
    () => ({ widthMm: doc.widthMm, heightMm: doc.heightMm }),
    [doc.widthMm, doc.heightMm],
  );

  const rulerLeftMm = useSharedValue(0);
  const rulerTopMm = useSharedValue(0);
  const rulerWidthMm = useSharedValue(0);
  const rulerHeightMm = useSharedValue(0);
  const rulerVisible = useSharedValue(false);

  const liveRulerBounds = useMemo<LiveRulerBounds>(
    () => ({
      leftMm: rulerLeftMm,
      topMm: rulerTopMm,
      widthMm: rulerWidthMm,
      heightMm: rulerHeightMm,
      visible: rulerVisible,
    }),
    [rulerLeftMm, rulerTopMm, rulerWidthMm, rulerHeightMm, rulerVisible],
  );

  useEffect(() => {
    if (transformingRef.current) return;
    if (selectedElement) {
      rulerLeftMm.value = selectedElement.left;
      rulerTopMm.value = selectedElement.top;
      rulerWidthMm.value = selectedElement.width;
      rulerHeightMm.value = selectedElementHeightMm;
      rulerVisible.value = true;
    } else {
      rulerVisible.value = false;
    }
  }, [
    selectedElement,
    selectedElementHeightMm,
    rulerLeftMm,
    rulerTopMm,
    rulerWidthMm,
    rulerHeightMm,
    rulerVisible,
  ]);

  const clearGroupPreview = useCallback(() => {
    groupAnchorIdSv.value = '';
    groupDeltaLeftSv.value = 0;
    groupDeltaTopSv.value = 0;
    groupScaleXSv.value = 1;
    groupScaleYSv.value = 1;
  }, [groupAnchorIdSv, groupDeltaLeftSv, groupDeltaTopSv, groupScaleXSv, groupScaleYSv]);

  const handleTransformStart = useCallback(
    (id: string, kind: TransformStartKind) => {
      transformingRef.current = true;
      historyRef.current.begin(docRef.current.elements);
      publishSnapGuides([]);
      transformKindRef.current = kind;
      resizeHudVisibleSv.value = kind === 'resize' ? 1 : 0;
      if (docRef.current.bulk) {
        bulkGestureSnapshotRef.current = JSON.parse(
          JSON.stringify(docRef.current.elements),
        ) as LabelElement[];
      } else {
        bulkGestureSnapshotRef.current = null;
      }

      if (!selectedIdsRef.current.includes(id)) {
        handleSelect(id);
      }

      const ids = selectedIdsRef.current.includes(id) ? selectedIdsRef.current : [id];
      const map = new Map<string, MmBox>();
      for (const el of docRef.current.elements) {
        if (ids.includes(el.id)) {
          const box = boxOfElement(el);
          map.set(el.id, box);
          logMultiTransformBox('start', el.id, box);
        }
      }

      if (kind === 'move' && ids.length > 1 && ids.includes(id)) {
        const positions = new Map<string, { left: number; top: number }>();
        for (const [memberId, box] of map) {
          positions.set(memberId, { left: box.left, top: box.top });
        }
        dragStartPositionsRef.current = positions;
        resizeStartSnapshotsRef.current = null;
      } else if (kind === 'resize' && ids.length > 1 && ids.includes(id)) {
        dragStartPositionsRef.current = null;
        resizeStartSnapshotsRef.current = map.size > 1 ? map : null;
      } else {
        dragStartPositionsRef.current = null;
        resizeStartSnapshotsRef.current = null;
      }
    },
    [publishSnapGuides, handleSelect, resizeHudVisibleSv],
  );

  const prepareGroupResizeHandle = useCallback(
    (handle: 'e' | 's') => {
      const snapshots = resizeStartSnapshotsRef.current;
      const ids = selectedIdsRef.current;
      if (ids.length < 2) return;
      const docSnapshot = docRef.current;
      const canvas = { widthMm: docSnapshot.widthMm, heightMm: docSnapshot.heightMm };
      const resolved = snapshots ?? new Map<string, MmBox>();
      if (!snapshots) {
        for (const el of docSnapshot.elements) {
          if (ids.includes(el.id)) resolved.set(el.id, boxOfElement(el));
        }
        resizeStartSnapshotsRef.current = resolved;
      }
      const members: ScaleCapMember[] = [];
      for (const memberId of ids) {
        const el = docSnapshot.elements.find((item) => item.id === memberId);
        const start = resolved.get(memberId);
        if (!el || !start) continue;
        const policy = resizePolicyFor(el);
        const behavior = policy.behavior[handle];
        if (!behavior) continue;
        members.push({
          start,
          minMm: policy.minMm,
          behavior,
          aspect: aspectRatioOf(el),
        });
      }
      if (members.length === 0) return;
      const limits = sharedScaleLimits({ members, handle, canvas });
      groupHandleSv.value = handle === 's' ? 1 : 0;
      groupScaleMinSv.value = limits.minScale;
      groupScaleMaxSv.value = limits.maxScale;
    },
    [groupHandleSv, groupScaleMinSv, groupScaleMaxSv],
  );

  const snapMoveMm = useCallback(
    (input: { id: string; leftMm: number; topMm: number; widthMm: number; heightMm: number }) => {
      return { leftMm: input.leftMm, topMm: input.topMm };
    },
    [],
  );

  const handleTransformMove = useCallback((_payload: TransformMovePayload) => {
    // Group-drag live preview is driven on the UI thread in konva-transformer worklets.
  }, []);

  const handleTransformEnd = useCallback(
    (payload: TransformCommitPayload) => {
      publishSnapGuides([]);
      resizeHudVisibleSv.value = 0;
      if (!docRef.current.elements.some((el) => el.id === payload.id)) {
        transformingRef.current = false;
        dragStartPositionsRef.current = null;
        resizeStartSnapshotsRef.current = null;
        transformKindRef.current = null;
        bulkGestureSnapshotRef.current = null;
        clearGroupPreview();
        return;
      }
      const clean = sanitizeTransform(payload);
      const recordHistory = !transformingRef.current;
      if (transformingRef.current) {
        historyRef.current.commit();
        transformingRef.current = false;
        bumpHistory();
      }

      const startPositions = dragStartPositionsRef.current;
      dragStartPositionsRef.current = null;
      const resizeSnapshots = resizeStartSnapshotsRef.current;
      resizeStartSnapshotsRef.current = null;
      const kind = transformKindRef.current;
      transformKindRef.current = null;
      const ids = selectedIdsRef.current;
      const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };

      const offerBulkScope = (memberIds: string[]) => {
        const snap = bulkGestureSnapshotRef.current;
        bulkGestureSnapshotRef.current = null;
        if (kind !== 'move' && kind !== 'resize') return;
        if (!snap) return;
        const slotIds = memberIds.filter(isBulkSlotId);
        if (!slotIds.length) return;
        const origin = snap.find((el) => el.id === payload.id);
        if (origin) {
          const originHeight =
            'height' in origin && typeof origin.height === 'number' ? origin.height : clean.heightMm;
          const unchanged =
            Math.abs(origin.left - clean.leftMm) <= 0.02 &&
            Math.abs(origin.top - clean.topMm) <= 0.02 &&
            (kind === 'move' ||
              (Math.abs(origin.width - clean.widthMm) <= 0.02 &&
                Math.abs(originHeight - clean.heightMm) <= 0.02));
          if (unchanged && (!ids.length || ids.length === 1)) return;
        }
        commitBulkSlotGeometry(slotIds);
      };

      const patchBox = (
        el: LabelElement,
        box: MmBox,
        rotation: number,
        fontSize?: number,
      ): LabelElement => {
        const next: LabelElement = {
          ...el,
          left: box.left,
          top: box.top,
          width: box.width,
          rotation,
        };
        if (fontSize !== undefined && 'fontSize' in next) {
          (next as { fontSize: number }).fontSize = fontSize;
        }
        if (
          el.type === 'text' ||
          el.type === 'degrees' ||
          el.type === 'time' ||
          typeof (el as { height?: number }).height === 'number'
        ) {
          (next as { height: number }).height = box.height;
        }
        // Auto-height text still stores the committed height as a floor. Skia wrap can
        // undershoot RN on a narrow drag; dropping height here clipped the last lines
        // until native lines were remembered. Content edits clear it via mergeTextElementPatch.
        return next;
      };

      const isGroupResize =
        kind === 'resize' &&
        ids.length > 1 &&
        ids.includes(payload.id) &&
        resizeSnapshots &&
        resizeSnapshots.size > 1;

      if (isGroupResize) {
        const handle: 'e' | 's' = groupHandleSv.value === 1 ? 's' : 'e';
        const scaleX = groupScaleXSv.value;
        const scaleY = groupScaleYSv.value;
        setElements(
          (elements) =>
            elements.map((el) => {
              if (!ids.includes(el.id)) return el;
              const start = resizeSnapshots.get(el.id);
              if (!start) return el;
              const fs = scaledFontSizeForResize(el, handle, scaleX, scaleY, clean.fontSize);
              const live = resizeElementByScale(el, start, handle, scaleX, scaleY, canvas, fs);
              if (handle === 'e' && (el.type === 'text' || el.type === 'degrees')) {
                live.height = growTextFrameHeightForWidth(el, live.width, 0);
              }
              logMultiTransformBox('live', el.id, live);
              logMultiTransformBox('commit', el.id, live);
              let patched = patchBox(el, live, clean.rotation, fs);
              if (patched.type === 'text' || patched.type === 'degrees') {
                patched = mergeTextElementPatch(
                  patched as Extract<LabelElement, { type: 'text' } | { type: 'degrees' }>,
                  { width: patched.width, autoWrapping: 'Word' },
                  canvas,
                );
              }
              return patched;
            }),
          recordHistory,
        );
        clearGroupPreview();
        offerBulkScope(ids);
        return;
      }

      const isGroupMove =
        kind === 'move' &&
        ids.length > 1 &&
        ids.includes(payload.id) &&
        startPositions;

      if (isGroupMove) {
        const deltaLeft = groupDeltaLeftSv.value;
        const deltaTop = groupDeltaTopSv.value;
        setElements(
          (elements) =>
            elements.map((el) => {
              if (!ids.includes(el.id) || el.lockMovement || el.type === 'border') {
                return el;
              }
              const orig = startPositions.get(el.id);
              if (!orig) return el;
              const size = elementSizeMm(el);
              const live = {
                left: orig.left + deltaLeft,
                top: orig.top + deltaTop,
                width: size.width,
                height: size.height,
              };
              logMultiTransformBox('live', el.id, live);
              logMultiTransformBox('commit', el.id, live);
              return { ...el, left: live.left, top: live.top };
            }),
          recordHistory,
        );
        clearGroupPreview();
        offerBulkScope(ids);
        return;
      }

      setElements(
        (elements) =>
          elements.map((el) => {
            if (el.id !== payload.id) return el;
            const fs = clean.fontSize ?? ('fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : undefined);
            const targetHeight = clean.heightMm;
            let next: LabelElement;
            if (kind === 'resize') {
              next = patchBox(
                el,
                {
                  left: clean.leftMm,
                  top: clean.topMm,
                  width: clean.widthMm,
                  height: targetHeight,
                },
                clean.rotation,
                fs,
              );
              if (next.type === 'text' || next.type === 'degrees') {
                const textEl = next as Extract<LabelElement, { type: 'text' } | { type: 'degrees' }>;
                const widthChanged = Math.abs(clean.widthMm - el.width) > 0.02;
                if (widthChanged) {
                  next = mergeTextElementPatch(
                    textEl,
                    {
                      width: textEl.width,
                      // Keep the live-measured height so a narrow drag does not clip.
                      height: clean.heightMm,
                      autoWrapping: textEl.autoWrapping ?? 'Word',
                    },
                    canvas,
                  ) as typeof next;
                }
              }
            } else {
              const clamped = clampToLabelBounds(
                { left: clean.leftMm, top: clean.topMm, width: clean.widthMm, height: targetHeight },
                canvas,
                { anchor: 'body', naturalHeight: targetHeight },
              );
              next = patchBox(
                el,
                {
                  left: clamped.left,
                  top: clamped.top,
                  width: clamped.width,
                  height: clamped.height,
                },
                clean.rotation,
                fs,
              );
            }
            if (
              editorSettings.pictureAdsorption &&
              (next.type === 'image' || next.type === 'clipart')
            ) {
              const snapped = applyPictureAdsorption(
                next,
                elements.map((item) => (item.id === next.id ? next : item)),
                true,
              );
              if (snapped) {
                next = { ...next, ...snapped };
              }
            }
            return next;
          }),
        recordHistory,
      );
      clearGroupPreview();
      offerBulkScope(ids.includes(payload.id) ? ids : [payload.id]);
    },
    [
      setElements,
      commitBulkSlotGeometry,
      bumpHistory,
      publishSnapGuides,
      clearGroupPreview,
      groupDeltaLeftSv,
      groupDeltaTopSv,
      groupHandleSv,
      groupScaleXSv,
      groupScaleYSv,
      editorSettings.pictureAdsorption,
      resizeHudVisibleSv,
    ],
  );

  const setLockOnSelection = useCallback(
    (locked: boolean) => {
      if (selectedIds.length === 0) return;
      setElements(
        (elements) =>
          elements.map((el) =>
            selectedIds.includes(el.id) ? { ...el, lockMovement: locked } : el,
          ),
        true,
      );
    },
    [selectedIds, setElements],
  );

  const canvasMm = useMemo(
    () => ({ widthMm: doc.widthMm, heightMm: doc.heightMm }),
    [doc.widthMm, doc.heightMm],
  );

  const nudgeSelected = useCallback(
    (dxMm: number, dyMm: number) => {
      if (selectedIds.length === 0) return;
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) => {
          if (!selectedIds.includes(el.id) || el.lockMovement || el.type === 'border') return el;
          const box = boxOf(el);
          const next = nudgeBox(box.left, box.top, box.width, box.height, dxMm, dyMm, canvasMm);
          return { ...el, left: next.left, top: next.top };
        }),
      );
      scheduleHistoryCommit();
    },
    [selectedIds, setElements, canvasMm, scheduleHistoryCommit],
  );

  const rotateSelectedBy = useCallback(
    (deltaDeg: number) => {
      if (selectedIds.length === 0) return;
      setElements(
        (elements) =>
          elements.map((el) =>
            selectedIds.includes(el.id) && !el.lockMovement
              ? { ...el, rotation: normalizeRotation((el.rotation ?? 0) + deltaDeg) }
              : el,
          ),
        true,
      );
    },
    [selectedIds, setElements],
  );

  const SCALE_STEP = 1.1;
  const scaleSelectedBy = useCallback(
    (factor: number) => {
      if (selectedIds.length === 0) return;
      setElements(
        (elements) =>
          elements.map((el) =>
            selectedIds.includes(el.id) && !el.lockMovement && el.type !== 'border'
              ? scaleElementAboutCenter(el, factor, docRef.current.widthMm, docRef.current.heightMm)
              : el,
          ),
        true,
      );
    },
    [selectedIds, setElements],
  );

  const openPositionPanel = useCallback(() => {
    if (selectedIds.length !== 1 || !primaryElement) {
      setPanelOpen(true);
      return;
    }
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    const position = 'Position' as never;
    switch (primaryElement.type) {
      case 'barcode': setBarcodeTab(position); break;
      case 'image': setImageTab(position); break;
      case 'text': setTextTab(position); break;
      case 'qrcode': setQrcodeTab(position); break;
      case 'line': setLineTab(position); break;
      case 'shape': setShapeTab(position); break;
      case 'table': setTableTab(position); break;
      case 'time': setTimeTab(position); break;
      case 'arctext': setArcTextTab(position); break;
      case 'degrees': setDegreesTab(position); break;
      case 'clipart': setClipartTab(position); break;
      case 'signature': setSignatureTab(position); break;
      default: break;
    }
    setPanelOpen(true);
  }, [selectedIds.length, primaryElement, topBarSelectionVisibleSv, bottomPanelVisibleSv]);

  const alignSelected = useCallback(
    (kind: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
      if (selectedIds.length === 0) return;
      if (selectedIds.length > 1) {
        setElements(
          (elements) => {
            const patches = alignGroupBounds(elements, selectedIds, canvasMm, kind);
            return elements.map((el) => {
              if (!selectedIds.includes(el.id) || el.lockMovement || el.type === 'border') {
                return el;
              }
              const patch = patches.get(el.id);
              return patch ? { ...el, ...patch } : el;
            });
          },
          true,
        );
        return;
      }
      setElements(
        (elements) =>
          elements.map((el) => {
            if (!selectedIds.includes(el.id) || el.lockMovement || el.type === 'border') return el;
            const box = boxOf(el);
            const patch = alignBox(box.width, box.height, canvasMm, kind);
            return { ...el, ...patch };
          }),
        true,
      );
    },
    [selectedIds, setElements, canvasMm],
  );

  const copySelected = useCallback(() => {
    copyElementsToClipboard(docRef.current.elements, selectedIds);
    bumpHistory();
  }, [selectedIds, bumpHistory]);

  const pasteClipboard = useCallback(() => {
    const result = pasteElementsFromClipboard(docRef.current.elements, canvasMm);
    if (result.newIds.length === 0) return;
    setElements(() => result.elements, true);
    const next = selectionFromIds(result.newIds);
    setSelectedIds(next.ids);
    setPrimaryId(next.primaryId);
  }, [canvasMm, setElements]);

  const reorderSelected = useCallback(
    (kind: 'front' | 'back' | 'forward' | 'backward') => {
      if (selectedIds.length === 0) return;
      setElements((elements) => reorderElements(elements, selectedIds, kind), true);
    },
    [selectedIds, setElements],
  );

  const alignSelectedMembers = useCallback(
    (kind: MemberAlignKind) => {
      if (selectedIds.length < 2) return;
      setElements(
        (elements) => {
          const patches = alignMembersToEachOther(elements, selectedIds, kind);
          return elements.map((el) => {
            const patch = patches.get(el.id);
            return patch ? { ...el, ...patch } : el;
          });
        },
        true,
      );
    },
    [selectedIds, setElements],
  );

  const distributeSelectedMembers = useCallback(
    (axis: 'h' | 'v') => {
      if (selectedIds.length < 2) return;
      setElements(
        (elements) => {
          const patches = distributeMembers(elements, selectedIds, axis);
          return elements.map((el) => {
            const patch = patches.get(el.id);
            return patch ? { ...el, ...patch } : el;
          });
        },
        true,
      );
    },
    [selectedIds, setElements],
  );

  const positionLayerActions = useMemo(
    () => ({
      selectedCount: selectedIds.length,
      onAlignMembers: alignSelectedMembers,
      onDistributeMembers: distributeSelectedMembers,
    }),
    [selectedIds.length, alignSelectedMembers, distributeSelectedMembers],
  );

  const toggleHideSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const anyHidden = docRef.current.elements.some(
      (el) => selectedIds.includes(el.id) && !isEditorVisible(el),
    );
    setElements(
      (elements) =>
        elements.map((el) =>
          selectedIds.includes(el.id) ? { ...el, visible: anyHidden ? true : false } : el,
        ),
      true,
    );
  }, [selectedIds, setElements]);

  const zoomInPad = useCallback(() => {
    setPadZoom((z) => stepViewZoom(z, 1));
  }, []);
  const zoomOutPad = useCallback(() => {
    setPadZoom((z) => stepViewZoom(z, -1));
  }, []);

  const saveDocument = useCallback(
    (showToast = true) => {
      const synced = syncUpsActivePanel(docRef.current);
      if (synced !== docRef.current) {
        setDoc(synced);
        docRef.current = synced;
      }
      upsertDocument(synced);
      setSavedToStore(true);
      setDirty(false);
      if (showToast) Alert.alert('Saved', `"${synced.name}" has been saved.`);
    },
    [upsertDocument],
  );

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current || !dirtyRef.current) return;
      const synced = syncUpsActivePanel(docRef.current);
      upsertDocument(synced);
      setSavedToStore(true);
      setDirty(false);
    }, 1600);
    return () => clearTimeout(timer);
  }, [dirty, doc.elements, doc.widthMm, doc.heightMm, doc.name, upsertDocument]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background' && state !== 'inactive') return;
      if (!dirtyRef.current) return;
      upsertDocument(syncUpsActivePanel(docRef.current));
    });
    return () => sub.remove();
  }, [upsertDocument]);

  /** Back (header or hardware): unsaved edits are saved automatically, then the editor closes. */
  const requestLeave = useCallback(() => {
    if (dirtyRef.current) saveDocument(false);
    goBack();
  }, [saveDocument]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        requestLeave();
        return true;
      });
      return () => sub.remove();
    }, [requestLeave]),
  );

  const handleSaveAs = useCallback(() => {
    setSaveAsName(doc.name);
    setSaveAsVisible(true);
  }, [doc.name]);

  const confirmSaveAs = useCallback(() => {
    const name = saveAsName.trim();
    if (!name) {
      setSaveAsVisible(false);
      return;
    }
    const copy = JSON.parse(JSON.stringify(docRef.current)) as LabelDocument;
    copy.id = generateId('label');
    copy.name = name;
    copy.createdAt = Date.now();
    setDoc(copy);
    upsertDocument(copy);
    setSavedToStore(true);
    setDirty(false);
    setSaveAsVisible(false);
  }, [saveAsName, upsertDocument]);

  const openDocument = useCallback((docToOpen: LabelDocument) => {
    const copy = hydrateBulkDocument(
      JSON.parse(JSON.stringify(docToOpen)) as LabelDocument,
      useDataStore.getState().excelFiles,
    );
    setDoc(copy);
    setSavedToStore(true);
    setDirty(false);
    setSelectedIds([]);
    setPrimaryId(null);
    referenceSelectedRef.current = false;
    setReferenceSelected(false);
    setPanelOpen(false);
    historyRef.current.clear();
    bumpHistory();
    setShowOpenModal(false);
  }, [bumpHistory]);

  const handleRotateElement = useCallback(
    (id: string) => {
      setElements(
        (items) =>
          items.map((el) => {
            if (el.id !== id) return el;
            return { ...el, rotation: normalizeRotation((el.rotation ?? 0) + 90) };
          }),
        true,
      );
    },
    [setElements],
  );

  const handlePadLayout = useCallback((size: { width: number; height: number }) => {
    if (splitDraggingRef.current) return;
    setPadInner((prev) => {
      const width = Math.round(size.width);
      if (Math.abs(prev.width - width) < 1) return prev;
      return { width, height: 0 };
    });
  }, []);

  const handlePrint = useCallback(() => {
    saveDocument(false);
    router.push({
      pathname: '/print',
      params: { labelId: docRef.current.id, ...(showSerialBar ? { serialIndex: String(serialIdx) } : {}) },
    });
  }, [saveDocument, showSerialBar, serialIdx]);

  const savedBulkCopies = doc.bulk?.rowCopiesOverrides?.[String(doc.bulk.activeRowIndex)];
  const bulkCopiesValue =
    typeof savedBulkCopies === 'number' &&
    Number.isInteger(savedBulkCopies) &&
    savedBulkCopies >= 1 &&
    savedBulkCopies <= 99
      ? savedBulkCopies
      : doc.bulk && bulkSheet
        ? resolveRowCopies(
            bulkSheet,
            doc.bulk.activeRowIndex,
            doc.bulk.copiesColumnIndex,
            doc.bulk.rowCopiesOverrides,
          )
        : 1;

  const commitBulkCopies = useCallback((nextCount: number) => {
    const current = docRef.current;
    if (!current.bulk) return;
    const key = String(current.bulk.activeRowIndex);
    if (current.bulk.rowCopiesOverrides?.[key] === nextCount) return;
    const next = {
      ...current,
      bulk: {
        ...current.bulk,
        rowCopiesOverrides: { ...(current.bulk.rowCopiesOverrides ?? {}), [key]: nextCount },
      },
    };
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  }, []);

  const applyLabelSize = useCallback(
    (widthMm: number, heightMm: number, mode: StockSizeHandling) => {
      if (isRatTail143Document(docRef.current)) return;
      const files = useDataStore.getState().excelFiles;
      const next = applyDocumentStockSize(docRef.current, widthMm, heightMm, mode, files);
      docRef.current = next;
      setDoc(next);
      upsertDocument(syncUpsActivePanel(next));
      setSavedToStore(true);
      setDirty(false);
      historyRef.current.clear();
      bumpHistory();
    },
    [bumpHistory, upsertDocument],
  );

  const placeIngestedImageOnCanvas = useCallback(
    async (uri: string, width?: number, height?: number) => {
      setImageIngesting(true);
      try {
        const ingested = await ingestEditorImage({
          uri,
          width,
          height,
        });
        if (!mountedRef.current) return;
        const current = docRef.current;
        const content = isRatTailGeometry(current.mediaGeometry)
          ? ratTailBodyRectMm(current.mediaGeometry)
          : isJewelryDieCutDocument(current)
            ? { left: 0, top: 0, width: current.widthMm, height: Math.min(current.heightMm, JEWELRY_DIECUT.bodyHeightMm) }
            : undefined;
        const placed = defaults.tileImage
          ? {
              left: content?.left ?? 0,
              top: content?.top ?? 0,
              width: content?.width ?? current.widthMm,
              height: content?.height ?? current.heightMm,
            }
          : placeImportedImageMm({
              widthPx: ingested.widthPx,
              heightPx: ingested.heightPx,
              pxPerMM,
              canvas: { widthMm: current.widthMm, heightMm: current.heightMm },
              content,
            });
        const el = addElement('image', {
          uri: ingested.previewUri,
          printUri: ingested.printUri,
          left: placed.left,
          top: placed.top,
          width: placed.width,
          height: placed.height,
          contentFit: defaults.tileImage ? 'fill' : 'contain',
          aspectRatioLocked: !defaults.tileImage,
          originalAspect: ingested.originalAspect,
          workingWidthPx: ingested.workingWidthPx,
          workingHeightPx: ingested.workingHeightPx,
        });
        if (el) {
          setImageTab('Regular');
          setPanelOpen(true);
        }
      } catch (error) {
        if (!mountedRef.current) return;
        Alert.alert(
          'Could not place photo',
          error instanceof Error ? error.message : 'The image could not be decoded.',
        );
      } finally {
        if (mountedRef.current) setImageIngesting(false);
      }
    },
    [addElement, pxPerMM, defaults.tileImage],
  );

  const applyCroppedImageToElement = useCallback(
    async (
      elementId: string,
      uri: string,
      width?: number,
      height?: number,
      mode: 'replace' | 'recrop' = 'recrop',
      cropNorm?: NormalizedCrop,
    ) => {
      setImageIngesting(true);
      try {
        const ingested = await ingestEditorImage({
          uri,
          width,
          height,
          printFormat: cropFormatFromUri(uri) === 'png' ? 'png' : undefined,
        });
        if (!mountedRef.current) return;
        const current = docRef.current;
        const el = current.elements.find((item) => item.id === elementId);
        const next: Record<string, unknown> = {
          uri: ingested.previewUri,
          printUri: ingested.printUri,
          originalAspect: ingested.originalAspect,
          workingWidthPx: ingested.workingWidthPx,
          workingHeightPx: ingested.workingHeightPx,
          contentFit: 'contain',
          aspectRatioLocked: true,
        };
        if (el && el.type === 'image') {
          const box =
            mode === 'recrop'
              ? applySourceCropToElementMm(
                  { left: el.left, top: el.top, width: el.width, height: el.height },
                  cropNorm ?? FULL_CROP,
                )
              : { left: el.left, top: el.top, width: el.width, height: el.height };
          const placed = containFitImageOnLabel(
            { widthMm: current.widthMm, heightMm: current.heightMm },
            { widthPx: ingested.widthPx, heightPx: ingested.heightPx },
            box,
          );
          next.left = placed.left;
          next.top = placed.top;
          next.width = placed.width;
          next.height = placed.height;
        }
        patchElement(elementId, next);
      } catch (error) {
        if (!mountedRef.current) return;
        Alert.alert(
          'Could not update photo',
          error instanceof Error ? error.message : 'The image could not be decoded.',
        );
      } finally {
        if (mountedRef.current) setImageIngesting(false);
      }
    },
    [patchElement],
  );

  const handlePickImage = useCallback(async () => {
    const asset = await pickImageAsset();
    if (!mountedRef.current || !asset) return;

    router.push({
      pathname: '/image-crop',
      params: {
        uri: asset.uri,
        width: String(asset.width),
        height: String(asset.height),
        mode: 'import',
      },
    });
  }, [pickImageAsset]);

  useEffect(() => {
    const keep = collectImageFileUris([
      doc.elements,
      ...historyRef.current.retainedSnapshots(),
      ...savedDocuments.map((item) => item.elements),
    ]);
    void sweepEditorImageFiles(keep);
  }, [doc.elements, historyRev, savedDocuments]);

  useEffect(() => {
    const rehydrateBulk = () => {
      setDoc((prev) => {
        if (!prev.bulk) return prev;
        const next = hydrateBulkDocument(prev, useDataStore.getState().excelFiles);
        const projected = JSON.stringify(next.elements);
        const current = JSON.stringify(prev.elements);
        return projected === current ? prev : next;
      });
    };

    const unsub = useDataStore.persist.onFinishHydration(rehydrateBulk);
    if (useDataStore.persist.hasHydrated()) rehydrateBulk();
    return unsub;
  }, []);

  useEffect(() => {
    if (!doc.bulk || !bulkSheet) return;
    setDoc((prev) => {
      if (!prev.bulk) return prev;
      const sheet = resolveBulkSheet(excelFiles, prev.bulk);
      if (!sheet) return prev;
      const next = projectBulkDocument(prev, sheet, prev.bulk.activeRowIndex);
      const projected = JSON.stringify(next.elements);
      const current = JSON.stringify(prev.elements);
      return projected === current ? prev : next;
    });
  }, [bulkSheet, doc.bulk?.excelFileId, doc.bulk?.activeRowIndex, doc.id, excelFiles]);

  useFocusEffect(
    useCallback(() => {
      const stored = useLabelStore.getState().getDocument(docRef.current.id);
      if (stored && stored.updatedAt > docRef.current.updatedAt && !dirtyRef.current) {
        let normalized = hydrateBulkDocument(
          { ...stored, elements: normalizeDocumentElements(stored) },
          useDataStore.getState().excelFiles,
        );
        if (isJewelryDieCutDocument(normalized)) {
          normalized = canonicalizeJewelryDieCutDocument(normalized);
        } else if (isRatTail143Document(normalized)) {
          normalized = refitRatTail143Document(normalized);
        }
        setDoc(normalized);
        docRef.current = normalized;
      }

      const applyCapture = (kind: 'Text' | 'Barcode' | 'QRCode', data: string, encodeMode?: string) => {
        // Prefer the stashed scanConsumer (survives remount), then the live cell selection.
        const consumer = editorBridge.scanConsumer;
        editorBridge.scanConsumer = null;
        const cellTarget: SelectedTableCell | null =
          consumer?.kind === 'tableCell'
            ? { tableId: consumer.tableId, row: consumer.row, col: consumer.col }
            : selectedTableCellRef.current;
        const preferredElementId =
          consumer?.kind === 'element' ? consumer.elementId : null;

        // A table cell only ever holds text, so a decoded scan lands as plain Manual
        // content there — never as a barcode/QR graphic, whatever the symbology was.
        if (cellTarget) {
          const written = patchTableCellAt(cellTarget, { text: data, contentType: 'Manual' });
          console.log(
            `[table-cell] scan-write kind=${kind} target=${JSON.stringify(cellTarget)} textLen=${data.length} written=${written} as=Manual-text`,
          );
          if (written) {
            // Restore selection chrome after /scan (edit may have remounted).
            selectedIdsRef.current = [cellTarget.tableId];
            primaryIdRef.current = cellTarget.tableId;
            setSelectedIds([cellTarget.tableId]);
            setPrimaryId(cellTarget.tableId);
            commitSelectedTableCell(cellTarget);
            activeSelectedIdSv.value = cellTarget.tableId;
            topBarSelectionVisibleSv.value = 1;
            bottomPanelVisibleSv.value = 1;
            setTextTab('Content');
            setPanelOpen(true);
            return;
          }
        }
        // A scan into a selected barcode / QR code updates its value instead of adding another.
        const pickedId =
          preferredElementId ??
          (selectedIdsRef.current.length === 1 ? selectedIdsRef.current[0] : null);
        const picked =
          pickedId != null ? docRef.current.elements.find((el) => el.id === pickedId) : undefined;
        if (kind === 'QRCode' && picked?.type === 'qrcode') {
          patchElement(picked.id, {
            contentType: 'Manual',
            content: data,
            encodeMode: encodeMode ?? picked.encodeMode ?? 'QRCode',
          });
          setQrcodeTab('Content');
          setPanelOpen(true);
          return;
        }
        if (kind === 'Barcode' && picked?.type === 'barcode') {
          patchElement(picked.id, {
            contentType: 'Manual',
            content: data,
            // CODE-128 is the scanner's fallback, so it must not overwrite a chosen symbology.
            encodeMode:
              encodeMode && encodeMode !== 'CODE-128' ? encodeMode : picked.encodeMode ?? 'CODE-128',
          });
          setBarcodeTab('Content');
          setPanelOpen(true);
          return;
        }
        if (kind === 'QRCode') {
          addElement('qrcode', {
            contentType: 'Manual',
            content: data,
            encodeMode: encodeMode ?? 'QRCode',
          });
          setQrcodeTab('Content');
          setPanelOpen(true);
        } else if (kind === 'Barcode') {
          addElement('barcode', {
            contentType: 'Manual',
            content: data,
            encodeMode: encodeMode ?? 'CODE-128',
          });
          setBarcodeTab('Content');
          setPanelOpen(true);
        } else {
          const selectedId =
            selectedIds.length === 1 ? selectedIds[0] : null;
          const selected =
            selectedId != null
              ? docRef.current.elements.find((el) => el.id === selectedId)
              : undefined;
          if (selected?.type === 'text') {
            patchElement(selected.id, { text: data, contentType: 'Manual' });
            setTextTab('Content');
            setPanelOpen(true);
            return;
          }
          addElement('text', { text: data, contentType: 'Manual' });
          setTextTab('Content');
          setPanelOpen(true);
        }
      };

      if (editorBridge.asrResult) {
        const { type, data } = editorBridge.asrResult;
        editorBridge.asrResult = null;
        applyCapture(type === 'QRCode' ? 'QRCode' : type === 'Barcode' ? 'Barcode' : 'Text', data);
      }

      if (editorBridge.ocrResult) {
        const { type, data } = editorBridge.ocrResult;
        editorBridge.ocrResult = null;
        applyCapture(type === 'QRCode' ? 'QRCode' : type === 'Barcode' ? 'Barcode' : 'Text', data);
      }

      if (editorBridge.scanResult) {
        const { type, data } = editorBridge.scanResult;
        editorBridge.scanResult = null;
        if (isQrScanType(type)) {
          applyCapture(
            'QRCode',
            data,
            type.toLowerCase() === 'pdf417'
              ? 'PDF417'
              : type.toLowerCase() === 'datamatrix'
              ? 'DataMatrix'
              : 'QRCode',
          );
        } else if (type !== 'MANUAL' || /^\d+$/.test(data)) {
          applyCapture('Barcode', data, barcodeEncodeModeForScanType(type));
        } else {
          applyCapture('Text', data);
        }
      }

      if (editorBridge.columnNameResult !== null) {
        const value = editorBridge.columnNameResult;
        const consumer = editorBridge.columnNameConsumer;
        editorBridge.columnNameResult = null;
        editorBridge.columnNameConsumer = null;
        const tableCell = selectedTableCellRef.current;
        if (consumer && tableCell) {
          patchTableCellAt(tableCell, { columnNameContent: value, contentType: 'Data Source' });
        } else if (consumer && selectedIdsRef.current.length === 1) {
          patchElement(
            selectedIdsRef.current[0],
            consumer === 'image'
              ? { columnNameContent: value, contentType: 'Data Source' }
              : { columnNameContent: value },
          );
        }
      }

      if (editorBridge.clipartResult) {
        const clipart = editorBridge.clipartResult;
        editorBridge.clipartResult = null;
        const replaceId = clipartReplaceIdRef.current;
        clipartReplaceIdRef.current = null;
        const placement = clipartPendingPlacementRef.current;
        clipartPendingPlacementRef.current = null;
        const existing =
          replaceId != null
            ? docRef.current.elements.find((el) => el.id === replaceId && el.type === 'clipart')
            : undefined;
        if (existing) {
          patchElement(existing.id, { clipartId: clipart.id });
        } else {
          addElement('clipart', {
            clipartId: clipart.id,
            ...(placement ?? {}),
          });
        }
        setClipartTab('Regular');
        setPanelOpen(true);
        topBarSelectionVisibleSv.value = 1;
        bottomPanelVisibleSv.value = 1;
      }

      if (editorBridge.borderResult) {
        const result = editorBridge.borderResult;
        editorBridge.borderResult = null;
        const acrossNow = acrossLayout(docRef.current);
        if (acrossNow) {
          const scope = borderScopeRef.current ?? currentBorderScope(docRef.current);
          borderScopeRef.current = null;
          applyBorderAcross(
            scope,
            isBorderRemoval(result) ? null : { borderStyle: result.style, lineWidth: result.lineWidth, edgeGapMm: result.edgeGapMm },
          );
          selectedIdsRef.current = [];
          primaryIdRef.current = null;
          activeSelectedIdSv.value = '';
          topBarSelectionVisibleSv.value = 0;
          bottomPanelVisibleSv.value = 0;
          setSelectedIds([]);
          setPrimaryId(null);
          setPanelOpen(false);
        } else if (isBorderRemoval(result)) {
          setElements((elements) => elements.filter((el) => el.type !== 'border'), true);
        } else {
          const existingBorder = docRef.current.elements.find((el) => el.type === 'border');
          const keepSettings =
            existingBorder != null && selectedIdsRef.current.includes(existingBorder.id);
          const box = borderBoxForCenterGap(
            docRef.current.widthMm,
            docRef.current.heightMm,
            result.edgeGapMm,
            result.lineWidth,
          );
          const patch = {
            borderStyle: result.style,
            lineWidth: result.lineWidth,
            edgeGapMm: result.edgeGapMm,
            geometryVersion: 1 as const,
            ...box,
          };
          if (existingBorder) {
            patchElement(existingBorder.id, patch);
          } else {
            addElement('border', patch);
          }
          if (!keepSettings) {
            selectedIdsRef.current = [];
            primaryIdRef.current = null;
            activeSelectedIdSv.value = '';
            topBarSelectionVisibleSv.value = 0;
            bottomPanelVisibleSv.value = 0;
            setSelectedIds([]);
            setPrimaryId(null);
            setPanelOpen(false);
          }
        }
      }

      if (editorBridge.fontResult) {
        const fontName = editorBridge.fontResult;
        editorBridge.fontResult = null;
        if (!isFontNameReady(fontName, useInstalledFontStore.getState().items)) {
          Alert.alert(
            'Download font first',
            'This font must be downloaded in the font library before you can use it on a label.',
          );
        } else {
          const tableCell = selectedTableCellRef.current;
          const targetId = primaryIdRef.current;
          if (tableCell) {
            patchTableCellAt(tableCell, { fontFamily: fontName });
          } else if (targetId) {
            const el = docRef.current.elements.find((e) => e.id === targetId);
            if (el && 'fontFamily' in el) {
              patchElement(el.id, { fontFamily: fontName });
            }
          }
        }
      }

      if (editorBridge.imageCropResult) {
        const crop = editorBridge.imageCropResult;
        editorBridge.imageCropResult = null;
        if (crop.mode === 'import') {
          void placeIngestedImageOnCanvas(crop.uri, crop.width, crop.height);
        } else if (crop.elementId) {
          void applyCroppedImageToElement(
            crop.elementId,
            crop.uri,
            crop.width,
            crop.height,
            crop.mode === 'replace' ? 'replace' : 'recrop',
            crop.crop,
          );
        }
      }
    }, [
      addElement,
      patchElement,
      setElements,
      patchTableCellAt,
      commitSelectedTableCell,
      placeIngestedImageOnCanvas,
      applyCroppedImageToElement,
      activeSelectedIdSv,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
    ]),
  );

  // Reload when navigated to an existing label while the screen is mounted.
  const lastLoadedKey = useRef<string | undefined>(
    params.labelId ? `${params.labelId}:${params.excelBulkRefresh ?? ''}` : undefined,
  );
  useEffect(() => {
    if (!params.labelId) return;
    const loadKey = `${params.labelId}:${params.excelBulkRefresh ?? ''}`;
    if (loadKey === lastLoadedKey.current) return;
    lastLoadedKey.current = loadKey;
    const existing = useLabelStore.getState().getDocument(params.labelId);
    if (existing) openDocument(existing);
  }, [params.labelId, params.excelBulkRefresh, openDocument]);

  const handleColumnNamePress = useCallback(() => {
    const tableCell = selectedTableCellRef.current;
    if (
      tableCell &&
      selectedElement?.type === 'table' &&
      selectedElement.id === tableCell.tableId
    ) {
      const table = ensureTableCells(selectedElement);
      const cell = table.cells![tableCell.row][tableCell.col];
      editorBridge.columnNameConsumer = 'text';
      router.push({
        pathname: '/column-name',
        params: { value: cell.columnNameContent ?? '' },
      });
      return;
    }
    if (!selectedElement) return;
    if (!('columnNameContent' in selectedElement) && selectedElement.type !== 'image') return;
    editorBridge.columnNameConsumer =
      selectedElement.type === 'text'
        ? 'text'
        : selectedElement.type === 'barcode'
        ? 'barcode'
        : selectedElement.type === 'arctext'
        ? 'arctext'
        : selectedElement.type === 'degrees'
        ? 'degrees'
        : selectedElement.type === 'image'
        ? 'image'
        : 'qrcode';
    router.push({
      pathname: '/column-name',
      params: {
        value:
          'columnNameContent' in selectedElement ? selectedElement.columnNameContent ?? '' : '',
      },
    });
  }, [selectedElement]);

  const openLabelMenu = () => {
    toolbarRef.current?.measureInWindow((_x, y, _w, h) => {
      setLabelMenuTop(y + h);
      setShowLabelMenu(true);
    });
  };

  const openAddedElementPanel = useCallback((label: string) => {
    // Same tick as addElement — panels are already keep-alive mounted, so this is just
    // shared-value chrome + tab reset + setPanelOpen (batched with the insert).
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    switch (label) {
      case 'Text':
        setTextTab('Regular');
        break;
      case 'Barcode':
        setBarcodeTab('Regular');
        break;
      case 'QRCode':
        setQrcodeTab('Regular');
        break;
      case 'Line':
        setLineTab('Regular');
        break;
      case 'Shapes':
        setShapeTab('Regular');
        break;
      case 'Time':
        setTimeTab('Regular');
        break;
      case 'ArcText':
        setArcTextTab('Regular');
        break;
      case 'Degrees':
        setDegreesTab('Regular');
        break;
      case 'Clipart':
        setClipartTab('Regular');
        break;
      case 'Signature':
        setSignatureTab('Regular');
        break;
      case 'Table':
        setTableTab('Regular');
        break;
      default:
        break;
    }
    setPanelOpen(true);
  }, [topBarSelectionVisibleSv, bottomPanelVisibleSv]);

  const beginPaletteDrag = useCallback((
    type: ElementType,
    label: string,
    icon: AppIconName,
    windowX: number,
    windowY: number,
  ) => {
    const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
    const size = paletteDefaultSizeMm(type, canvas, docRef.current.elements);
    const ghostPx = paletteGhostSizePx(size.widthMm, size.heightMm);
    paletteGhostRef.current = { type, label, widthMm: size.widthMm, heightMm: size.heightMm };
    setPaletteGhost({
      windowX,
      windowY,
      widthPx: ghostPx.widthPx,
      heightPx: ghostPx.heightPx,
      icon,
    });
  }, []);

  const movePaletteDrag = useCallback(
    (windowX: number, windowY: number) => {
      setPaletteGhost((prev) => (prev ? { ...prev, windowX, windowY } : prev));
      const ghost = paletteGhostRef.current;
      if (!ghost) return;
      const mm = windowPointToArtboardMm(windowX, windowY);
      const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
      if (!mm || !isPaletteDropOnArtboard(mm, canvas)) {
        publishSnapGuides([]);
        return;
      }
      publishSnapGuides([]);
    },
    [publishSnapGuides, windowPointToArtboardMm],
  );

  const endPaletteDrag = useCallback(
    (windowX: number, windowY: number) => {
      const ghost = paletteGhostRef.current;
      paletteGhostRef.current = null;
      setPaletteGhost(null);
      publishSnapGuides([]);
      if (!ghost) return;
      const mm = windowPointToArtboardMm(windowX, windowY);
      const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
      if (!mm || !isPaletteDropOnArtboard(mm, canvas)) return;
      const placed = paletteDropTopLeftMm({
        pointerMm: mm,
        widthMm: ghost.widthMm,
        heightMm: ghost.heightMm,
        canvas,
        thresholdMm: 0,
      });
      const overrides: Record<string, unknown> = {
        left: placed.left,
        top: placed.top,
        width: ghost.widthMm,
      };
      if (ghost.type !== 'text' && ghost.type !== 'degrees' && ghost.type !== 'time') {
        overrides.height = ghost.heightMm;
      }
      if (ghost.type === 'clipart') {
        clipartReplaceIdRef.current = null;
        clipartPendingPlacementRef.current = {
          left: placed.left,
          top: placed.top,
          width: ghost.widthMm,
          height: ghost.heightMm,
        };
        router.push({ pathname: '/clipart', params: { from: 'edit' } });
        return;
      }
      if (ghost.label === 'Serial' || ghost.label === 'Counter') {
        if (docRef.current.ups) {
          Alert.alert('Serial labels', 'Serial labels are not available on multi-up labels yet.');
          return;
        }
        Object.assign(overrides, storedValuePatch(defaultSerialConfig('001'), 'content'));
      }
      addElement(ghost.type, overrides);
      openAddedElementPanel(ghost.label === 'Serial' || ghost.label === 'Counter' ? 'Degrees' : ghost.label);
    },
    [addElement, openAddedElementPanel, publishSnapGuides, windowPointToArtboardMm],
  );

  const importExcelFromCanvas = async () => {
    try {
      const picked = await importExcel();
      if (!picked) return;
      const storedUri = await stageImportedFile('excel', picked.uri, picked.name);
      const entry = useDataStore.getState().addExcelFile({
        name: picked.name,
        uri: storedUri,
        sheets: picked.sheets,
        activeSheetIndex: 0,
        hasHeaderRow: picked.hasHeaderRow,
        dataStartRow: picked.dataStartRow,
      });
      const current = docRef.current;
      upsertDocument(current);
      const size = clampLabelMm(current.widthMm, current.heightMm);
      const navigateToPreview = () => {
        router.push({
          pathname: '/excel-data-preview',
          params: {
            excelFileId: entry.id,
            widthMm: String(size.widthMm),
            heightMm: String(size.heightMm),
            targetLabelId: current.id,
          },
        });
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => navigateToPreview());
      } else {
        navigateToPreview();
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Unable to pick or parse the document.',
      );
    }
  };

  /** Labels across: pick one border per label or one around all of them, or change what is there. */
  const openAcrossBorderChoice = () => {
    const cur = docRef.current;
    const toLibrary = (scope: BorderScope, extra: Record<string, string> = {}) => {
      borderScopeRef.current = scope;
      router.push({
        pathname: '/border-library',
        params: { from: 'edit', ...(cur.mediaShape ? { mediaShape: cur.mediaShape } : {}), ...extra },
      });
    };
    if (!hasAnyBorder(cur)) {
      Alert.alert('Border', 'One border on each label, or one around all of them?', [
        { text: 'Each label', onPress: () => toLibrary('separate') },
        { text: 'Around all', onPress: () => toLibrary('unified') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    const scope = currentBorderScope(cur);
    const own = cur.elements.find((el) => el.type === 'border');
    const other: BorderScope = scope === 'separate' ? 'unified' : 'separate';
    const sheet = cur.ups?.sheetBorder;
    Alert.alert('Border', scope === 'separate' ? 'Each label has its own border.' : 'One border goes around all the labels.', [
      {
        text: 'Edit settings',
        onPress: () => {
          if (own) handleSelect(own.id, 'menu');
          else if (sheet) toLibrary('unified', { style: sheet.borderStyle, edgeGap: String(sheet.edgeGapMm), hasBorder: '1' });
        },
      },
      { text: other === 'unified' ? 'Switch to one around all' : 'Switch to each label', onPress: () => toLibrary(other) },
      { text: 'Remove border', style: 'destructive', onPress: () => applyBorderAcross(scope, null) },
    ]);
  };

  const handleToolPress = (label: string) => {
    setShowLabelMenu(false);
    // Insert first — never mount a property panel before the element hits the canvas.
    switch (label) {
      case 'Text':
        addElement('text');
        openAddedElementPanel(label);
        break;
      case 'Barcode':
        addElement('barcode');
        openAddedElementPanel(label);
        break;
      case 'QRCode':
        addElement('qrcode');
        openAddedElementPanel(label);
        break;
      case 'Line':
        addElement('line');
        openAddedElementPanel(label);
        break;
      case 'Shapes':
        addElement('shape');
        openAddedElementPanel(label);
        break;
      case 'Table':
        setPickerRows(2);
        setPickerColumns(3);
        setShowTablePicker(true);
        break;
      case 'Time':
        addElement('time');
        openAddedElementPanel(label);
        break;
      case 'ArcText':
        addElement('arctext');
        openAddedElementPanel(label);
        break;
      case 'Serial':
      case 'Counter':
        if (docRef.current.ups) {
          Alert.alert('Serial labels', 'Serial labels are not available on multi-up labels yet.');
          break;
        }
        addElement('degrees', storedValuePatch(defaultSerialConfig('001'), 'content'));
        openAddedElementPanel('Degrees');
        break;
      case 'Degrees':
        addElement('degrees');
        openAddedElementPanel('Degrees');
        break;
      case 'Image':
        void handlePickImage();
        break;
      case 'Clipart': {
        clipartReplaceIdRef.current = null;
        clipartPendingPlacementRef.current = null;
        router.push({ pathname: '/clipart', params: { from: 'edit' } });
        break;
      }
      case 'Border': {
        const layout = acrossLayout(docRef.current);
        if (layout) {
          openAcrossBorderChoice();
          break;
        }
        const border = docRef.current.elements.find((el) => el.type === 'border');
        // An existing border opens its settings (thickness, gap, replace, cancel), not the gallery.
        // Borders cannot be selected on the canvas — only via this menu entry.
        if (border) {
          handleSelect(border.id, 'menu');
          break;
        }
        router.push({
          pathname: '/border-library',
          params: { from: 'edit', ...(doc.mediaShape ? { mediaShape: doc.mediaShape } : {}) },
        });
        break;
      }
      case 'Excel':
        void importExcelFromCanvas();
        break;
      case 'Scan':
        handleContentScanPress();
        break;
      case 'OCR': {
        const cell = selectedTableCellRef.current;
        if (cell) {
          editorBridge.scanConsumer = {
            kind: 'tableCell',
            tableId: cell.tableId,
            row: cell.row,
            col: cell.col,
          };
        } else if (selectedIdsRef.current.length === 1) {
          editorBridge.scanConsumer = {
            kind: 'element',
            elementId: selectedIdsRef.current[0],
          };
        } else {
          editorBridge.scanConsumer = null;
        }
        router.push({ pathname: '/ocr', params: { from: 'edit' } });
        break;
      }
      case 'Line Emoji':
        clipartReplaceIdRef.current = null;
        clipartPendingPlacementRef.current = null;
        router.push({ pathname: '/clipart', params: { from: 'edit', mode: 'emoji' } });
        break;
      case 'Signature':
        signatureBoardIntentRef.current = 'create';
        setShowSignatureBoard(true);
        break;
      default:
        break;
    }
  };

  const handleSignatureConfirm = (strokes: SignatureStroke[]) => {
    const intent = signatureBoardIntentRef.current;
    const selectedSignature =
      intent === 'edit'
        ? (docRef.current.elements.find(
            (el): el is Extract<LabelElement, { type: 'signature' }> =>
              el.id === (primaryIdRef.current ?? selectedIdsRef.current[0]) && el.type === 'signature',
          ) ?? null)
        : null;
    if (selectedSignature) {
      patchElement(selectedSignature.id, { strokes });
    } else if (strokes.length > 0) {
      const size = Math.min(docRef.current.widthMm, docRef.current.heightMm) * 0.6;
      const added = addElement('signature', { strokes, width: size, height: size });
      if (added) {
        openAddedElementPanel('Signature');
      }
    }
    setShowSignatureBoard(false);
  };

  const handleTablePickerConfirm = () => {
    const tableState = createTableState(pickerRows, pickerColumns);
    addElement('table', {
      rowCount: tableState.rowCount,
      columnCount: tableState.columnCount,
    });
    setShowTablePicker(false);
    openAddedElementPanel('Table');
  };

  const closePanel = () => {
    commitTextEdit();
    bottomPanelVisibleSv.value = withTiming(0, { duration: 160, easing: smoothEasing });
    setPanelOpen(false);
  };

  const canUndo = historyRev >= 0 && historyRef.current.canUndo;
  const canRedo = historyRev >= 0 && historyRef.current.canRedo;

  const renderToolbar = () => (
    <View
      ref={(node) => {
        toolbarRef.current = node;
        registerWalkthroughTarget('edit.toolbar', node);
      }}
      collapsable={false}
      style={styles.toolbarRow}>
      <ToolbarItem
        name="Label"
        label="Label"
        active={showLabelMenu}
        onPress={openLabelMenu}
      />
      <ToolbarItem
        name="Multiple"
        label="Multiple"
        active={multipleMode}
        onPress={toggleMultipleMode}
      />
      <ToolbarItem
        name="Undo"
        label="Undo"
        disabled={!canUndo}
        onPress={undo}
      />
      <ToolbarItem
        name="Redo"
        label="Redo"
        disabled={!canRedo}
        onPress={redo}
      />
      <ToolbarItem
        name="Lock"
        label="Lock"
        disabled={selectedIds.length === 0}
        onPress={() => setLockOnSelection(true)}
      />
      <ToolbarItem
        name="UnLock"
        label="UnLock"
        disabled={selectedIds.length === 0}
        onPress={() => setLockOnSelection(false)}
      />
      <CanvasPanelDivider
        variant="toolbar"
        canvasHeightPx={canvasSplitH}
        canvasHeightSv={canvasHeightSv}
        isDraggingSv={isDividerDraggingSv}
        viewportPx={
          splitViewportForCanvas > 0
            ? splitViewportForCanvas
            : canvasSplitH + panelMinForSplit
        }
        panelMinPx={panelMinForSplit}
        onDragStart={handleSplitDragStart}
        onDragEnd={handleSplitDragEnd}
        onDragCancel={handleSplitDragCancel}
      />
    </View>
  );

  const renderContextualToolbar = () => (
    <View style={styles.contextualTopBar}>
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={handleDeselectAll}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back">
        <AppIcon name="chevron.left" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={deleteSelected}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Delete selected element">
        <AppIcon name="trash" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => rotateSelectedBy(90)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Rotate selected element 90 degrees">
        <AppIcon name="arrow.clockwise" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => scaleSelectedBy(1 / SCALE_STEP)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Make selected element smaller">
        <AppIcon name="minus" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => scaleSelectedBy(SCALE_STEP)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Make selected element bigger">
        <AppIcon name="plus" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={openPositionPanel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Move and position">
        <AppIcon name="arrow.up.and.down.and.arrow.left.and.right" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={duplicateSelected}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Duplicate selected element">
        <AppIcon name="square.on.square" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() =>
          setLockOnSelection(!selectedElements.every((el) => el.lockMovement))
        }
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          selectedElements.every((el) => el.lockMovement) ? 'Unlock element' : 'Lock element'
        }>
        <AppIcon
          name={selectedElements.every((el) => el.lockMovement) ? 'lock.open' : 'lock'}
          tintColor="#FFFFFF" // theme-fixed: white icon on the dark contextual bar
          size={18}
        />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => {
          if (referenceSelected && doc.referenceImage) {
            bottomPanelVisibleSv.value = 1;
            setPanelOpen(true);
            return;
          }
          if (selectedIds.length > 1) {
            setPanelOpen(true);
          } else if (primaryElement) {
            openPropertyPanelFor(primaryElement.id);
          }
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Element properties">
        <AppIcon name="slider.horizontal.3" tintColor="#FFFFFF" size={18} /* theme-fixed: white icon on the dark contextual bar */ />
      </Pressable>
    </View>
  );

  const renderCanvas = () => (
    <Animated.View
      pointerEvents={splitDragging ? 'none' : 'auto'}
      style={[styles.stage, stageAnimatedStyle, { minHeight: 0, backgroundColor: stageBg }]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && Math.abs(next - stageWidth) > 1) {
          setStageWidth(next);
        }
      }}>
      <ZoomableEditPad
        style={styles.stageZoom}
        zoom={padZoom}
        onZoomChange={setPadZoom}
        onViewTransformChange={handleViewTransformChange}
        onViewportLayout={handlePadLayout}
        onWindowOriginChange={handlePadWindowOrigin}
        oneFingerPanEnabled={selectedIds.length === 0}
        doubleTapEnabled={false}>
        <View style={[styles.workspace, { backgroundColor: stageBg }]} pointerEvents="box-none">
          {selectedIds.length > 0 ? (
            <Pressable
              accessibilityLabel="Deselect"
              onPress={handleDeselectAll}
              style={StyleSheet.absoluteFillObject}
            />
          ) : null}
          <View
            style={[
              styles.rulerFrame,
              {
                width: rulerSize + innerWidthPx,
                height: rulerSize + innerHeightPx,
              },
            ]}>
            <Animated.View
              style={[
                styles.flushCanvasAssembly,
                canvasAssemblyAnimatedStyle,
                {
                  left: boardOffsetXPx,
                  top: boardOffsetYPx,
                  width: rulerSize + (canvasWidthPx || 1),
                  height: rulerSize + (canvasHeightPx || 1),
                },
                (doc.mediaShape === 'circle' || doc.mediaShape === 'ellipse' || dieCutPad) && {
                  backgroundColor: 'transparent',
                  shadowOpacity: 0,
                  elevation: 0,
                },
              ]}>
              {showRulers ? (
              <View style={styles.rulerTopRow} pointerEvents="none">
                <RulerCorner />
                <HorizontalRuler
                  trackWidthPx={canvasWidthPx || 1}
                  originPx={0}
                  contentWidthPx={canvasWidthPx || 1}
                  lengthMm={doc.widthMm}
                  selectedRangeMm={
                    selectedElement
                      ? {
                          start: selectedElement.left,
                          end: selectedElement.left + selectedElement.width,
                        }
                      : null
                  }
                  liveBounds={liveRulerBounds}
                />
              </View>
              ) : null}
              <View style={styles.rulerBodyRow}>
                {showRulers ? (
                <View pointerEvents="none">
                  <VerticalRuler
                    trackHeightPx={canvasHeightPx || 1}
                    originPx={0}
                    contentHeightPx={canvasHeightPx || 1}
                    lengthMm={doc.heightMm}
                    selectedRangeMm={
                      selectedElement
                        ? {
                            start: selectedElement.top,
                            end: selectedElement.top + selectedElementHeightMm,
                          }
                        : null
                    }
                    liveBounds={liveRulerBounds}
                  />
                </View>
                ) : null}
                <View
                  style={[
                    styles.artboardSlot,
                    {
                      width: canvasWidthPx || 1,
                      height: canvasHeightPx || 1,
                    },
                    (doc.mediaShape === 'circle' || doc.mediaShape === 'ellipse' || dieCutPad) && {
                      backgroundColor: 'transparent',
                      borderRightWidth: 0,
                      borderBottomWidth: 0,
                    },
                  ]}>
                  <KonvaCanvas
                    ref={canvasShotRef}
                    document={canvasDoc}
                    canvasWidthPx={canvasWidthPx}
                    canvasHeightPx={canvasHeightPx}
                    pxPerMM={pxPerMM}
                    padZoom={padZoom * committedScale}
                    selectedIds={selectedIds}
                    selectionColor={selectionColor}
                    surfaceColor={artboardFill}
                    showGrid={gridShown}
                    gridOverlay={gridOverlay}
                    gridSpacingMm={gridSpacingMm}
                    gridColor={editorSettings.editorGridColor}
                    liveBounds={liveRulerBounds}
                    activeSelectedIdSv={activeSelectedIdSv}
                    topBarSelectionVisibleSv={topBarSelectionVisibleSv}
                    bottomPanelVisibleSv={bottomPanelVisibleSv}
                    multipleMode={multipleMode}
                    groupEligibleSv={groupEligibleSv}
                    groupAnchorIdSv={groupAnchorIdSv}
                    groupDeltaLeftMm={groupDeltaLeftSv}
                    groupDeltaTopMm={groupDeltaTopSv}
                    groupScaleXSv={groupScaleXSv}
                    groupScaleYSv={groupScaleYSv}
                    groupHandleSv={groupHandleSv}
                    groupScaleMinSv={groupScaleMinSv}
                    groupScaleMaxSv={groupScaleMaxSv}
                    safeModeSv={safeModeSv}
                    onGroupResizeHandleBegin={prepareGroupResizeHandle}
                    onSelect={handleSelect}
                    referenceSelected={referenceSelected}
                    onDeselectAll={handleCanvasBackgroundTap}
                    onOpenPanel={openPanelFor}
                    onEditText={beginTextEdit}
                    onQuickEdit={handleQuickEdit}
                    onTransformStart={handleTransformStart}
                    onTransformMove={handleTransformMove}
                    onTransformEnd={handleTransformEnd}
                    onQuickRotate={handleRotateElement}
                    onTableCellPress={handleTableCellPress}
                    onTableCellQuickEdit={handleTableCellQuickEdit}
                    selectedTableCell={selectedTableCell}
                    tableSelectionColor={selectionColor}
                    pointerToMm={windowPointToArtboardMm}
                    snapMoveMm={snapMoveMm}
                    snapGuides={snapGuides}
                  />
                </View>
              </View>
              {overlapBannerPositions.map((pos, index) => (
                <View
                  key={`overlap-${index}-${Math.round(pos.left)}-${Math.round(pos.top)}`}
                  pointerEvents="none"
                  style={[
                    styles.overlapBanner,
                    { top: pos.top, left: pos.left },
                  ]}>
                  <Text style={styles.overlapBannerText}>Elements overlap</Text>
                </View>
              ))}
            </Animated.View>
          </View>
        </View>
      </ZoomableEditPad>
    </Animated.View>
  );

  const renderPanel = (targetEl: LabelElement | null = displayElement, visible = true) => {
    if (!targetEl) return null;
    const focusRequest = visible ? contentFocusRequest : 0;
    switch (targetEl.type) {
      case 'text':
        return (
          <TextPropertyPanel
            activeTab={textTab}
            onTabChange={setTextTab}
            state={targetEl}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            contentFocusRequest={focusRequest}
            onScanPress={handleContentScanPress}
          />
        );
      case 'barcode':
        return (
          <BarcodePropertyPanel
            activeTab={barcodeTab}
            onTabChange={setBarcodeTab}
            state={targetEl}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'qrcode':
        return (
          <QrcodePropertyPanel
            activeTab={qrcodeTab}
            onTabChange={setQrcodeTab}
            state={targetEl}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'line':
        return (
          <LinePropertyPanel
            activeTab={lineTab}
            onTabChange={setLineTab}
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'shape':
        return (
          <ShapePropertyPanel
            activeTab={shapeTab}
            onTabChange={setShapeTab}
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'table': {
        const table = ensureTableCells(targetEl);
        const activeCell =
          selectedTableCell &&
          selectedTableCell.tableId === targetEl.id &&
          selectedTableCell.row < table.rowCount &&
          selectedTableCell.col < table.columnCount
            ? selectedTableCell
            : null;
        // Keep both panels mounted so line↔cell taps do not cold-mount the menu each time.
        const cell =
          activeCell != null
            ? table.cells![activeCell.row][activeCell.col]
            : createDefaultTableCell();
        const cellRow = activeCell?.row ?? 0;
        const cellCol = activeCell?.col ?? 0;
        const cellState = tableCellToEditorState(cell, table, cellRow, cellCol);
        const cellHeightMm = table.rowHeights[cellRow] ?? table.height / table.rowCount;
        return (
          <View style={{ flex: 1, minHeight: 0 }}>
            <View
              style={activeCell ? panelSlotHidden : panelSlotVisible}
              pointerEvents={activeCell ? 'none' : 'auto'}>
              <TablePropertyPanel
                activeTab={tableTab}
                onTabChange={setTableTab}
                state={targetEl}
                patch={patchSelected}
                labelWidthMm={labelBounds.widthMm}
                labelHeightMm={labelBounds.heightMm}
                elementHeightMm={selectedElementHeightMm}
              />
            </View>
            <View
              style={activeCell ? panelSlotVisible : panelSlotHidden}
              pointerEvents={activeCell ? 'auto' : 'none'}>
              <TextPropertyPanel
                activeTab={textTab}
                onTabChange={setTextTab}
                state={cellState}
                patch={patchTableCellSelected}
                onColumnNamePress={handleColumnNamePress}
                labelWidthMm={labelBounds.widthMm}
                labelHeightMm={labelBounds.heightMm}
                elementHeightMm={cellHeightMm}
                contentFocusRequest={activeCell ? focusRequest : 0}
                panelScope="tableCell"
                onScanPress={handleContentScanPress}
              />
            </View>
          </View>
        );
      }
      case 'time':
        return (
          <TimePropertyPanel
            activeTab={timeTab}
            onTabChange={setTimeTab}
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'arctext':
        return (
          <ArcTextPropertyPanel
            activeTab={arcTextTab}
            onTabChange={setArcTextTab}
            state={targetEl}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'degrees':
        return (
          <DegreesPropertyPanel
            activeTab={degreesTab}
            onTabChange={setDegreesTab}
            state={targetEl}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            contentFocusRequest={focusRequest}
          />
        );
      case 'image':
        return (
          <ImagePropertyPanel
            activeTab={imageTab}
            onTabChange={setImageTab}
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            onBusyChange={setImageIngesting}
            onColumnNamePress={handleColumnNamePress}
          />
        );
      case 'clipart':
        return (
          <ClipartPropertyPanel
            activeTab={clipartTab}
            onTabChange={setClipartTab}
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            onChooseClipart={() => {
              if (targetEl.id) {
                clipartReplaceIdRef.current = targetEl.id;
              }
              clipartPendingPlacementRef.current = null;
              router.push({
                pathname: '/clipart',
                params: targetEl.clipartId?.startsWith('le-')
                  ? { from: 'edit', mode: 'emoji' }
                  : { from: 'edit' },
              });
            }}
          />
        );
      case 'border':
        return (
          <BorderPropertyPanel
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            onChangeStyle={() => {
              router.push({
                pathname: '/border-library',
                params: {
                  from: 'edit',
                  ...(doc.mediaShape ? { mediaShape: doc.mediaShape } : {}),
                  style: targetEl.borderStyle,
                  ...(targetEl.edgeGapMm != null ? { edgeGap: String(targetEl.edgeGapMm) } : {}),
                  hasBorder: '1',
                },
              });
            }}
            onRemove={() => {
              if (acrossLayout(docRef.current)) applyBorderAcross(currentBorderScope(docRef.current), null);
              else setElements((elements) => elements.filter((el) => el.type !== 'border'), true);
              selectedIdsRef.current = [];
              primaryIdRef.current = null;
              activeSelectedIdSv.value = '';
              topBarSelectionVisibleSv.value = 0;
              bottomPanelVisibleSv.value = 0;
              setSelectedIds([]);
              setPrimaryId(null);
              setPanelOpen(false);
            }}
          />
        );
      case 'signature':
        return (
          <SignaturePropertyPanel
            activeTab={signatureTab}
            onTabChange={setSignatureTab}
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            onRedraw={() => {
              signatureBoardIntentRef.current = 'edit';
              setShowSignatureBoard(true);
            }}
          />
        );
      default:
        return null;
    }
  };

  const activePanelContent = (
    <PositionLayerActionsProvider value={positionLayerActions}>
      {mountedPanelTypes.map((type) => {
        const visible = type === activePanelType;
        const seed =
          (visible ? displayElement : null) ??
          panelSeedRef.current.get(type) ??
          doc.elements.find((el) => el.type === type) ??
          null;
        return (
          <KeepAlivePanelSlot key={type} visible={visible}>
            {renderPanel(seed, visible)}
          </KeepAlivePanelSlot>
        );
      })}
    </PositionLayerActionsProvider>
  );

  const handleStartCanvasWalkthrough = useCallback(() => {
    setSelectedIds([]);
    setPrimaryId(null);
    setPanelOpen(false);
    startWalkthrough('canvas');
  }, [setSelectedIds, setPrimaryId, setPanelOpen, startWalkthrough]);

  return (
    <SerialEditorContext.Provider value={serialEditorValue}>
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={requestLeave}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <AppIcon name="chevron.left" tintColor={C.onHeader} size={22} />
          </Pressable>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerTitle}>
            {doc.name}
            {dirty ? ' •' : ''}
          </Text>
          <Pressable
            onPress={handleStartCanvasWalkthrough}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Canvas walkthrough"
            style={({ pressed }) => [styles.helpBtn, pressed && styles.pressed]}>
            <AppIcon name="questionmark.circle.fill" tintColor={C.onHeader} size={20} />
          </Pressable>
        </View>

        <View
          ref={(node) => registerWalkthroughTarget('edit.savePrint', node)}
          collapsable={false}
          style={styles.headerActions}>
          <HeaderAction icon="folder" label={t('common.open')} onPress={() => setShowOpenModal(true)} />
          <HeaderAction icon="square.and.arrow.down.on.square" label={t('common.saveAs')} onPress={handleSaveAs} />
          <HeaderAction icon="tray.and.arrow.down.fill" label={t('common.save')} onPress={() => saveDocument()} />
          <HeaderAction icon="printer.fill" label={t('print.print')} onPress={handlePrint} />
        </View>
      </View>

      <View style={[styles.body, { maxWidth: MaxContentWidth }]}>
        <View style={styles.subToolbarSlot}>
          <View style={styles.subToolbarRow}>
            <Pressable
              ref={(node) => registerWalkthroughTarget('edit.size', node)}
              collapsable={false}
              onPress={() => {
                if (isRatTail143Document(doc)) return;
                setSizeModalVisible(true);
              }}
              style={({ pressed }) => [styles.subToolbar, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.dimText}>
                {doc.mediaShape === 'circle'
                  ? `⌀ ${Math.min(doc.widthMm, doc.heightMm).toFixed(1)} mm`
                  : `${doc.widthMm.toFixed(1)} × ${doc.heightMm.toFixed(1)} mm`}{doc.bulk ? '' : ` · ${doc.paperType}`}
                {doc.orientation ? ` · ${doc.orientation}°` : ''}
                {doc.ups ? ` · ${doc.ups.columns}ups` : ''}
                {doc.bulk ? ` · ${doc.bulk.rowCount} labels` : ''}
              </Text>
              <Text numberOfLines={1} style={styles.sizeHint}>
                {isRatTail143Document(doc)
                  ? 'Prints 14.3 × 101.6 mm wrap stock · content locked on the paddle'
                  : doc.bulk
                    ? 'Tap to resize all labels'
                    : 'Tap to customize size'}
              </Text>
            </Pressable>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.subToolbarChromeScroll}
              contentContainerStyle={styles.subToolbarChromeRow}>
              {Math.abs(padZoom - 1) > 0.02 ? (
                <Pressable
                  onPress={() => setPadZoom(1)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.fitZoomBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Reset zoom to fit">
                  <Text style={styles.fitZoomBtnText}>
                    Fit ({Math.round(padZoom * 100)}%)
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  const next = !editorSettings.safeMode;
                  patchEditor({ safeMode: next });
                  flashChromeStatus(next ? 'Safe mode enabled' : 'Safe mode disabled');
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={editorSettings.safeMode ? 'Safe mode' : 'Free mode'}
                style={({ pressed }) => [
                  styles.splitMaxBtn,
                  editorSettings.safeMode && styles.canvasChromeBtnActive,
                  pressed && styles.pressed,
                ]}>
                <SafeModeIcon
                  active={editorSettings.safeMode}
                  color={editorSettings.safeMode ? C.accent : C.textMuted}
                />
              </Pressable>

              <Pressable
                onPress={() => {
                  patchEditor({ showRulers: !showRulers });
                  flashChromeStatus(showRulers ? 'Ruler hidden' : 'Ruler shown');
                }}
                hitSlop={10}
                accessibilityRole="switch"
                accessibilityState={{ checked: showRulers }}
                accessibilityLabel="Show ruler"
                style={({ pressed }) => [
                  styles.splitMaxBtn,
                  showRulers && styles.canvasChromeBtnActive,
                  pressed && styles.pressed,
                ]}>
                <PrintRulerIcon
                  active={showRulers}
                  color={showRulers ? C.accent : C.textMuted}
                  size={18}
                />
              </Pressable>

              <Pressable
                onPress={toggleEditorGrid}
                onLongPress={() => setGridSpacingPopoverVisible(true)}
                delayLongPress={280}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={gridShown ? 'Hide grid' : 'Show grid'}
                accessibilityHint="Long press to change grid size."
                style={({ pressed }) => [
                  styles.splitMaxBtn,
                  gridShown && styles.canvasChromeBtnActive,
                  pressed && styles.pressed,
                ]}>
                <AppIcon
                  name={gridShown ? 'square.grid.2x2.fill' : 'square.grid.2x2'}
                  tintColor={gridShown ? C.accent : C.textMuted}
                  size={18}
                />
              </Pressable>

              <Pressable
                onPress={toggleCanvasFullscreen}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={canvasFullscreen ? 'Restore editing panel' : 'Maximize canvas'}
                style={({ pressed }) => [styles.splitMaxBtn, pressed && styles.pressed]}>
                <AppIcon
                  name={
                    canvasFullscreen
                      ? 'arrow.down.right.and.arrow.up.left'
                      : 'arrow.up.left.and.arrow.down.right'
                  }
                  tintColor={C.accent}
                  size={18}
                />
              </Pressable>
            </ScrollView>
          </View>

          <View style={styles.contextualToolbarHost}>
            <Animated.View style={[StyleSheet.absoluteFillObject, contextualToolbarAnimatedStyle]}>
              {renderContextualToolbar()}
            </Animated.View>
          </View>
        </View>

        <View style={styles.resizeHudSlot} pointerEvents="none">
          <ResizeSizeHud
            liveBounds={liveRulerBounds}
            visibleSv={resizeHudVisibleSv}
            statusText={chromeStatus}
          />
        </View>

        {doc.bulk && !bulkSheet ? (
          <Text style={styles.bulkMissingBanner}>
            Excel data is missing — re-import the spreadsheet from Data or Excel.
          </Text>
        ) : null}

        {doc.ups && doc.ups.columns > 1 ? (
          doc.ups.columns >= 3 ? (
            /* Jewellery 3-up style: individual tab buttons */
            <View style={styles.upsPager}>
              {Array.from({ length: doc.ups.columns }, (_, i) => (
                <Pressable
                  key={i}
                  onPress={() => goToUpsPanel(i)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.upsTabBtn,
                    doc.ups!.activeIndex === i && styles.upsTabBtnActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.upsTabText,
                      doc.ups!.activeIndex === i && styles.upsTabTextActive,
                    ]}>
                    Label {i + 1}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            /* Original 2-up chevron pager */
            <View style={styles.upsPager}>
              <Pressable
                disabled={doc.ups.activeIndex <= 0}
                onPress={() => goToUpsPanel(doc.ups!.activeIndex - 1)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.upsPagerBtn,
                  doc.ups!.activeIndex <= 0 && styles.upsPagerBtnDisabled,
                  pressed && doc.ups!.activeIndex > 0 && styles.pressed,
                ]}>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.upsPagerChevron,
                    doc.ups!.activeIndex <= 0 && styles.upsPagerChevronDisabled,
                  ]}>
                  ‹
                </Text>
              </Pressable>
              <Text style={styles.upsPagerText} /* layout-ok: panel index in a minWidth slot */>
                {doc.ups.activeIndex + 1}/{doc.ups.columns}
              </Text>
              <Pressable
                disabled={doc.ups.activeIndex >= doc.ups.columns - 1}
                onPress={() => goToUpsPanel(doc.ups!.activeIndex + 1)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.upsPagerBtn,
                  doc.ups!.activeIndex >= doc.ups!.columns - 1 && styles.upsPagerBtnDisabled,
                  pressed && doc.ups!.activeIndex < doc.ups!.columns - 1 && styles.pressed,
                ]}>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.upsPagerChevron,
                    doc.ups!.activeIndex >= doc.ups!.columns - 1 && styles.upsPagerChevronDisabled,
                  ]}>
                  ›
                </Text>
              </Pressable>
            </View>
          )
        ) : null}

        <View
          style={styles.splitColumn}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            if (next <= 0) return;
            setSplitViewportH((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
          }}>
          <View
            ref={(node) => registerWalkthroughTarget('edit.canvas', node)}
            collapsable={false}
            style={styles.canvasTourTarget}>
            {renderCanvas()}
          </View>

          {doc.bulk ? (
            <BulkCopiesBar
              value={bulkCopiesValue}
              rowKey={doc.bulk.activeRowIndex}
              onCommit={commitBulkCopies}
            />
          ) : null}

          {showSerialBar ? (
            <SerialBar
              index={serialIdx}
              value={describeSerialValues(doc, serialIdx + continueOffset)}
              total={serialCount}
              onGo={(i) => setSerialPreviewIndex(Math.min(serialCount - 1, Math.max(0, i)))}
            />
          ) : null}

          {showBulkNav ? (
            <BulkLabelNav
              index={doc.bulk!.activeRowIndex}
              total={doc.bulk!.rowCount}
              onFirst={() => goToBulkRow(0)}
              onPrev={() => goToBulkRow(doc.bulk!.activeRowIndex - 1)}
              onNext={() => goToBulkRow(doc.bulk!.activeRowIndex + 1)}
              onLast={() => goToBulkRow(doc.bulk!.rowCount - 1)}
              applyAll={bulkScopeApplyAll}
              onApplyAllChange={setBulkScopeApplyAll}
            />
          ) : null}


          {editorSettings.showNudgePad && !canvasFullscreen ? (
            <EditingPad
              enabled={selectedIds.length > 0}
              locked={Boolean(selectedElement?.lockMovement) || (selectedIds.length > 0 && doc.elements.filter((el) => selectedIds.includes(el.id)).every((el) => el.lockMovement))}
              hidden={selectedIds.some((id) => {
                const el = doc.elements.find((item) => item.id === id);
                return el != null && !isEditorVisible(el);
              })}
              canPaste={clipboardHasContent()}
              viewZoom={padZoom}
              onNudge={nudgeSelected}
              onRotate={rotateSelectedBy}
              onAlign={alignSelected}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
              onLock={() => setLockOnSelection(!(selectedElement?.lockMovement ?? false))}
              onHide={toggleHideSelected}
              onCopy={copySelected}
              onPaste={pasteClipboard}
              onFront={() => reorderSelected('front')}
              onBack={() => reorderSelected('back')}
              onZoomIn={zoomInPad}
              onZoomOut={zoomOutPad}
            />
          ) : null}

          <View style={styles.sheet} pointerEvents="auto">
            {/* Pinned Toolbar Row - ALWAYS VISIBLE AT ALL SHEET HEIGHTS */}
            <View style={[styles.pinnedToolbar, { paddingBottom: bottomInsetPx }]}>
              <View style={styles.panelHeader}>
                {renderToolbar()}
                <Animated.View style={panelCloseBtnAnimatedStyle}>
                  <Pressable
                    onPress={closePanel}
                    hitSlop={10}
                    style={({ pressed }) => [styles.panelCloseBtn, pressed && styles.pressed]}>
                    <AppIcon name="xmark" tintColor={C.textMuted} size={16} />
                  </Pressable>
                </Animated.View>
              </View>
            </View>

            {/* Collapsible Reveal Window for Tool Grid / Property Panel */}
            <Animated.View
              style={[
                styles.toolGridRevealWindow,
                toolGridAnimatedStyle,
                { marginTop: -Math.max(0, bottomInsetPx - 8) },
              ]}>
              <Animated.View style={[styles.staticPaletteContainer, staticPaletteAnimatedStyle]}>
                <GHScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.paletteScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled>
                  <View
                    ref={(node) => registerWalkthroughTarget('edit.tools', node)}
                    collapsable={false}>
                    <StaticToolPalette
                      onToolPress={handleToolPress}
                      onBeginDrag={beginPaletteDrag}
                      onMoveDrag={movePaletteDrag}
                      onEndDrag={endPaletteDrag}
                    />
                  </View>
                </GHScrollView>
              </Animated.View>

              <Animated.View style={[StyleSheet.absoluteFillObject, propertyPanelAnimatedStyle]}>
                {referenceSelected && doc.referenceImage ? (
                  <ReferenceImagePanel image={doc.referenceImage} onChange={patchReferenceImage} />
                ) : (
                  <View
                    style={[
                      styles.sheetScroll,
                      { paddingBottom: Math.max(Spacing.two, insets.bottom) },
                    ]}>
                    {activePanelContent}
                  </View>
                )}
              </Animated.View>
            </Animated.View>
          </View>
        </View>

        {textEditId ? (
          <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
            <View style={[styles.textEditBar, { paddingBottom: insets.bottom + Spacing.two }]}>
              <TextInput
                ref={textEditInputRef}
                style={styles.textEditInput}
                value={textEditDraft}
                onChangeText={handleTextEditChange}
                onSubmitEditing={commitTextEdit}
                blurOnSubmit
                multiline
                autoFocus
                placeholder="Type text…"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
              />
              <Pressable
                onPress={commitTextEdit}
                hitSlop={8}
                style={({ pressed }) => [styles.textEditDoneBtn, pressed && styles.pressed]}>
                <Text style={styles.textEditDoneText}>Done</Text>
              </Pressable>
            </View>
          </KeyboardStickyView>
        ) : null}
      </View>

      <LabelSettingsMenu
        visible={showLabelMenu}
        topOffset={labelMenuTop}
        onClose={() => setShowLabelMenu(false)}
        onLabelSettings={() => {
          saveDocument(false);
          editorBridge.labelSettingsDoc = docRef.current;
          router.push({ pathname: '/label-settings', params: { labelId: docRef.current.id } });
        }}
        onOpen={() => setShowOpenModal(true)}
        onSave={() => saveDocument()}
        onSaveAs={handleSaveAs}
        onShare={() => {
          saveDocument(false);
          router.push({ pathname: '/share', params: { labelId: docRef.current.id, from: 'canvas' } });
        }}
        onUpload={() => {
          saveDocument(false);
          useLabelStore.getState().uploadToCloud(docRef.current);
          Alert.alert(
            'Template saved',
            `"${docRef.current.name}" is in Select Existing Template and Template → Cloud.`,
          );
        }}
      />

      {showTablePicker && (
        <TableSizePicker
          rows={pickerRows}
          columns={pickerColumns}
          onRowsChange={setPickerRows}
          onColumnsChange={setPickerColumns}
          onCancel={() => setShowTablePicker(false)}
          onConfirm={handleTablePickerConfirm}
        />
      )}

      {showSignatureBoard && (
        <SignatureDrawingBoard
          initialStrokes={
            signatureBoardIntentRef.current === 'edit' &&
            selectedElement &&
            selectedElement.type === 'signature'
              ? selectedElement.strokes
              : []
          }
          onCancel={() => setShowSignatureBoard(false)}
          onConfirm={handleSignatureConfirm}
        />
      )}

      <IosAlertModal
        visible={saveAsVisible}
        onClose={() => setSaveAsVisible(false)}
        title="Save As"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setSaveAsVisible(false) },
          { text: 'Save', style: 'default', bold: true, onPress: confirmSaveAs },
        ]}>
        <IosAlertInput
          value={saveAsName}
          onChangeText={setSaveAsName}
          placeholder="Label name"
          autoFocus
        />
      </IosAlertModal>

      <GridSpacingPopover
        visible={gridSpacingPopoverVisible}
        spacingMm={gridSpacingMm}
        overlay={gridOverlay}
        onClose={() => setGridSpacingPopoverVisible(false)}
        onSpacingChange={changeGridSpacing}
        onOverlayChange={changeGridOverlay}
      />

      <LabelSizeDialog
        visible={sizeModalVisible}
        widthMm={doc.widthMm}
        heightMm={doc.heightMm}
        isBulk={Boolean(doc.bulk)}
        circle={doc.mediaShape === 'circle'}
        onCancel={() => setSizeModalVisible(false)}
        onApply={(w, h, mode) => {
          setSizeModalVisible(false);
          applyLabelSize(w, h, mode);
        }}
      />

      <Modal
        supportedOrientations={ALL_ORIENTATIONS}
        visible={showOpenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOpenModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.openModalCard]}>
            <View style={styles.openModalHeader}>
              <Text style={styles.modalHeading}>Open Label</Text>
            </View>
            {savedDocuments.length === 0 ? (
              <Text style={styles.openEmptyText}>No saved labels yet.</Text>
            ) : (
              <FormScrollView style={styles.openList}>
                {savedDocuments.map((saved) => (
                  <Pressable
                    key={saved.id}
                    onPress={() => openDocument(saved)}
                    style={({ pressed }) => [styles.openRow, pressed && styles.pressed]}>
                    <AppIcon name="doc.text" tintColor={C.accent} size={18} />
                    <View style={styles.openRowInfo}>
                      <Text numberOfLines={1} style={styles.openRowName}>
                        {saved.name}
                      </Text>
                      <Text style={styles.openRowMeta}>
                        {saved.widthMm.toFixed(0)}×{saved.heightMm.toFixed(0)} mm ·{' '}
                        {saved.elements.length} element{saved.elements.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </FormScrollView>
            )}
            <View style={styles.openModalFooter}>
              <Pressable
                style={({ pressed }) => [styles.openModalCloseBtn, pressed && styles.pressed]}
                onPress={() => setShowOpenModal(false)}>
                <Text style={styles.openModalCloseText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View
        ref={overlayViewRef}
        pointerEvents="none"
        collapsable={false}
        style={StyleSheet.absoluteFillObject}
        onLayout={() => {
          overlayViewRef.current?.measureInWindow((x, y) => {
            overlayOriginRef.current = { x, y };
          });
        }}>
        {paletteGhost ? (
          <PaletteDragGhost
            windowX={paletteGhost.windowX}
            windowY={paletteGhost.windowY}
            widthPx={paletteGhost.widthPx}
            heightPx={paletteGhost.heightPx}
            overlayOrigin={overlayOriginRef.current}
            icon={paletteGhost.icon}
          />
        ) : null}
      </View>
      {imageIngesting ? (
        <View style={styles.imageIngestOverlay} pointerEvents="auto">
          <View style={styles.imageIngestCard}>
            <ActivityIndicator color={C.accent} />
            <Text style={styles.imageIngestText}>Placing photo…</Text>
          </View>
        </View>
      ) : null}
      <QuickValueModal
        visible={quickEditTarget !== null}
        initialValue={quickEditTarget?.value ?? ''}
        title={quickEditTarget ? getQuickEditTitle(quickEditTarget.type) : undefined}
        placeholder={quickEditTarget ? getQuickEditPlaceholder(quickEditTarget.type) : undefined}
        anchorRect={quickEditTarget?.anchorRect}
        onCancel={handleQuickEditCancel}
        onConfirm={handleQuickEditConfirm}
      />
      {imageSourceSheet}
      {documentSourceSheet}
      {excelImportModal}
      <WalkthroughOverlay
        tour="canvas"
        steps={CANVAS_WALKTHROUGH}
        onFinish={() => {
          setCanvasTutorialSeen(true);
          stopWalkthrough();
        }}
      />
    </View>
    </SerialEditorContext.Provider>
  );
}

const styles = themedStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  imageIngestOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.scrim,
    zIndex: 50,
  },
  imageIngestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  imageIngestText: {
    ...Type.action,
    color: c.text,
    flexShrink: 1,
  },
  body: {
    flex: 1,
    width: '100%',
  },
  splitColumn: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  // Measure-only wrapper for the canvas walkthrough step; sizes to the stage.
  canvasTourTarget: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  overlapBanner: {
    position: 'absolute',
    zIndex: 40,
    alignItems: 'center',
    backgroundColor: c.warningSoft,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  overlapBannerText: {
    color: c.onWarningSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: c.header,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    zIndex: 30,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: Spacing.one,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 2,
  },
  headerTitle: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
    minWidth: 0,
  },
  helpBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 0,
    gap: 10,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 44,
    paddingHorizontal: 2,
  },
  headerActionLabel: {
    color: c.onAccent,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  propertyModeShell: {
    flex: 1,
  },
  subToolbarSlot: {
    width: '100%',
    height: 88,
    flexShrink: 0,
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  subToolbarChromeScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  subToolbarChromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.one,
  },
  bulkMissingBanner: {
    color: c.warning,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    backgroundColor: c.surface,
  },
  contextualToolbarHost: {
    position: 'relative',
    width: '100%',
    height: 44,
    overflow: 'hidden',
    zIndex: 2,
  },
  resizeHudSlot: {
    width: '100%',
    height: 26,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.canvasArea,
    zIndex: 3,
  },
  subToolbarRow: {
    width: '100%',
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.two,
  },
  subToolbar: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 2,
    gap: 2,
  },
  fitZoomBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: c.accentSoft,
    marginRight: 6,
  },
  fitZoomBtnText: {
    color: c.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  splitMaxBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasChromeBtnActive: {
    backgroundColor: c.accentSoft,
  },
  dimText: {
    color: c.textMuted,
    ...Type.caption,
    fontSize: 13,
  },
  sizeHint: {
    color: c.accent,
    fontSize: 11,
    fontWeight: '500',
  },
  upsPager: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 10,
    elevation: 2,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  upsPagerBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsPagerBtnDisabled: {
    opacity: 0.35,
  },
  upsPagerChevron: {
    color: c.text,
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 24,
  },
  upsPagerChevronDisabled: {
    color: c.textMuted,
  },
  upsPagerText: {
    minWidth: 36,
    textAlign: 'center',
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  upsTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: c.fill,
  },
  upsTabBtnActive: {
    backgroundColor: c.accentFill,
  },
  upsTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.textSecondary,
  },
  upsTabTextActive: {
    color: c.onAccent,
  },
  stage: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.canvasArea,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: LABEL_PAD_STAGE_MIN_HEIGHT,
    overflow: 'hidden',
  },
  stageZoom: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  workspace: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.canvasArea,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
  },
  rulerFrame: {
    position: 'relative',
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  flushCanvasAssembly: {
    position: 'absolute',
    flexDirection: 'column',
    overflow: 'visible',
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (flushCanvasAssembly)
    // Dark stage: a black shadow reads as a paper edge against the lifted stage colour.
    shadowColor: scheme === 'dark' ? '#000000' : '#0B1F33', // theme-fixed: light preview (flushCanvasAssembly)
    shadowOffset: scheme === 'dark' ? { width: 0, height: 4 } : { width: 0, height: 2 },
    shadowOpacity: scheme === 'dark' ? 0.6 : 0.08,
    shadowRadius: scheme === 'dark' ? 14 : 6,
    elevation: scheme === 'dark' ? 8 : 2,
  },
  artboardSlot: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (artboardSlot)
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0', // theme-fixed: light preview (artboardSlot)
  },
  rulerTopRow: {
    flexDirection: 'row',
  },
  rulerBodyRow: {
    flexDirection: 'row',
  },
  emptyHintWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHint: {
    color: c.textDisabled,
    fontSize: 13,
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  resizeHandle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  resizeHandleInner: {
    width: 10,
    height: 10,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: c.accent,
  },
  rotateHandle: {
    position: 'absolute',
    right: -10,
    top: -10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  lockBadge: {
    position: 'absolute',
    left: -8,
    top: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#64748B', // theme-fixed: lock badge over the canvas
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    overflow: 'hidden',
    ...cardElevation(c, scheme),
  },
  pinnedToolbar: {
    width: '100%',
    backgroundColor: c.surface,
  },
  toolGridRevealWindow: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: c.surface,
  },
  staticPaletteContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.surface,
  },
  paletteScrollContent: {
    flexGrow: 1,
  },
  sheetScroll: {
    flex: 1,
    minHeight: 0,
  },
  panelHeader: {
    position: 'relative',
  },
  panelCloseBtn: {
    position: 'absolute',
    right: Spacing.two,
    top: 11,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  toolbarRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
    backgroundColor: c.surface,
  },
  toolbarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 0,
    paddingVertical: 2,
  },
  toolbarDivider: {
    borderLeftWidth: 1,
    borderLeftColor: c.hairline,
  },
  toolbarLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: c.textSecondary,
    textAlign: 'center',
  },
  toolsContainer: {
    width: '100%',
    paddingVertical: 4,
    backgroundColor: c.surface,
  },
  toolRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toolCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  toolItem: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: c.textSecondary,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  textEditBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
  textEditInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.fill,
  },
  textEditDoneBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textEditDoneText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 290,
    alignSelf: 'center',
    backgroundColor: c.surface,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  openModalCard: {
    maxWidth: 320,
    maxHeight: 480,
  },
  openModalHeader: {
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalInput: {
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    fontSize: 14,
    color: c.text,
    backgroundColor: c.surface,
    marginTop: 12,
  },
  openModalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    height: 45,
  },
  openModalCloseBtn: {
    flex: 1,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openModalCloseText: {
    color: c.link,
    fontSize: 17,
    fontWeight: '400',
  },
  openModalDoneText: {
    color: c.link,
    fontSize: 17,
    fontWeight: '600',
  },
  openList: {
    maxHeight: 300,
    marginBottom: 12,
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  openRowInfo: {
    flex: 1,
  },
  openRowName: {
    fontSize: 15,
    fontWeight: '500',
    color: c.text,
  },
  openRowMeta: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 1,
  },
  openEmptyText: {
    textAlign: 'center',
    color: c.textMuted,
    fontSize: 14,
    paddingVertical: 20,
  },
  openCloseBtn: {
    flex: 0,
    marginTop: 4,
  },
  contextualTopBar: {
    width: '100%',
    height: 44,
    backgroundColor: '#374151', // theme-fixed: dark contextual bar in both themes
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.25)', // theme-fixed: dark contextual bar in both themes
  },
  contextualBarBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextualBarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // theme-fixed: divider on the dark contextual bar
  },
}));
