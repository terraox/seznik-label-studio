import { JoshProgressCard } from '@/components/printers/josh-progress-card';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { EditableNumber } from '@/components/editable-number';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
} from '@/components/editor/types';
import { LabelPreview } from '@/components/label-preview';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Type } from '@/constants/ui';
import {
  JEWELRY_DIECUT,
  JEWELRY_DIECUT_PRINT_PRESET_2UP,
  JEWELRY_DIECUT_PRINT_PRESET_3UP,
  JEWELRY_DIECUT_PRINT_PRESET_SINGLE,
  extractJewelryFirstColumnDocument,
  isJewelryDieCutDocument,
} from '@/constants/jewelry-diecut';
import { CONSUMER_PRINTERS } from '@/constants/printer-models';
import { canonicalizeJewelryDieCutDocument } from '@/constants/jewelry-template-elements';
import { resolvePrintQuality } from '@/lib/printer/print-quality';
import {
  calibrationQualityWarning,
  clampToCap,
  darknessSteps,
  hasManualScale,
  qualityCapsFor,
  resolveQualityBridge,
} from '@/lib/printer/bridge-quality-caps';
import { QualityControl, type QualityStepperProps } from '@/components/quality-control';
import {
  CABLE_FLAG_DIECUT,
  CABLE_FLAG_PRINT_PRESET_SINGLE,
  cableFlagPrintDocument,
  isCableFlagDieCutDocument,
} from '@/constants/cable-flag-diecut';
import {
  RAT_TAIL_143_PRINT,
  isRatTail143Document,
  ratTail143PrintPaper,
  refitRatTail143Document,
} from '@/constants/rat-tail-143';
import { dataPageCount, resolveDocumentData } from '@/lib/data-binding';
import {
  confirmLabel,
  designHash,
  expandSerialBatch,
  markCancelled,
  markFailed,
  newCursor,
  newJobId,
  resumeInfo,
  serialPrintLogLine,
  type SerialJobCursor,
} from '@/lib/serial/job';
import {
  describeSerialValues,
  hasSerialFields,
  resolveDocumentForIndex,
  serialBatchCount,
} from '@/lib/serial/resolve-document';
import { serialPrintGate } from '@/lib/serial/symbology-validate';
import { SERIAL_CONFIRM_ABOVE } from '@/lib/serial/types';
import { joshStatusAlert } from '@/lib/printer/josh-status';
import { useJoshProgressStore } from '@/stores/josh-progress-store';
import { useSerialContinueStore } from '@/stores/serial-continue-store';
import { useSerialJobStore } from '@/stores/serial-job-store';
import { projectBulkDocument, resolveBulkSheet } from '@/lib/bulk-labels';
import {
  MAX_JOB_LABELS,
  bulkSendList,
  collateChangesOrder,
  planBulkPrint,
  rememberRowRaster,
} from '@/lib/bulk-row-copies';
import {
  createLabelDocument,
  generateId,
  mmToPt,
  composeUpsDocument,
  readPaperType,
  type LabelDocument,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import {
  applyInkDarknessToPng,
  encodeConnectedPrinterJob,
  formatPrintFailure,
  orientedPrintSize,
  printCaptureLayout,
  printCaptureOptionsForSize,
  printJobSizeError,
  rasterizePngForPrint,
  rotatePngBase64,
  sendIsolatedPrintCopies,
  tryNativeSdkPngPrint,
  waitForNextPaint,
} from '@/lib/printer/print-job';
import { getPrinterManager, PrintTimingLogger } from '@/lib/printer/printer-manager';
import { resolveJoshJobParams } from '@/lib/printer/josh-job-params';
import {
  PAPER_TYPES,
  formatPaperTypeSetting,
  paperPrinterId,
  paperTypeCommand,
  paperTypeSelectionNote,
  paperTypeTestBadge,
} from '@/lib/printer/paper-type';
import { resolveTd404JobParams } from '@/lib/printer/td404-job-params';
import {
  createPrintSpec,
  TD404_BORDER_GAP_MM,
  td404ContentShiftDots,
  td404UserShiftDots,
  td404ContentShiftMm,
  td404EdgeBorderOptions,
} from '@/lib/printer/print-spec';
import {
  joshEffectiveDpi,
  joshHeadlessRasterOptions,
  JOSH_ELEMENT_X_OFFSET_MM,
  joshInkOffsetMm,
  joshLabelPitchMs,
} from '@/lib/printer/josh-print';
import * as FileSystem from 'expo-file-system/legacy';
import { logPrintTrace } from '@/printing';
import { resolveBuildTime, resolveGitSha } from '@/lib/build-identity';
import { printTd404MonoLabel, printTd404PngLabel } from '@/lib/printer/td404-bridge';
import {
  assertHeadlessRasterDocument,
  canHeadlessRasterPrint,
  rasterizeDocumentToBitmapTimed,
  type RasterBitmap,
} from '@/printing/raster/skia-rasterizer';
import { warmupPrintRasterSurface } from '@/printing/raster/skia-surface';
import { prepareImageTiles } from '@/printing/raster/image-tiles';
import { TD404_HEADLESS_SKIA_PRINT } from '@/printing/raster/td404-headless-flag';
import { loadInstalledFontsIntoRuntime } from '@/lib/fonts/runtime';
import { ensurePrintTypefacesForDocument, missingPrintTypefaces } from '@/printing/raster/print-typeface';
import { useDataStore, type ExcelSheet } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { usePrinterStore, type PrintHistoryEntry } from '@/stores/printer-store';
import { usePrintStatsStore } from '@/stores/print-stats-store';
import { useSettingsStore } from '@/stores/settings-store';
import { applyPaperType, defaultLabelSettings, resolveLabelSettings } from '@/lib/label-settings';
import {
  clampLayerOffsetMm,
  effectiveLayerOffsets,
  labelHasOffsetBorder,
  layerOffsetsOf,
  layerOffsetWarning,
  LAYER_OFFSET_MAX_MM,
  LAYER_OFFSET_MIN_MM,
  LAYER_OFFSET_STEP_MM,
  offsetToPaperFrame,
  previewWithLayerOffsets,
  ZERO_LAYER_OFFSETS,
  type LayerBridge,
  type LayerOffsetsMm,
} from '@/lib/layer-offsets';
import { loadAndRenderPdf, printPdfToThermal, type RenderedPdfPage } from '@/lib/pdf-printer';
import { refitFitLabelDocument } from '@/lib/img-to-label-document';
import { downscaleImageUriToMaxEdge } from '@/lib/editor/image-ingest-native';
import {
  buildFitLabelPrintPayload,
  fitLabelDecodeMaxEdgePx,
  fitLabelPrintImageElement,
  fitLabelPrintSourceUri,
  isFitLabelImageOnlyDocument,
  type FitLabelPrintPayload,
} from '@/lib/img-to-label-print';
import { decodeGalleryImage } from '@/lib/printer/gallery-decode';
import { grayToPngBase64 } from '@/lib/printer/escpos';

import { fitLabelSize, printMediaSizeMm, type LabelSizeMm } from '@/lib/label-geometry';
import {
  applyPrintSize,
  formatPrintSize,
  PRINT_SIZE_PRESETS,
  tileDocumentThreeUpDieCut54,
  tileDocumentTwoUpDieCut37,
  type PrintSizePreset,
} from '@/lib/print-sizes';
import { logCaptureSha1 } from '@/lib/debug/capture-hash';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;

function buildScanDocument(
  scanType: string,
  scanData: string,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const isQr = /qr|aztec|datamatrix|pdf417/i.test(scanType);
  const elements: LabelDocument['elements'] = [];

  if (isQr) {
    const size = Math.min(widthMm, heightMm) * 0.62;
    elements.push({
      ...DEFAULT_QRCODE_STATE,
      id: generateId(),
      type: 'qrcode',
      content: scanData,
      left: (widthMm - size) / 2,
      top: heightMm * 0.06,
      width: size,
      height: size,
    });
    elements.push({
      ...DEFAULT_ELEMENT_STATE,
      id: generateId(),
      type: 'text',
      text: scanData,
      fontSize: mmToPt(heightMm * 0.1),
      align: 'center',
      left: widthMm * 0.05,
      top: heightMm * 0.74,
      width: widthMm * 0.9,
    });
  } else {
    elements.push({
      ...DEFAULT_BARCODE_STATE,
      id: generateId(),
      type: 'barcode',
      content: scanData,
      left: widthMm * 0.05,
      top: heightMm * 0.2,
      width: widthMm * 0.9,
      height: heightMm * 0.55,
    });
  }

  return createLabelDocument({
    name: 'Scanned Code',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}

function buildPhotoDocument(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  mode: string | undefined,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const framed = mode === 'frame';
  const pad = framed ? Math.max(1.5, widthMm * 0.06) : 0;
  const boxW = widthMm - pad * 2;
  const boxH = heightMm - pad * 2;
  const ratio = imageWidth > 0 && imageHeight > 0 ? imageHeight / imageWidth : 1;

  // Contain-fit the photo inside the label box.
  let w = boxW;
  let h = boxW * ratio;
  if (h > boxH) {
    h = boxH;
    w = boxH / ratio;
  }

  const elements: LabelDocument['elements'] = [
    {
      id: generateId(),
      type: 'image',
      uri: imageUri,
      rotation: 0,
      left: pad + (boxW - w) / 2,
      top: pad + (boxH - h) / 2,
      width: w,
      height: h,
      lockMovement: false,
      needPrinting: true,
      antiColor: false,
    },
  ];

  return createLabelDocument({
    name: framed ? 'Photo Frame' : 'Photo',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}

function buildExcelRowDocument(
  sheet: ExcelSheet,
  rowIndex: number,
  name: string,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const row = sheet.rows[rowIndex] ?? [];
  const count = Math.min(sheet.columns.length, 4);
  const lineH = heightMm / (count + 0.5);
  const elements: LabelDocument['elements'] = [];

  for (let i = 0; i < count; i++) {
    elements.push({
      ...DEFAULT_ELEMENT_STATE,
      id: generateId(),
      type: 'text',
      text: `${sheet.columns[i]}: ${row[i] ?? ''}`,
      fontSize: mmToPt(lineH * 0.5),
      left: widthMm * 0.05,
      top: lineH * (i + 0.25),
      width: widthMm * 0.9,
    });
  }

  return createLabelDocument({
    name,
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}

function StepperRow({
  label,
  value,
  valueColor,
  onMinus,
  onPlus,
  onCommitValue,
  minusDisabled,
  plusDisabled,
  bordered,
  hint,
}: {
  label: string;
  /** Small muted line under the label. */
  hint?: string;
  value: string;
  valueColor?: string;
  /** When set, the value is tappable and can be typed with the keyboard. */
  onCommitValue?: (next: number) => void;
  onMinus?: () => void;
  onPlus?: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  bordered?: boolean;
}) {
  useThemeRefresh();
  return (
    <View style={[styles.stepperRow, bordered && styles.stepperRowBorder]}>
      <View style={styles.stepperLabelWrap}>
        <Text style={styles.stepperLabel}>{label}</Text>
        {hint ? <Text style={styles.stepperHint}>{hint}</Text> : null}
      </View>
      <View style={styles.stepperControls}>
        <Pressable
          disabled={minusDisabled}
          onPress={onMinus}
          hitSlop={10}
          style={({ pressed }) => [
            styles.stepperCircle,
            minusDisabled && styles.stepperCircleDisabled,
            pressed && !minusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
        </Pressable>
        {onCommitValue ? (
          <EditableNumber
            value={parseInt(value, 10) || 1}
            onCommit={onCommitValue}
            style={[styles.stepperValue, valueColor ? { color: valueColor } : null]}
          />
        ) : (
          <Text style={[styles.stepperValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        )}
        <Pressable
          disabled={plusDisabled}
          onPress={onPlus}
          hitSlop={10}
          style={({ pressed }) => [
            styles.stepperCircle,
            plusDisabled && styles.stepperCircleDisabled,
            pressed && !plusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, plusDisabled && styles.stepperSymbolDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BorderedStepperRow(props: QualityStepperProps) {
  useThemeRefresh();
  return <StepperRow {...props} bordered />;
}

function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
  badgeFor,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  badgeFor?: (value: T) => string | null;
}) {
  useThemeRefresh();
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option === selected;
        const badge = badgeFor?.(option) ?? null;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.chip,
              badgeFor ? styles.chipWithBadge : null,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {option}
            </Text>
            {badge ? (
              <Text style={[styles.chipBadge, active && styles.chipBadgeActive]} numberOfLines={1}>
                {badge}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

type CachedRowPrint = {
  pageDoc: LabelDocument | null;
  fitLabelExtract: boolean;
  td404HeadlessMono: boolean;
  joshHeadlessCandidate: boolean;
  captureResolvedAt: number;
  base64: string;
  rotatedBase64: string;
  connectionMs: number;
  captureMs: number;
  fitLabelDecodeMs: number;
  fitLabelRasterMs: number;
  fitLabelMono: FitLabelPrintPayload | null;
  joshFacesReady: boolean;
  joshMonoBitmap: RasterBitmap | null;
  td404Bitmap: RasterBitmap | null;
};

export default function PrintScreen() {
  const uiScheme = useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{
    labelId?: string;
    imageUri?: string;
    imageWidth?: string;
    imageHeight?: string;
    mode?: string;
    docName?: string;
    docUri?: string;
    docType?: string;
    excelFileId?: string;
    scanType?: string;
    scanData?: string;
  }>();

  const getDocument = useLabelStore((s) => s.getDocument);
  const storedLabel = useLabelStore((s) =>
    params.labelId ? s.documents.find((d) => d.id === params.labelId) ?? null : null,
  );
  const defaults = useSettingsStore((s) => s.defaults);
  const printingSettings = useSettingsStore((s) => s.printing);
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const addHistoryEntry = usePrinterStore((s) => s.addHistoryEntry);
  const printerDeviceId = usePrinterStore((s) => s.deviceId ?? s.lastDeviceId);
  const printerSdkId = usePrinterStore((s) => s.sdkId);
  const printerTransport = usePrinterStore((s) => s.transport);
  const qualityBridge = useMemo(
    () =>
      resolveQualityBridge({
        activeTransport: getPrinterManager().transport,
        storeTransport: printerTransport,
        sdkId: printerSdkId,
      }),
    // `status` re-reads the manager's live transport after connect / disconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printerTransport, printerSdkId, status],
  );
  const qualityCaps = useMemo(() => qualityCapsFor(qualityBridge), [qualityBridge]);
  useEffect(() => {
    if (qualityBridge !== 'josh-lpapi') return;
    warmupPrintRasterSurface();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') warmupPrintRasterSurface();
    });
    return () => sub.remove();
  }, [qualityBridge]);
  const printCalibration = usePrinterStore((s) => s.printCalibration);
  const setPrintCalibration = usePrinterStore((s) => s.setPrintCalibration);
  // A fixed print-head/media-guide offset is a per-unit hardware trait, not
  // something geometry math can solve — key by the physical device so a
  // calibrated offset survives switching label/template and reopening Print.
  const calibrationKey = printerDeviceId ?? printerSdkId ?? 'unknown';
  const savedCalibration = printCalibration[calibrationKey];
  const excelFiles = useDataStore((s) => s.excelFiles);
  const activeExcelFileId = useDataStore((s) => s.activeExcelFileId);

  const activeModelMeta = CONSUMER_PRINTERS[selectedModel] ?? CONSUMER_PRINTERS.tejas;

  const excelSheet = useMemo<ExcelSheet | null>(() => {
    const fileId = params.excelFileId ?? activeExcelFileId;
    const file = excelFiles.find((f) => f.id === fileId) ?? null;
    return file ? file.sheets[file.activeSheetIndex] ?? file.sheets[0] ?? null : null;
  }, [params.excelFileId, activeExcelFileId, excelFiles]);

  /** Uncomposed store document — needed for jewellery 3-up detection (compose strips `ups`). */
  const sourceDocument = useMemo<LabelDocument | null>(() => {
    let doc: LabelDocument | null = null;
    if (params.labelId) doc = getDocument(params.labelId) ?? null;
    else if (params.scanData) {
      doc = buildScanDocument(
        params.scanType ?? '',
        params.scanData,
        defaults.labelWidth,
        defaults.labelHeight,
      );
    } else if (params.imageUri) {
      doc = buildPhotoDocument(
        params.imageUri,
        Number(params.imageWidth) || 0,
        Number(params.imageHeight) || 0,
        params.mode,
        defaults.labelWidth,
        defaults.labelHeight,
      );
    }
    return doc;
  }, [
    params.labelId,
    storedLabel,
    params.scanData,
    params.scanType,
    params.imageUri,
    params.imageWidth,
    params.imageHeight,
    params.mode,
    getDocument,
    defaults.labelWidth,
    defaults.labelHeight,
  ]);

  /** Base document (page-independent). Null for PDF documents, which show a card. */
  const jewelryDieCutJob = isJewelryDieCutDocument(sourceDocument);
  const cableFlagJob = isCableFlagDieCutDocument(sourceDocument);
  const ratTail143Job = isRatTail143Document(sourceDocument);
  // One 2-up piece: row 1 on the left, row 2 on the right. Jewellery, cable-flag,
  // and rat-tail keep their own canvases.
  const baseDocument = useMemo<LabelDocument | null>(() => {
    if (!sourceDocument) return null;
    if (jewelryDieCutJob || cableFlagJob || ratTail143Job) return sourceDocument;
    if ((sourceDocument.ups?.columns ?? 0) >= 2) return composeUpsDocument(sourceDocument);
    return sourceDocument;
  }, [sourceDocument, jewelryDieCutJob, cableFlagJob, ratTail143Job]);
  // Always use the connected printer's real DPI — a hardcoded 304 blurs 203 DPI
  // Josh/Dev/Tez heads (already fixed for jewelry; cable-flag/rat-tail-143 had the same bug).
  const jewelryJobDpi = null;
  const cableJobDpi = null;
  const ratTailJobDpi = null;

  const defaultPreset = useMemo<PrintSizePreset | null>(() => {
    if (cableFlagJob) {
      return PRINT_SIZE_PRESETS.find((p) => p.id === CABLE_FLAG_PRINT_PRESET_SINGLE) ?? null;
    }
    if (!jewelryDieCutJob) return null;
    return PRINT_SIZE_PRESETS.find((p) => p.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) ?? null;
  }, [cableFlagJob, jewelryDieCutJob]);

  const defaultPrintSize = useMemo<LabelSizeMm>(() => {
    if (!baseDocument) return { widthMm: defaults.labelWidth, heightMm: defaults.labelHeight };
    if (ratTail143Job) return ratTail143PrintPaper();
    if (cableFlagJob) {
      return { widthMm: CABLE_FLAG_DIECUT.widthMm, heightMm: CABLE_FLAG_DIECUT.heightMm };
    }
    if (defaultPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) {
      return { widthMm: JEWELRY_DIECUT.sheetWidthMm, heightMm: JEWELRY_DIECUT.sheetHeightMm };
    }
    return printMediaSizeMm(baseDocument.widthMm, baseDocument.heightMm);
  }, [baseDocument, defaultPreset, defaults.labelWidth, defaults.labelHeight, cableFlagJob, ratTail143Job]);

  const [copies, setCopies] = useState(1);
  const [collate, setCollate] = useState(false);
  const [printProgress, setPrintProgress] = useState<string | null>(null);
  // A boolean, not the text: the text changes with every printer event and would re-render this whole screen.
  const joshProgressLine = useJoshProgressStore((s) => s.phase !== 'idle');
  const joshLateFailure = useJoshProgressStore((s) => s.lateFailure);
  const joshStatusWarning = useJoshProgressStore((s) => joshStatusAlert(s.deviceStatus));
  useEffect(() => {
    if (printerSdkId !== 'josh') return;
    return getPrinterManager().watchJoshStatus();
  }, [printerSdkId]);
  useEffect(() => {
    if (!joshLateFailure) return;
    useJoshProgressStore.getState().setLateFailure(null);
    Alert.alert('Printer problem', joshLateFailure);
  }, [joshLateFailure]);
  const [darkness, setDarkness] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<(typeof ORIENTATIONS)[number]>('0°');
  const [paperType, setPaperType] = useState<PaperType>(defaults.paperType);
  const [gapLength, setGapLength] = useState(() => defaultLabelSettings().gapLengthMm);
  const [hOffset, setHOffset] = useState(() => savedCalibration?.hOffsetMm ?? 0);
  const [vOffset, setVOffset] = useState(() => savedCalibration?.vOffsetMm ?? 0);
  // Elements / Border offsets live on the label (settings), so they print the same every time.
  const [layerOffsets, setLayerOffsets] = useState<LayerOffsetsMm>(() => layerOffsetsOf(sourceDocument));
  useEffect(() => {
    setLayerOffsets(layerOffsetsOf(sourceDocument));
    // Only when another label is opened; edits below write straight to state and the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.labelId]);

  // Re-sync when the connected printer changes (or persisted calibration
  // finishes loading from AsyncStorage after this screen already mounted).
  useEffect(() => {
    const saved = usePrinterStore.getState().printCalibration[calibrationKey];
    setHOffset(saved?.hOffsetMm ?? 0);
    setVOffset(saved?.vOffsetMm ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrationKey]);

  // Persist calibration per physical printer so a dialed-in offset survives
  // reopening Print — the controls used to always reset to 0mm, making a
  // real, fixed mechanical offset look like an unresolved random shift.
  const currentQuality = useMemo(
    () =>
      resolvePrintQuality({
        darkness,
        speed,
        grayThreshold: defaults.grayThreshold,
        colorMode: defaults.colorMode,
        dieCut: jewelryDieCutJob || cableFlagJob || ratTail143Job,
        jewelry: jewelryDieCutJob,
        caps: qualityCaps,
      }),
    [darkness, speed, defaults.grayThreshold, defaults.colorMode, jewelryDieCutJob, cableFlagJob, ratTail143Job, qualityCaps],
  );
  const calibrationQualityRef = useRef<{ density: number; speed: number } | undefined>(undefined);
  calibrationQualityRef.current = hasManualScale(qualityCaps)
    ? { density: currentQuality.density, speed: currentQuality.speed }
    : undefined;
  const calibrationQualityNote = hasManualScale(qualityCaps)
    ? calibrationQualityWarning(savedCalibration, currentQuality)
    : null;

  // Offsets for a new key arrive on the next render; skip the stale write in between.
  const calibrationKeyRef = useRef(calibrationKey);
  useEffect(() => {
    if (calibrationKey === 'unknown') return;
    if (calibrationKeyRef.current !== calibrationKey) {
      calibrationKeyRef.current = calibrationKey;
      return;
    }
    const prev = usePrinterStore.getState().printCalibration[calibrationKey];
    if (prev && prev.hOffsetMm === hOffset && prev.vOffsetMm === vOffset) return;
    setPrintCalibration(calibrationKey, {
      hOffsetMm: hOffset,
      vOffsetMm: vOffset,
      ...calibrationQualityRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hOffset, vOffset, calibrationKey]);
  const [zoom, setZoom] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [printSize, setPrintSize] = useState<LabelSizeMm>(defaultPrintSize);
  const [printPreset, setPrintPreset] = useState<PrintSizePreset | null>(defaultPreset);
  const [showAdvanced, setShowAdvanced] = useState(true);
  // Whole-label offset (elements + border together) is rarely needed, so it starts folded.
  const [showTogetherOffset, setShowTogetherOffset] = useState(false);
  const printingLockRef = useRef(false);
  const labelSettingsInitialized = useRef(false);

  useEffect(() => {
    if (!sourceDocument || labelSettingsInitialized.current) return;
    labelSettingsInitialized.current = true;
    const settings = resolveLabelSettings(sourceDocument);
    setGapLength(settings.gapLengthMm);
    setDarkness(settings.printDarkness);
    setSpeed(settings.printSpeed);
    setOrientation(`${sourceDocument.orientation}°` as (typeof ORIENTATIONS)[number]);
    setPaperType(readPaperType(sourceDocument.paperType));
  }, [sourceDocument]);

  // Darkness / speed changed in Label Settings while this screen stays mounted.
  const savedQualityRef = useRef<{ d: number | null; s: number | null } | null>(null);
  useEffect(() => {
    if (!sourceDocument) return;
    const { printDarkness: d, printSpeed: s } = resolveLabelSettings(sourceDocument);
    const seen = savedQualityRef.current;
    savedQualityRef.current = { d, s };
    if (!seen) return;
    if (seen.d !== d) setDarkness(d);
    if (seen.s !== s) setSpeed(s);
  }, [sourceDocument]);

  // Bring darkness / speed inside the bridge's scale. Out-of-range values saved on the
  // label are written back clamped, so the notice shows once.
  const qualityClampNoticeShown = useRef(false);
  useEffect(() => {
    const d = clampToCap(darkness, qualityCaps.density);
    const s = clampToCap(speed, qualityCaps.speed);
    if (d.clamped) setDarkness(d.value);
    if (s.clamped) setSpeed(s.value);
    if (!params.labelId) return;
    const store = useLabelStore.getState();
    const stored = store.documents.find((doc) => doc.id === params.labelId);
    if (!stored) return;
    const saved = resolveLabelSettings(stored);
    const savedD = clampToCap(saved.printDarkness, qualityCaps.density);
    const savedS = clampToCap(saved.printSpeed, qualityCaps.speed);
    if (!savedD.clamped && !savedS.clamped) return;
    store.upsertDocument({
      ...stored,
      settings: { ...saved, printDarkness: savedD.value, printSpeed: savedS.value },
    });
    if (qualityClampNoticeShown.current) return;
    qualityClampNoticeShown.current = true;
    const changes = [
      savedD.clamped ? `darkness ${saved.printDarkness} → ${savedD.value}` : null,
      savedS.clamped ? `speed ${saved.printSpeed} → ${savedS.value}` : null,
    ].filter(Boolean);
    Alert.alert(
      'Print settings adjusted',
      `This label's saved ${changes.join(' and ')} was outside this printer's range and has been changed.`,
    );
  }, [darkness, speed, qualityCaps, params.labelId]);

  const shotRef = useRef<ViewShot>(null);

  const isExcelJob = params.docType === 'Excel' && excelSheet !== null;
  const isPdfJob = params.docType === 'PDF';

  const [pdfPages, setPdfPages] = useState<RenderedPdfPage[]>([]);
  const [pdfRendering, setPdfRendering] = useState(false);

  useEffect(() => {
    if (!isPdfJob || !params.docUri) return;
    let active = true;
    setPdfRendering(true);
    loadAndRenderPdf(params.docUri)
      .then((res) => {
        if (active) {
          setPdfPages(res.pages);
          setPdfRendering(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn('[print] Failed to render PDF:', err);
          setPdfRendering(false);
        }
      });
    return () => {
      active = false;
    };
  }, [isPdfJob, params.docUri]);

  // Serial labels. 'batch': the label prints `count` times with the serial advancing. 'rows': an Excel /
  // bulk / data-sheet label, where the row index is the serial index and Count does not apply.
  const serialInfo = useMemo(() => {
    if (isPdfJob || isExcelJob || !baseDocument || !hasSerialFields(baseDocument)) return null;
    if (baseDocument.bulk) return { mode: 'rows' as const, count: Math.max(1, baseDocument.bulk.rowCount) };
    const dataPages = excelSheet && printingSettings.autoPages ? dataPageCount(baseDocument, excelSheet) : 1;
    if (dataPages > 1) return { mode: 'rows' as const, count: dataPages };
    return { mode: 'batch' as const, count: serialBatchCount(baseDocument) };
  }, [isPdfJob, isExcelJob, baseDocument, excelSheet, printingSettings.autoPages]);

  // Continue-from-last lives outside the label document (serial-continue-store).
  const continueEntry = useSerialContinueStore((st) => (params.labelId ? st.byLabel[params.labelId] : undefined));
  const liveSerialOffset = serialInfo?.mode === 'batch' && continueEntry?.enabled ? continueEntry.offset : 0;
  /** Offset a running job started with (a resume re-uses the failed job's offset). */
  const jobSerialOffsetRef = useRef<number | null>(null);
  const serialOffsetRef = useRef(0);
  serialOffsetRef.current = jobSerialOffsetRef.current ?? liveSerialOffset;
  const serialCancelRef = useRef(false);
  const [serialCancelAsked, setSerialCancelAsked] = useState(false);

  const pageCount = useMemo(() => {
    if (isPdfJob) return Math.max(1, pdfPages.length);
    if (baseDocument?.bulk) return Math.max(1, baseDocument.bulk.rowCount);
    if (isExcelJob && excelSheet) return Math.max(1, excelSheet.rows.length);
    if (serialInfo) return serialInfo.count;
    if (baseDocument && excelSheet && printingSettings.autoPages) {
      return dataPageCount(baseDocument, excelSheet);
    }
    return 1;
  }, [isPdfJob, pdfPages.length, isExcelJob, excelSheet, baseDocument, printingSettings.autoPages, serialInfo]);

  const bulkPrintPlan = useMemo(() => {
    if (!baseDocument?.bulk) return null;
    const sheet = resolveBulkSheet(excelFiles, baseDocument.bulk);
    if (!sheet) return null;
    return planBulkPrint(
      sheet,
      baseDocument.bulk.copiesColumnIndex ?? null,
      copies,
      baseDocument.bulk.rowCopiesOverrides,
    );
  }, [baseDocument, excelFiles, copies]);

  const showCollate = Boolean(baseDocument?.bulk && bulkPrintPlan);
  // Collate only changes anything once the job repeats.
  const collateEnabled = Boolean(
    bulkPrintPlan && collateChangesOrder(bulkPrintPlan.rows, bulkPrintPlan.multiply),
  );

  const buildBasePageDocument = useCallback(
    (page: number): LabelDocument | null => {
      if (baseDocument?.bulk) {
        const sheet = resolveBulkSheet(excelFiles, baseDocument.bulk);
        if (sheet) return projectBulkDocument(baseDocument, sheet, page);
        return baseDocument;
      }
      if (isExcelJob && excelSheet) {
        return buildExcelRowDocument(
          excelSheet,
          page,
          params.docName ?? 'Data Label',
          defaults.labelWidth,
          defaults.labelHeight,
        );
      }
      if (baseDocument && excelSheet && pageCount > 1) {
        return resolveDocumentData(baseDocument, excelSheet, page);
      }
      return baseDocument;
    },
    [
      isExcelJob,
      excelSheet,
      excelFiles,
      params.docName,
      defaults.labelWidth,
      defaults.labelHeight,
      baseDocument,
      pageCount,
    ],
  );

  const buildPageDocument = useCallback(
    (page: number): LabelDocument | null => {
      const built = buildBasePageDocument(page);
      // Same resolver as the editor preview: what you see is what prints.
      if (built && serialInfo) {
        return resolveDocumentForIndex(built, serialInfo.mode === 'batch' ? page + serialOffsetRef.current : page);
      }
      return built;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildBasePageDocument, serialInfo, liveSerialOffset],
  );

  const applyDisplayTransforms = useCallback(
    (preview: LabelDocument | null): LabelDocument | null => {
      if (!preview || !printSize) return preview;
      if (ratTail143Job) {
        return refitRatTail143Document(preview);
      }
      if (cableFlagJob) {
        return cableFlagPrintDocument(preview);
      }
      if (jewelryDieCutJob && sourceDocument) {
        // Freeze author mm positions — no softFit/refit on the print path.
        const frozen = canonicalizeJewelryDieCutDocument(sourceDocument);
        if (printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) {
          return tileDocumentThreeUpDieCut54(frozen);
        }
        if (printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_2UP) {
          return tileDocumentTwoUpDieCut37(frozen);
        }
        // Single Label Tag: crop leftmost 14×96 column (not full sheet SIZE).
        return extractJewelryFirstColumnDocument(frozen);
      }
      if (isFitLabelImageOnlyDocument(preview)) {
        return refitFitLabelDocument(preview, printSize.widthMm, printSize.heightMm);
      }
      return applyPrintSize(preview, printPreset, printSize);
    },
    [
      printSize,
      printPreset,
      jewelryDieCutJob,
      cableFlagJob,
      ratTail143Job,
      sourceDocument,
    ],
  );

  const previewDocument = useMemo(
    () => buildPageDocument(Math.min(pageIndex, pageCount - 1)),
    [buildPageDocument, pageIndex, pageCount],
  );

  const displayDocument = useMemo(
    () => applyDisplayTransforms(previewDocument),
    [applyDisplayTransforms, previewDocument],
  );

  const jobDpi = (() => {
    const raw = jewelryJobDpi ?? cableJobDpi ?? ratTailJobDpi ?? getPrinterManager().getPrintDpi();
    return getPrinterManager().isJosh ? joshEffectiveDpi(raw) : raw;
  })();

  /** Printer-dot artboard. TD-404 captures packed BITMAP dots; others use SIZE dots. */
  const printCaptureSize = useMemo(() => {
    const doc = displayDocument ?? previewDocument;
    if (!doc) return { widthPx: 8, heightPx: 8 };
    const layout = printCaptureLayout(doc.widthMm, doc.heightMm, jobDpi);
    return printerSdkId === 'td404' ? layout.canvas : layout.content;
  }, [displayDocument, previewDocument, jobDpi, printerSdkId]);
  const printCaptureLayoutPx = useMemo(() => {
    const density = PixelRatio.get() || 1;
    return {
      widthPx: printCaptureSize.widthPx / density,
      heightPx: printCaptureSize.heightPx / density,
    };
  }, [printCaptureSize.widthPx, printCaptureSize.heightPx]);
  const printCaptureShotOptions = useMemo(
    () => printCaptureOptionsForSize(printCaptureSize.widthPx, printCaptureSize.heightPx),
    [printCaptureSize.widthPx, printCaptureSize.heightPx],
  );
  const captureLayoutPx = useRef<{ w: number; h: number } | null>(null);

  /** Gap Length is the liner between two die-cuts. Save it on the label so the next print sends the same GAP. */
  const changeGapLength = useCallback(
    (next: number) => {
      setGapLength(next);
      if (!params.labelId) return;
      const store = useLabelStore.getState();
      const stored = store.documents.find((d) => d.id === params.labelId);
      if (!stored) return;
      store.upsertDocument({
        ...stored,
        settings: { ...resolveLabelSettings(stored), gapLengthMm: next },
      });
    },
    [params.labelId],
  );

  /** Save the paper type on the label so the next print, the editor and Label Settings all use it. */
  const changePaperType = useCallback(
    (next: PaperType) => {
      setPaperType(next);
      if (!params.labelId) return;
      const store = useLabelStore.getState();
      const stored = store.documents.find((d) => d.id === params.labelId);
      if (!stored) return;
      store.upsertDocument(applyPaperType(stored, next));
    },
    [params.labelId],
  );

  /** Printer offset (Print screen, saved per printer) plus the label's own offset (Label Settings). */
  const printOffsetMm = useMemo(() => {
    const label = sourceDocument ? resolveLabelSettings(sourceDocument) : null;
    return {
      x: Math.round((hOffset + (label?.hOffsetMm ?? 0)) * 100) / 100,
      y: Math.round((vOffset + (label?.vOffsetMm ?? 0)) * 100) / 100,
    };
  }, [sourceDocument, hOffset, vOffset]);

  // Sync print size if a different document ID or dimension is loaded
  const lastDocKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!baseDocument) return;
    const docKey = `${baseDocument.id}_${baseDocument.widthMm}_${baseDocument.heightMm}`;
    if (docKey !== lastDocKeyRef.current) {
      lastDocKeyRef.current = docKey;
      setPrintPreset(defaultPreset);
      setPrintSize(defaultPrintSize);
      if (cableFlagJob) setOrientation('0°');
      if (ratTail143Job) setOrientation('90°');
    }
  }, [baseDocument, defaultPreset, defaultPrintSize, cableFlagJob, ratTail143Job]);

  // The Print preview renders the live vector document model via LabelPreview.
  // Hardware rasterization is executed on-demand during actual print dispatch.
  // A job that reconnects first passes through 'connecting' / 'scanning'; the pill must not
  // flash "Unconnected" while this screen is the one sending.
  const connected =
    status === 'connected' ||
    status === 'printing' ||
    (printing && (status === 'connecting' || status === 'scanning'));
  const footerHeight = 72 + insets.bottom;

  // Bound the preview to 42 % of the screen height so tall documents
  // (A4 portrait, long receipts) never overflow the preview area.
  const maxPreviewHeight = Math.round(height * 0.42);
  const baseCardWidth = Math.min(width - 48, MaxContentWidth - 48);
  const activeDoc = displayDocument ?? previewDocument;

  // Elements / Border offsets: TD-404 (any turn) and Josh (0°) whose label the headless raster draws.
  const layerBridge: LayerBridge | null = (() => {
    const mgr = getPrinterManager();
    if (mgr.usesTd404CommandSet) return 'td404';
    if (mgr.isJosh && orientation === '0°') return 'josh';
    return null;
  })();
  const layerOffsetsUsable = useMemo(
    () => layerBridge != null && !ratTail143Job && activeDoc != null && canHeadlessRasterPrint(activeDoc),
    [layerBridge, ratTail143Job, activeDoc],
  );
  const layerHasBorder = layerOffsetsUsable && labelHasOffsetBorder(activeDoc, layerBridge!);
  /** What is applied: zero when unsupported, and no border offset when the label has no border. */
  const effLayerOffsets: LayerOffsetsMm = layerOffsetsUsable
    ? effectiveLayerOffsets(activeDoc, layerOffsets, layerBridge!)
    : ZERO_LAYER_OFFSETS;
  const layerPreviewDocument = useMemo(
    () => (activeDoc && layerOffsetsUsable ? previewWithLayerOffsets(activeDoc, layerOffsets, layerBridge!) : activeDoc),
    [activeDoc, layerOffsetsUsable, layerOffsets, layerBridge],
  );
  const layerWarning = useMemo(() => {
    if (!layerOffsetsUsable) return null;
    const baked =
      layerBridge === 'josh'
        ? (() => {
            const ink = joshInkOffsetMm(printOffsetMm.x, printOffsetMm.y);
            return { x: ink.x + JOSH_ELEMENT_X_OFFSET_MM, y: ink.y };
          })()
        : td404ContentShiftMm(printOffsetMm);
    return layerOffsetWarning({
      doc: activeDoc,
      bridge: layerBridge!,
      offsets: layerOffsets,
      elementsBakedMm: baked,
      dpi: jobDpi,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerOffsetsUsable, layerBridge, activeDoc, layerOffsets, printOffsetMm.x, printOffsetMm.y]);
  const changeLayerOffset = useCallback(
    (layer: 'elements' | 'border', axis: 'x' | 'y', mm: number) => {
      const next: LayerOffsetsMm = {
        ...layerOffsets,
        [layer]: { ...layerOffsets[layer], [axis]: clampLayerOffsetMm(mm) },
      };
      setLayerOffsets(next);
      if (!params.labelId) return;
      const store = useLabelStore.getState();
      const stored = store.documents.find((d) => d.id === params.labelId);
      if (!stored) return;
      store.upsertDocument({
        ...stored,
        settings: {
          ...resolveLabelSettings(stored),
          elementsOffsetXMm: next.elements.x,
          elementsOffsetYMm: next.elements.y,
          borderOffsetXMm: next.border.x,
          borderOffsetYMm: next.border.y,
        },
      });
    },
    [layerOffsets, params.labelId],
  );
  const { widthPx: cardWidth, heightPx: cardHeight } = fitLabelSize(
    activeDoc?.widthMm ?? 80,
    activeDoc?.heightMm ?? 44,
    Math.round(baseCardWidth * zoom),
    Math.round(maxPreviewHeight * zoom),
  );
  const previewAreaMinHeight = maxPreviewHeight + 56; // 28 px padding each side

  // The print job rotates the bitmap by the chosen orientation, so show the label turned the same
  // way (clockwise, matching rotateGray). Quarter turns swap the box the label is fitted into.
  const previewTurn = ratTail143Job ? 0 : parseInt(orientation.replace('°', ''), 10);
  const previewQuarter = previewTurn === 90 || previewTurn === 270;
  const turned = fitLabelSize(
    previewQuarter ? (activeDoc?.heightMm ?? 44) : (activeDoc?.widthMm ?? 80),
    previewQuarter ? (activeDoc?.widthMm ?? 80) : (activeDoc?.heightMm ?? 44),
    Math.round(baseCardWidth * zoom),
    Math.round(maxPreviewHeight * zoom),
  );
  const previewBoxW = turned.widthPx;
  const previewBoxH = turned.heightPx;
  const previewDrawW = previewQuarter ? previewBoxH : previewBoxW;
  const previewDrawH = previewQuarter ? previewBoxW : previewBoxH;

  const historySource: PrintHistoryEntry['source'] = params.labelId
    ? 'label'
    : params.scanData
    ? 'scan'
    : params.imageUri
    ? 'photo'
    : isExcelJob
    ? 'excel'
    : isPdfJob
    ? 'pdf'
    : 'label';

  const jobName =
    previewDocument?.name ?? params.docName ?? (isPdfJob ? 'PDF Document' : 'Label');

  const handlePrint = useCallback(async () => {
    if (printingLockRef.current) return;
    printingLockRef.current = true;
    if (isPdfJob) {
      const manager = getPrinterManager();
      if (!manager.isConnected) {
        printingLockRef.current = false;
        Alert.alert(
          'Connect a printer first',
          'No printer is connected. Connect your printer first. You can print only after it is connected.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Connect printer', onPress: () => router.push('/printer-connect') },
          ],
        );
        return;
      }

      if (pdfPages.length === 0) {
        printingLockRef.current = false;
        Alert.alert('PDF Not Ready', 'Please wait for the PDF pages to finish rendering.');
        return;
      }

      setPrinting(true);
      try {
        const targetSelection = pageCount > 1 ? pageIndex : 'all';
        const pdfPaper = paperTypeCommand({
          printer: paperPrinterId({ isJosh: manager.isJosh, isDev: manager.isDev }),
          paperType,
          gapMm: gapLength,
        });
        console.info(
          `[PAPER-TYPE] ${pdfPaper.printer} ${paperType} ${formatPaperTypeSetting(pdfPaper)}`,
        );
        await printPdfToThermal(pdfPages, {
          pageSelection: targetSelection,
          copies,
          density: darkness ?? 10,
          speed: speed ?? 3,
          gapMm: pdfPaper.gapMm,
          mediaType: pdfPaper.media,
          docName: jobName,
        });

        // Josh shows its own "Print completed" card.
        if (!manager.isJosh) {
          Alert.alert(
            'Print Sent',
            `${jobName} was sent to ${deviceName ?? 'the printer'}.`,
          );
        }
        if (printingSettings.returnPrevious) router.back();
      } catch (error) {
        const message = formatPrintFailure(error);
        if (message) Alert.alert('Print Failed', message);
      } finally {
        printingLockRef.current = false;
        setPrinting(false);
      }
      return;
    }

    const manager = getPrinterManager();
    if (!manager.isConnected) {
      printingLockRef.current = false;
      Alert.alert(
        'Connect a printer first',
        'No printer is connected. Connect your printer first. You can print only after it is connected.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect printer', onPress: () => router.push('/printer-connect') },
        ],
      );
      return;
    }

    const widthMm = (displayDocument ?? previewDocument)?.widthMm ?? defaults.labelWidth;
    const heightMm = (displayDocument ?? previewDocument)?.heightMm ?? defaults.labelHeight;
    const orientationDeg = (
      ratTail143Job ? RAT_TAIL_143_PRINT.captureOrientation : parseInt(orientation.replace('°', ''), 10)
    ) as LabelOrientation;
    const paper = ratTail143Job
      ? ratTail143PrintPaper()
      : orientedPrintSize(widthMm, heightMm, orientationDeg);
    const sizeError = printJobSizeError(paper.widthMm, paper.heightMm);
    if (sizeError) {
      printingLockRef.current = false;
      Alert.alert('Unsupported Size', sizeError);
      return;
    }

    const bulkSheet = baseDocument?.bulk ? resolveBulkSheet(excelFiles, baseDocument.bulk) : null;
    const bulkPlan =
      baseDocument?.bulk && bulkSheet
        ? planBulkPrint(
            bulkSheet,
            baseDocument.bulk.copiesColumnIndex ?? null,
            copies,
            baseDocument.bulk.rowCopiesOverrides,
          )
        : null;
    if (bulkPlan?.allZero) {
      printingLockRef.current = false;
      Alert.alert('Nothing to print', 'Every row has 0 copies, so nothing was sent.');
      return;
    }
    if (bulkPlan?.overCap) {
      printingLockRef.current = false;
      Alert.alert(
        'Too many labels',
        `This job is ${bulkPlan.totalPhysical} labels. The limit is ${MAX_JOB_LABELS}.`,
      );
      return;
    }

    // ---- Serial labels: resume offer, validation gate and totals. All of it runs before label 1. ----
    const askChoice = (
      title: string,
      message: string,
      buttons: { text: string; value: string; style?: 'cancel' | 'destructive' }[],
    ) =>
      new Promise<string>((resolve) => {
        Alert.alert(
          title,
          message,
          buttons.map((b) => ({ text: b.text, style: b.style, onPress: () => resolve(b.value) })),
          { cancelable: true, onDismiss: () => resolve('cancel') },
        );
      });
    const releaseSerial = () => {
      jobSerialOffsetRef.current = null;
      serialCancelRef.current = false;
      setSerialCancelAsked(false);
      printingLockRef.current = false;
    };
    let serialRun: {
      cursor: SerialJobCursor | null;
      jobId: string;
      baseOffset: number;
      startAt: number;
      current: number;
      batch: boolean;
    } | null = null;
    if (serialInfo && baseDocument) {
      if (sourceDocument?.ups) {
        printingLockRef.current = false;
        Alert.alert('Serial labels', 'Serial labels are not available on multi-up labels yet.');
        return;
      }
      const batch = serialInfo.mode === 'batch';
      const labelId = params.labelId;
      const hash = designHash(baseDocument);
      let baseOffset = batch ? liveSerialOffset : 0;
      let startAt = 0;
      if (batch && labelId) {
        const info = resumeInfo(useSerialJobStore.getState().byLabel[labelId], hash);
        if (info) {
          const choice = await askChoice(
            'Continue the earlier print?',
            `The last print stopped at label ${info.resumeAt + 1} of ${info.total}. Label ${info.resumeAt + 1} may be half printed.` +
              (info.designChanged ? '\n\nThe label design has changed since then. Continuing uses the current design.' : ''),
            [
              { text: `Reprint label ${info.resumeAt + 1}`, value: 'reprint' },
              ...(info.skipTo < info.total ? [{ text: `Skip to label ${info.skipTo + 1}`, value: 'skip' }] : []),
              { text: 'Start over', value: 'restart', style: 'destructive' as const },
              { text: 'Cancel', value: 'cancel', style: 'cancel' as const },
            ],
          );
          if (choice === 'cancel') {
            printingLockRef.current = false;
            return;
          }
          if (choice === 'reprint' || choice === 'skip') {
            startAt = choice === 'reprint' ? info.resumeAt : info.skipTo;
            baseOffset = info.baseOffset;
          } else {
            useSerialJobStore.getState().clear(labelId);
          }
        }
      }
      const gate = serialPrintGate(baseDocument, serialInfo.count, baseOffset, jobDpi);
      if (gate.issues.length > 0) {
        printingLockRef.current = false;
        const lines = gate.issues.slice(0, 3).map((i) => i.message).join('\n\n');
        Alert.alert('Fix the serial before printing', `${lines}${gate.issues.length > 3 ? `\n\n...and ${gate.issues.length - 3} more.` : ''}\n\nNothing was sent.`);
        return;
      }
      const physical = (serialInfo.count - startAt) * copies;
      if (physical > SERIAL_CONFIRM_ABOVE) {
        const ok = await askChoice('Print many labels?', `This job prints ${physical} labels.`, [
          { text: `Print ${physical}`, value: 'yes' },
          { text: 'Cancel', value: 'cancel', style: 'cancel' },
        ]);
        if (ok !== 'yes') {
          printingLockRef.current = false;
          return;
        }
      }
      const jobId = newJobId();
      const cursor =
        batch && labelId
          ? newCursor({ jobId, labelId, designHash: hash, total: serialInfo.count, baseOffset, startAt })
          : null;
      if (cursor) useSerialJobStore.getState().save(cursor);
      jobSerialOffsetRef.current = baseOffset;
      serialCancelRef.current = false;
      setSerialCancelAsked(false);
      serialRun = { cursor, jobId, baseOffset, startAt, current: startAt, batch };
    }

    const collateJob = Boolean(
      bulkPlan && collate && collateChangesOrder(bulkPlan.rows, bulkPlan.multiply),
    );
    let labelsCompleted = 0;
    let serialCancelled = false;

    useSettingsStore.getState().patchDefaults({ paperType });
    setPrinting(true);
    const timer = new PrintTimingLogger();

    try {
      const dieCutJob = jewelryDieCutJob || cableFlagJob || ratTail143Job;
      const printerState = usePrinterStore.getState();
      const jobBridge = resolveQualityBridge({
        activeTransport: manager.transport,
        storeTransport: printerState.transport,
        sdkId: printerState.sdkId,
      });
      const jobCaps = qualityCapsFor(jobBridge);
      const quality = resolvePrintQuality({
        darkness,
        speed,
        grayThreshold: defaults.grayThreshold,
        colorMode: defaults.colorMode,
        dieCut: dieCutJob,
        jewelry: jewelryDieCutJob,
        caps: jobCaps,
      });
      const { density: printDensity, threshold, speed: qualitySpeed, dither } = quality;
      const inkSteps = darknessSteps(darkness, jobCaps);
      // TD-404 at 0°: the saved offset, plus the fixed element shift, is drawn
      // into the elements. The border is a later layer and stays put. Rotated
      // headless jobs do the same in dots (offset before the turn, registration
      // after it) and send 0 on REFERENCE; only the ViewShot fallback of a
      // rotated job still sends the saved offset on REFERENCE.
      const bakeOffset = manager.usesTd404CommandSet && orientationDeg === 0;
      const offsetH = bakeOffset ? 0 : printOffsetMm.x;
      const offsetV = bakeOffset ? 0 : printOffsetMm.y;
      const fitLabelJob =
        (displayDocument ?? previewDocument) != null &&
        isFitLabelImageOnlyDocument(displayDocument ?? previewDocument!);
      // Device-confirmed: SPEED 1 keeps Fit Label barcode/QR modules from filling.
      const printSpeed = fitLabelJob && speed == null ? 1 : qualitySpeed;
      console.info(
        `[print] Advanced params → density=${printDensity} speed=${printSpeed} threshold=${threshold} gap=${gapLength}mm offset=${printOffsetMm.x}x${printOffsetMm.y}mm (${bakeOffset ? 'bitmap' : 'REFERENCE'}) darknessUI=${darkness ?? 'Auto'} speedUI=${speed ?? 'Auto'} bridge=${jobBridge ?? 'none'} densityMode=${darkness == null ? 'auto' : 'manual'} speedMode=${speed == null ? 'auto' : 'manual'} inkSteps=${inkSteps}`,
      );
      const firstPageDoc =
        applyDisplayTransforms(buildPageDocument(0)) ?? displayDocument ?? previewDocument;
      // Images set to a Dither mode are turned into finished dots once, here, so the headless raster
      // can draw them. TD-404 and Josh only: other bridges keep the old image path.
      const prepareModedImages = async (doc: LabelDocument | null | undefined) => {
        if (!doc || !(manager.usesTd404CommandSet || manager.isJosh)) return;
        await prepareImageTiles(doc, jobDpi);
      };
      await prepareModedImages(firstPageDoc);
      const rasterJoshMono = async (doc: LabelDocument): Promise<RasterBitmap | null> => {
        try {
          assertHeadlessRasterDocument(doc);
          await ensurePrintTypefacesForDocument(doc);
          if (missingPrintTypefaces(doc).length > 0) return null;
          const t0 = Date.now();
          const timed = rasterizeDocumentToBitmapTimed(
            doc,
            jobDpi,
            orientationDeg === 0
              ? joshHeadlessRasterOptions(
                  jobDpi,
                  printOffsetMm.x,
                  printOffsetMm.y,
                  { threshold, darknessSteps: inkSteps },
                  effLayerOffsets,
                )
              : { threshold, darknessSteps: inkSteps },
          );
          console.info(`[JOSH-MONO] raster ${Date.now() - t0} ms`);
          return timed.result;
        } catch (err) {
          console.warn('[JOSH-MONO] raster failed', err);
          return null;
        }
      };
      const joshHeadlessNow =
        manager.isJosh &&
        orientationDeg === 0 &&
        firstPageDoc != null &&
        canHeadlessRasterPrint(firstPageDoc) &&
        Math.abs(firstPageDoc.widthMm - paper.widthMm) <= 0.2 &&
        Math.abs(firstPageDoc.heightMm - paper.heightMm) <= 0.2;
      const joshRasterPromise: Promise<RasterBitmap | null> =
        joshHeadlessNow && firstPageDoc ? rasterJoshMono(firstPageDoc) : Promise.resolve(null);
      const joshConnectPromise = manager.isJosh
        ? manager.ensureConnected().catch((err) => ({ error: err }))
        : Promise.resolve(null);
      if (!fitLabelJob) {
        await Promise.all([
          loadInstalledFontsIntoRuntime().catch((err) => {
            console.warn('[print] installed fonts failed to load', err);
          }),
          manager.isJosh ? Promise.resolve() : waitForNextPaint(),
        ]);
      }

      const printJobs = bulkPlan
        ? bulkSendList(bulkPlan.rows, collateJob, bulkPlan.multiply).map((item) => ({
            page: item.rowIndex,
            sendCopies: item.copies,
            copyNumber: item.copyNumber,
            round: item.round,
          }))
        : serialRun?.batch
          ? expandSerialBatch({ count: serialInfo!.count, copies, collate: false, startAt: serialRun.startAt }).map((item) => ({
              page: item.labelIndex,
              sendCopies: item.copies,
              copyNumber: item.copyNumber,
              round: item.round,
            }))
          : Array.from({ length: pageCount }, (_, page) => ({
              page,
              sendCopies: copies,
              copyNumber: 1,
              round: 1,
            }));
      const rowRasters = new Map<number, CachedRowPrint>();
      for (let jobIndex = 0; jobIndex < printJobs.length; jobIndex++) {
        const { page, sendCopies, copyNumber, round } = printJobs[jobIndex];
        // Cancel takes effect between labels, so a label is never abandoned half sent.
        if (serialRun && serialCancelRef.current) {
          serialCancelled = true;
          break;
        }
        const serialIndexNow = serialRun ? (serialRun.batch ? page + serialRun.baseOffset : page) : 0;
        const serialLogBase = serialRun
          ? {
              jobId: serialRun.jobId,
              label: page + 1,
              total: pageCount,
              serialIndex: serialIndexNow,
              value: baseDocument ? describeSerialValues(baseDocument, serialIndexNow) : '',
              copies: sendCopies,
            }
          : null;
        if (serialRun && serialLogBase) {
          serialRun.current = page;
          console.info(serialPrintLogLine({ ...serialLogBase, copy: 1, state: 'sent' }));
        }
        if (bulkPlan) {
          console.info(
            `[print] label ${page} copy ${copyNumber} round ${round} total ${labelsCompleted}/${bulkPlan.totalPhysical} copies ${sendCopies}`,
          );
          // Josh progress line: the app's own send count; the SDK events fill in the state of each send.
          useJoshProgressStore.getState().setBulk(labelsCompleted + 1, bulkPlan.totalPhysical);
        } else {
          useJoshProgressStore.getState().setBulk(null, null);
        }
        const pageStart = Date.now();
        const cachedRow = bulkPlan ? rowRasters.get(page) : undefined;
        let pageDoc: LabelDocument | null = null;
        let fitLabelExtract = false;
        let td404HeadlessMono = false;
        let joshHeadlessCandidate = false;
        let captureResolvedAt = 0;
        let base64 = '';
        let rotatedBase64 = '';
        let connectionMs = 0;
        let captureMs = 0;
        let fitLabelDecodeMs = 0;
        let fitLabelRasterMs = 0;
        let fitLabelMono: FitLabelPrintPayload | null = null;
        let joshFacesReady = false;
        let joshMonoBitmap: RasterBitmap | null = null;
        if (cachedRow) {
          pageDoc = cachedRow.pageDoc;
          fitLabelExtract = cachedRow.fitLabelExtract;
          td404HeadlessMono = cachedRow.td404HeadlessMono;
          joshHeadlessCandidate = cachedRow.joshHeadlessCandidate;
          captureResolvedAt = cachedRow.captureResolvedAt;
          base64 = cachedRow.base64;
          rotatedBase64 = cachedRow.rotatedBase64;
          connectionMs = cachedRow.connectionMs;
          captureMs = cachedRow.captureMs;
          fitLabelDecodeMs = cachedRow.fitLabelDecodeMs;
          fitLabelRasterMs = cachedRow.fitLabelRasterMs;
          fitLabelMono = cachedRow.fitLabelMono;
          joshFacesReady = cachedRow.joshFacesReady;
          joshMonoBitmap = cachedRow.joshMonoBitmap;
        } else {
        pageDoc =
          applyDisplayTransforms(buildPageDocument(page)) ?? displayDocument ?? previewDocument;
        fitLabelExtract = pageDoc != null && isFitLabelImageOnlyDocument(pageDoc);
        await prepareModedImages(pageDoc);
        if (pageCount > 1) {
          setPageIndex(page);
          if (!fitLabelExtract && !manager.isJosh) {
            timer.start('pageWaitForPaint');
            await waitForNextPaint();
            timer.end('pageWaitForPaint');
          }
        }

        // Rotated jobs are turned in dots too: the doc is the un-turned label, the paper is turned.
        const quarterTurn = orientationDeg === 90 || orientationDeg === 270;
        td404HeadlessMono =
          manager.usesTd404CommandSet &&
          pageDoc != null &&
          canHeadlessRasterPrint(pageDoc) &&
          Math.abs(pageDoc.widthMm - (quarterTurn ? paper.heightMm : paper.widthMm)) <= 0.2 &&
          Math.abs(pageDoc.heightMm - (quarterTurn ? paper.widthMm : paper.heightMm)) <= 0.2;
        joshHeadlessCandidate =
          manager.isJosh &&
          orientationDeg === 0 &&
          pageDoc != null &&
          canHeadlessRasterPrint(pageDoc) &&
          Math.abs(pageDoc.widthMm - paper.widthMm) <= 0.2 &&
          Math.abs(pageDoc.heightMm - paper.heightMm) <= 0.2;

        timer.start('capture+verify');
        const captureTarget = printCaptureLayout(widthMm, heightMm, jobDpi).content;
        if (td404HeadlessMono || joshHeadlessCandidate) {
          const tConn0 = Date.now();
          const [connectionResult, bitmap] = await Promise.all([
            manager.isJosh ? joshConnectPromise : manager.ensureConnected().catch((err) => {
              return { error: err };
            }),
            page === 0
              ? joshRasterPromise
              : joshHeadlessCandidate && pageDoc
                ? rasterJoshMono(pageDoc)
                : Promise.resolve(null),
          ]);
          connectionMs = Date.now() - tConn0;
          joshMonoBitmap = bitmap;
          joshFacesReady = bitmap != null;
          if (td404HeadlessMono || joshFacesReady) {
            timer.end('capture+verify');
            if (connectionResult && 'error' in connectionResult) {
              throw connectionResult.error;
            }
          } else {
            if (connectionResult && 'error' in connectionResult) {
              throw connectionResult.error;
            }
            const tCap0 = Date.now();
            const png = await captureRef(shotRef, printCaptureShotOptions).catch(async () => {
              await waitForNextPaint();
              return captureRef(shotRef, printCaptureShotOptions);
            });
            captureMs = Date.now() - tCap0;
            logCaptureSha1('bitmap', png, uiScheme);
            captureResolvedAt = Date.now();
            timer.end('capture+verify');
            if (!png) {
              throw new Error('Could not capture the label for printing.');
            }
            base64 = png;
            rotatedBase64 = rotatePngBase64(
              applyInkDarknessToPng(base64, inkSteps, threshold, pageDoc),
              orientationDeg,
            );
          }
        } else if (fitLabelExtract && pageDoc) {
          const tConn0 = Date.now();
          const tCap0 = Date.now();
          const [connectionResult, extracted] = await Promise.all([
            manager.ensureConnected().catch((err) => {
              return { error: err };
            }).then((res) => {
              connectionMs = Date.now() - tConn0;
              return res;
            }),
            (async () => {
              const imageEl = fitLabelPrintImageElement(pageDoc);
              if (!imageEl) throw new Error('This Fit Label has no print image.');
              const sourceUri = fitLabelPrintSourceUri(imageEl);
              if (!sourceUri) throw new Error('This Fit Label is missing the original print image.');
              await new Promise<void>((resolve) => setTimeout(resolve, 32));
              const maxEdge = fitLabelDecodeMaxEdgePx(pageDoc.widthMm, pageDoc.heightMm, jobDpi);
              const scaled = await downscaleImageUriToMaxEdge(sourceUri, maxEdge);
              const tDecode0 = Date.now();
              try {
                const decoded = await decodeGalleryImage(scaled.uri);
                const decodeMs = Date.now() - tDecode0;
                const tRaster0 = Date.now();
                const payload = buildFitLabelPrintPayload(decoded.gray, pageDoc, {
                  dpi: jobDpi,
                  threshold,
                  orientationDeg,
                });
                return {
                  payload,
                  decodeMs,
                  rasterMs: Date.now() - tRaster0,
                  sourceWidth: decoded.sourceWidth,
                  sourceHeight: decoded.sourceHeight,
                  decodedWidth: decoded.normalizedWidth,
                  decodedHeight: decoded.normalizedHeight,
                };
              } finally {
                if (scaled.downscaled && scaled.uri !== sourceUri) {
                  await FileSystem.deleteAsync(scaled.uri, { idempotent: true }).catch(() => undefined);
                }
              }
            })(),
          ]);
          captureMs = Date.now() - tCap0;
          captureResolvedAt = Date.now();
          timer.end('capture+verify');
          if (connectionResult && 'error' in connectionResult) {
            throw connectionResult.error;
          }
          fitLabelMono = extracted.payload;
          fitLabelDecodeMs = extracted.decodeMs;
          fitLabelRasterMs = extracted.rasterMs;
          if (!manager.usesTd404CommandSet) {
            base64 = grayToPngBase64(extracted.payload.gray);
            rotatedBase64 = base64;
          }
          console.info(
            '[print] Fit Label extract (SIZE dots, BITMAP packed dots):',
            `src ${extracted.sourceWidth}x${extracted.sourceHeight}`,
            `| decoded ${extracted.decodedWidth}x${extracted.decodedHeight}`,
            `| SIZE ${extracted.payload.sizeDotsW}x${extracted.payload.sizeDotsH}`,
            `| BITMAP ${extracted.payload.widthDots}x${extracted.payload.heightDots} bytes/row=${extracted.payload.bytesPerRow}`,
            `| gray ${extracted.payload.gray.width}x${extracted.payload.gray.height}`,
            `| threshold=${threshold} density=${printDensity} speed=${printSpeed}`,
            `| connection_ms=${connectionMs} decode_ms=${extracted.decodeMs} raster_ms=${extracted.rasterMs}`,
          );
          logPrintTrace('EDITOR_CAPTURE', {
            userWidthMm: widthMm,
            userHeightMm: heightMm,
            paperWidthMm: paper.widthMm,
            paperHeightMm: paper.heightMm,
            captureTargetW: captureTarget.widthPx,
            captureTargetH: captureTarget.heightPx,
            pixelRatio: PixelRatio.get(),
            pngBase64Chars: base64.length,
            jobDpi,
            connection_ms: connectionMs,
            capture_ms: captureMs,
            decode_ms: extracted.decodeMs,
            raster_ms: extracted.rasterMs,
            source_px: `${extracted.sourceWidth}x${extracted.sourceHeight}`,
            decoded_px: `${extracted.decodedWidth}x${extracted.decodedHeight}`,
            size_dots: `${extracted.payload.sizeDotsW}x${extracted.payload.sizeDotsH}`,
            packed_dots: `${extracted.payload.widthDots}x${extracted.payload.heightDots}`,
            note: 'Fit Label printUri extract; one JS decode then SIZE-dot box-average/nearest. ViewShot skipped. No native bilinear.',
          });
        } else {
          const tConn0 = Date.now();
          const capturePacked = async () => {
            const pngBase64 = await captureRef(shotRef, printCaptureShotOptions);
            logCaptureSha1('packed', pngBase64, uiScheme);
            captureResolvedAt = Date.now();
            return pngBase64;
          };
          const [connectionResult, captured] = await Promise.all([
            manager.ensureConnected().catch((err) => {
              return { error: err };
            }).then((res) => {
              connectionMs = Date.now() - tConn0;
              return res;
            }),
            (async () => {
              const tCap0 = Date.now();
              try {
                const png = await capturePacked().catch(async () => {
                  await waitForNextPaint();
                  return capturePacked();
                });
                captureMs = Date.now() - tCap0;
                return png;
              } catch (err) {
                captureMs = Date.now() - tCap0;
                throw err;
              }
            })(),
          ]);
          timer.end('capture+verify');

          if (connectionResult && 'error' in connectionResult) {
            throw connectionResult.error;
          }

          const tCapture1 = Date.now();
          console.info('[print] ViewShot capture+verify:', tCapture1 - pageStart, 'ms |', Math.round((captured?.length ?? 0) / 1024), 'KB base64', `| connection_ms=${connectionMs} capture_ms=${captureMs}`);
          if (!captured) {
            throw new Error('Could not capture the label for printing.');
          }
          base64 = captured;

          // Rotate once in JS, uniformly for every printer SDK. Native rotation is
          // only correct on TD-404/Josh; Dev/Tez either ignore orientation or apply
          // it incorrectly (see printer-manager.ts). Pre-rotating here and always
          // telling native `orientation: 0` makes all four SDKs share one, tested,
          // lossless rotation path (rotateGray — exact axis transpose, no skew).
          rotatedBase64 = rotatePngBase64(
            applyInkDarknessToPng(base64, inkSteps, threshold, pageDoc),
            orientationDeg,
          );

          logPrintTrace('EDITOR_CAPTURE', {
            userWidthMm: widthMm,
            userHeightMm: heightMm,
            paperWidthMm: paper.widthMm,
            paperHeightMm: paper.heightMm,
            captureTargetW: captureTarget.widthPx,
            captureTargetH: captureTarget.heightPx,
            pixelRatio: PixelRatio.get(),
            pngBase64Chars: base64.length,
            jobDpi,
            connection_ms: connectionMs,
            capture_ms: captureMs,
            note: 'Packed BITMAP PNG is encoded to TSPL. ViewShot is ink only; millimetres come from PrintGeometry.',
          });
        }

          if (bulkPlan) {
            rememberRowRaster(rowRasters, page, () => ({
              pageDoc,
              fitLabelExtract,
              td404HeadlessMono,
              joshHeadlessCandidate,
              captureResolvedAt,
              base64,
              rotatedBase64,
              connectionMs,
              captureMs,
              fitLabelDecodeMs,
              fitLabelRasterMs,
              fitLabelMono,
              joshFacesReady,
              joshMonoBitmap,
              td404Bitmap: null,
            }));
          }
        }

        const paperCommand = paperTypeCommand({
          printer: paperPrinterId({ isJosh: manager.isJosh, isDev: manager.isDev }),
          paperType,
          gapMm: gapLength,
          labelName: jobName,
        });
        const media = paperCommand.media;
        const sentGapMm = paperCommand.gapMm;
        console.info(
          `[PAPER-TYPE] ${paperCommand.printer} ${paperType} ${formatPaperTypeSetting(paperCommand)}`,
        );

        const td404Job = manager.usesTd404CommandSet
          ? resolveTd404JobParams({
              density: printDensity,
              speed: printSpeed,
              gapMm: gapLength,
              paperType,
            })
          : null;
        const joshJob = manager.isJosh
          ? resolveJoshJobParams({
              density: printDensity,
              speed: printSpeed,
              gapMm: gapLength,
              paperType,
            })
          : null;

        const artworkPhoto = Boolean(params.imageUri) && !params.labelId;

        let usedNative = false;
        if (manager.isLabelX) {
          console.info(
            `[LABELX-PRINT] Label print via Label X LuckPrinter SDK: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm, copies=${sendCopies}, media=${media}`,
          );
          timer.start('transmit');
          await manager.printLabelXPngLabelFast({
            pngBase64: ratTail143Job
              ? rotatePngBase64(base64, RAT_TAIL_143_PRINT.captureOrientation)
              : base64,
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: gapLength,
            copies: sendCopies,
            density: printDensity !== undefined && printDensity !== null ? Math.min(2, Math.max(0, Math.floor(printDensity / 5))) : 1,
            speed: printSpeed,
            hOffsetMm: offsetH,
            vOffsetMm: offsetV,
            media: media,
            threshold,
            dither,
          });
          usedNative = true;
          timer.end('transmit');
          console.info(
            `[LABELX-PRINT] page ${page + 1} total: ${Date.now() - pageStart} ms | Label X LuckPrinter SDK path`,
          );
        } else if (manager.isTez) {
          console.info(
            `[TEZ-PRINT] Label print via OEM PrintSDK: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm, copies=${sendCopies}, media=${media}`,
          );
          timer.start('transmit');
          await manager.printTezPngLabelFast({
            pngBase64: rotatedBase64,
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: gapLength,
            copies: sendCopies,
            density: printDensity,
            speed: printSpeed,
            orientation: 0,
            dpi: jobDpi,
            hOffsetMm: offsetH,
            vOffsetMm: offsetV,
            media: media,
            threshold: jewelryDieCutJob ? Math.max(threshold, 168) : threshold,
          });
          usedNative = true;
          timer.end('transmit');
          console.info(
            `[TEZ-PRINT] page ${page + 1} total: ${Date.now() - pageStart} ms | Tez OEM PrintSDK path`,
          );
        } else if (manager.isJosh) {
          const joshBakeOffset = orientationDeg === 0;
          const joshInkMm = joshInkOffsetMm(printOffsetMm.x, printOffsetMm.y);
          const joshInkRotatedMm = joshInkOffsetMm(offsetH, offsetV);
          console.info(
            `[JOSH] inkOffset=${joshInkMm.x}x${joshInkMm.y}mm (${joshBakeOffset ? 'bitmap/capture' : 'LPAPI'})`,
          );
          timer.start('transmit');
          try {
            if (joshFacesReady && pageDoc && joshMonoBitmap) {
              console.info(
                `[JOSH-MONO-P1] Headless dots print: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm ink=${joshInkMm.x}x${joshInkMm.y}mm`,
              );
              const bitmap = joshMonoBitmap;
              usedNative = await manager.printJoshMonoLabelFast({
                monoBytes: bitmap.mono1bppBuffer,
                widthDots: bitmap.widthDots,
                heightDots: bitmap.heightDots,
                bytesPerRow: bitmap.bytesPerRow,
                widthMm: pageDoc.widthMm,
                heightMm: pageDoc.heightMm,
                gapMm: joshJob?.gapMm ?? gapLength,
                copies: sendCopies,
                density: joshJob?.density ?? printDensity,
                speed: joshJob?.speed ?? printSpeed,
                hOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.x,
                vOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.y,
                media: joshJob?.media ?? media,
                dpi: jobDpi,
              });
              if (!usedNative) {
                throw new Error(
                  'NATIVE_MONO_UNAVAILABLE: rebuild the Android binary so JOSH printMonoLabel is present.',
                );
              }
              console.info(
                `[JOSH-MONO-P5] page ${page + 1} total: ${Date.now() - pageStart} ms | headless dots @ ${jobDpi}dpi`,
              );
            } else {
              console.info(
                `[JOSH-PRINT-P1:PREFLIGHT] PNG fallback: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm`,
              );
              await manager.printJoshPngLabelFast({
                pngBase64: rotatedBase64,
                widthMm: paper.widthMm,
                heightMm: paper.heightMm,
                gapMm: joshJob?.gapMm ?? gapLength,
                copies: sendCopies,
                density: joshJob?.density ?? printDensity,
                speed: joshJob?.speed ?? printSpeed,
                orientation: 0,
                dpi: jobDpi,
                hOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.x,
                vOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.y,
                media: joshJob?.media ?? media,
                alignment: manager.getActivePrinterProfile().alignment,
              });
              usedNative = true;
              console.info(
                `[JOSH-PRINT-P5:FINALIZE] page ${page + 1} total: ${Date.now() - pageStart} ms | JOSH PNG fallback`,
              );
            }
          } catch (err) {
            if (joshHeadlessCandidate) {
              console.warn('[print] JOSH headless mono failed, falling back to ViewShot PNG:', err);
              if (!rotatedBase64) {
                await waitForNextPaint();
                const captured = await captureRef(shotRef, printCaptureShotOptions);
                if (!captured) throw err instanceof Error ? err : new Error(String(err));
                logCaptureSha1('josh-fallback', captured, uiScheme);
                base64 = captured;
                rotatedBase64 = rotatePngBase64(
                  applyInkDarknessToPng(base64, inkSteps, threshold, pageDoc),
                  orientationDeg,
                );
              }
              await manager.printJoshPngLabelFast({
                pngBase64: rotatedBase64,
                widthMm: paper.widthMm,
                heightMm: paper.heightMm,
                gapMm: joshJob?.gapMm ?? gapLength,
                copies: sendCopies,
                density: joshJob?.density ?? printDensity,
                speed: joshJob?.speed ?? printSpeed,
                orientation: 0,
                dpi: jobDpi,
                hOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.x,
                vOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.y,
                media: joshJob?.media ?? media,
                alignment: manager.getActivePrinterProfile().alignment,
              });
              usedNative = true;
            } else {
              throw err;
            }
          }
          timer.end('transmit');
        } else if (manager.isDev) {
          console.info(
            `[DEV-PRINT-P1:PREFLIGHT] Label print dispatching via DEV AutoReplyPrint SDK: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm, copies=${sendCopies}`,
          );
          timer.start('sdkFastPrint');
          try {
            usedNative = await manager.printDevPngLabelFast({
              pngBase64: rotatedBase64,
              widthMm: paper.widthMm,
              heightMm: paper.heightMm,
              gapMm: sentGapMm,
              copies: sendCopies,
              density: darkness != null ? printDensity : 14,
              speed: speed != null ? printSpeed : 3,
              threshold,
              vOffsetMm: offsetV,
              hOffsetMm: offsetH,
              media: media,
              orientation: 0,
              dpi: jobDpi,
              dither,
            });
            if (usedNative) {
              console.info(
                `[print] page ${page + 1} total: ${Date.now() - pageStart} ms | AutoReplyPrint native fast path (DEV)`,
              );
            }
          } catch (err) {
            console.warn('[print] DEV native print failed:', err);
            throw err;
          }
          timer.end('sdkFastPrint');
        } else if (manager.usesTd404CommandSet) {
          // Native TD-404: headless Skia mono when every layer is rasterizable (dot-perfect
          // positioning); ViewShot PNG only for photos/signatures/tables/etc.
          timer.start('sdkFastPrint');
          try {
            if (td404HeadlessMono && pageDoc) {
              const cachedBitmap = rowRasters.get(page)?.td404Bitmap ?? null;
              let bitmap = cachedBitmap;
              let docPrepMs = 0;
              let rasterizeMs = 0;
              let bitpackMs = 0;
              if (!bitmap) {
                const tPrep0 = Date.now();
                assertHeadlessRasterDocument(pageDoc);
                await ensurePrintTypefacesForDocument(pageDoc);
                docPrepMs = Date.now() - tPrep0;
                const timed = rasterizeDocumentToBitmapTimed(pageDoc, jobDpi, {
                  threshold,
                  darknessSteps: inkSteps,
                  bakeTd404Feed: true,
                  // The border has its own layer and its own offset (paper frame, so a turned job
                  // maps the label-frame offset first). Elements offset joins the element shift.
                  edgeBorders: td404EdgeBorderOptions(jobDpi, offsetToPaperFrame(effLayerOffsets.border, orientationDeg)),
                  // 0°: offset and registration shift the elements together. Rotated: the offset
                  // moves the label before the turn, registration is applied to the paper after it.
                  ...(orientationDeg === 0
                    ? { shiftDots: td404ContentShiftDots(jobDpi, printOffsetMm, effLayerOffsets.elements) }
                    : {
                        rotationDeg: orientationDeg,
                        shiftDots: td404UserShiftDots(jobDpi, printOffsetMm, effLayerOffsets.elements),
                        paperShiftDots: td404ContentShiftDots(jobDpi),
                      }),
                });
                bitmap = timed.result;
                rasterizeMs = timed.rasterizeMs;
                bitpackMs = timed.bitpackMs;
                const entry = rowRasters.get(page);
                if (entry) entry.td404Bitmap = bitmap;
              }
              const tNative0 = Date.now();
              usedNative = await manager.printMonoLabelFast({
                monoBytes: bitmap.mono1bppBuffer,
                widthDots: bitmap.widthDots,
                heightDots: bitmap.heightDots,
                bytesPerRow: bitmap.bytesPerRow,
                widthMm: paper.widthMm,
                heightMm: paper.heightMm,
                gapMm: td404Job?.gapMm ?? gapLength,
                copies: sendCopies,
                density: td404Job?.density ?? printDensity,
                speed: td404Job?.speed ?? printSpeed,
                // Everything is already in the bitmap: no printer-side shift.
                vOffsetMm: 0,
                hOffsetMm: 0,
                media: td404Job?.media ?? media,
                dpi: jobDpi,
              });
              const nativeCallMs = Date.now() - tNative0;
              if (!usedNative) {
                throw new Error(
                  'NATIVE_MONO_UNAVAILABLE: rebuild the Android binary so printMonoLabel is present.',
                );
              }
              const monoTiming = manager.getLastTd404MonoLabelTiming();
              const totalMs = Date.now() - pageStart;
              const accounted =
                connectionMs + docPrepMs + rasterizeMs + bitpackMs + nativeCallMs;
              const unaccountedMs = Math.max(0, totalMs - accounted);
              console.info(
                `[print] page ${page + 1} total: ${totalMs} ms | TD-404 printMonoLabel (headless) writeMs=${monoTiming?.writeMs ?? '?'} bytesSent=${monoTiming?.bytesSent ?? '?'} connection_ms=${connectionMs} doc_prep_ms=${docPrepMs} native_call_ms=${nativeCallMs} unaccounted_ms=${unaccountedMs.toFixed(1)}`,
              );
              logPrintTrace('PIPELINE', {
                path: 'headless_skia',
                connection_ms: connectionMs,
                doc_prep_ms: docPrepMs,
                rasterize_ms: rasterizeMs,
                bitpack_ms: bitpackMs,
                native_call_ms: nativeCallMs,
                unaccounted_ms: Number(unaccountedMs.toFixed(1)),
                decode_ms: 0,
                transport_write_ms: monoTiming?.writeMs ?? null,
                total_ms: totalMs,
                buffer_bytes: monoTiming?.jobBytes ?? null,
                width_mm: pageDoc.widthMm,
                height_mm: pageDoc.heightMm,
                width_dots: bitmap.widthDots,
                height_dots: bitmap.heightDots,
                bytes_per_row: bitmap.bytesPerRow,
                gate_15ms: rasterizeMs + bitpackMs < 15 ? 'pass' : 'fail',
                note: 'Production headless mono — canvas mm maps 1:1 to packed BITMAP dots (same as calibration/location harness).',
              });
            } else if (fitLabelMono) {
              const tNative0 = Date.now();
              usedNative = await manager.printMonoLabelFast({
                monoBytes: fitLabelMono.bits.data,
                widthDots: fitLabelMono.widthDots,
                heightDots: fitLabelMono.heightDots,
                bytesPerRow: fitLabelMono.bytesPerRow,
                widthMm: paper.widthMm,
                heightMm: paper.heightMm,
                gapMm: td404Job?.gapMm ?? gapLength,
                copies: sendCopies,
                density: td404Job?.density ?? printDensity,
                speed: td404Job?.speed ?? printSpeed,
                vOffsetMm: offsetV,
                hOffsetMm: offsetH,
                media: td404Job?.media ?? media,
                dpi: jobDpi,
              });
              const nativeCallMs = Date.now() - tNative0;
              if (!usedNative) {
                throw new Error(
                  'NATIVE_MONO_UNAVAILABLE: rebuild the Android binary so printMonoLabel is present.',
                );
              }
              const monoTiming = manager.getLastTd404MonoLabelTiming();
              const totalMs = Date.now() - pageStart;
              console.info(
                `[print] page ${page + 1} total: ${totalMs} ms | TD-404 printMonoLabel (Fit Label) writeMs=${monoTiming?.writeMs ?? '?'} bytesSent=${monoTiming?.bytesSent ?? '?'} connection_ms=${connectionMs} native_call_ms=${nativeCallMs}`,
              );
              logPrintTrace('PIPELINE', {
                path: 'fit_label_mono',
                connection_ms: connectionMs,
                capture_ms: captureMs,
                decode_ms: fitLabelDecodeMs,
                raster_ms: fitLabelRasterMs,
                native_call_ms: nativeCallMs,
                transport_write_ms: monoTiming?.writeMs ?? null,
                total_ms: totalMs,
                buffer_bytes: monoTiming?.jobBytes ?? null,
                width_mm: paper.widthMm,
                height_mm: paper.heightMm,
                width_dots: fitLabelMono.widthDots,
                height_dots: fitLabelMono.heightDots,
                size_dots: `${fitLabelMono.sizeDotsW}x${fitLabelMono.sizeDotsH}`,
                bytes_per_row: fitLabelMono.bytesPerRow,
                threshold,
                density: printDensity,
                speed: printSpeed,
                note: 'Fit Label extract packed 1-bit BITMAP in printer dots. Shared resolvePrintQuality darkness/speed. No native bilinear.',
              });
            } else {
              usedNative = await tryNativeSdkPngPrint({
                pngBase64: rotatedBase64,
                widthMm: paper.widthMm,
                heightMm: paper.heightMm,
                gapMm: td404Job?.gapMm ?? gapLength,
                copies: sendCopies,
                density: td404Job?.density ?? printDensity,
                speed: td404Job?.speed ?? printSpeed,
                vOffsetMm: offsetV,
                hOffsetMm: offsetH,
                media: td404Job?.media ?? media,
                orientation: 0,
                dpi: jobDpi,
              });
              if (usedNative) {
                console.info(
                  `[print] page ${page + 1} total: ${Date.now() - pageStart} ms | SDK LabelCommand native fast path (TD-404 ViewShot)`,
                );
                const nativeTiming = manager.getLastTd404PngLabelTiming();
                const stored = usePrinterStore.getState().printCalibration[calibrationKey];
                const layoutPx = captureLayoutPx.current;
                logPrintTrace('PIPELINE', {
                  path: 'viewshot',
                  connection_ms: connectionMs,
                  capture_ms: captureResolvedAt > 0 ? captureResolvedAt - pageStart : captureMs,
                  decode_ms: nativeTiming?.decodeMs ?? null,
                  encode_ms: nativeTiming?.encodeMs ?? null,
                  transport_write_ms: nativeTiming?.writeMs ?? null,
                  total_ms: Date.now() - pageStart,
                  timestamp: new Date().toISOString(),
                  git_sha: resolveGitSha(),
                  native_rev: nativeTiming?.nativeRev ?? null,
                  capture_request_px: `${printCaptureSize.widthPx}x${printCaptureSize.heightPx}`,
                  view_layout_px: layoutPx ? `${layoutPx.w}x${layoutPx.h}` : null,
                  cal_stored: stored ? `h ${stored.hOffsetMm}mm v ${stored.vOffsetMm}mm` : 'none',
                  cal_used: `h ${printOffsetMm.x}mm v ${printOffsetMm.y}mm ${bakeOffset ? 'bitmap' : 'REFERENCE'}`,
                  ref_requested:
                    nativeTiming?.requestedX != null
                      ? `${nativeTiming.requestedX},${nativeTiming.requestedY}`
                      : null,
                  ref_sent: nativeTiming?.reference ?? null,
                  bitmap_xy:
                    nativeTiming?.bitmapX != null
                      ? `${nativeTiming.bitmapX},${nativeTiming.bitmapY}`
                      : null,
                  png_px:
                    nativeTiming?.pngWidth != null
                      ? `${nativeTiming.pngWidth}x${nativeTiming.pngHeight}`
                      : null,
                  fit: nativeTiming?.fit ?? null,
                  ink_margins:
                    nativeTiming?.marginL != null
                      ? `L${nativeTiming.marginL} R${nativeTiming.marginR} T${nativeTiming.marginT} B${nativeTiming.marginB}`
                      : null,
                  note: 'ViewShot fallback for unsupported layers (image, table, signature, …).',
                });
              }
            }
          } catch (err) {
            if (td404HeadlessMono || fitLabelMono) {
              console.warn('[print] TD-404 mono failed, falling back to PNG:', err);
              if (!rotatedBase64 && fitLabelMono) {
                base64 = grayToPngBase64(fitLabelMono.gray);
                rotatedBase64 = base64;
              }
              if (!rotatedBase64) {
                await waitForNextPaint();
                const captured = await captureRef(shotRef, printCaptureShotOptions);
                if (!captured) {
                  throw err instanceof Error ? err : new Error(String(err));
                }
                logCaptureSha1('viewshot-fallback', captured, uiScheme);
                base64 = captured;
                rotatedBase64 = rotatePngBase64(
                  applyInkDarknessToPng(base64, inkSteps, threshold, pageDoc),
                  orientationDeg,
                );
              }
              usedNative = await tryNativeSdkPngPrint({
                pngBase64: rotatedBase64,
                widthMm: paper.widthMm,
                heightMm: paper.heightMm,
                gapMm: td404Job?.gapMm ?? gapLength,
                copies: sendCopies,
                density: td404Job?.density ?? printDensity,
                speed: td404Job?.speed ?? printSpeed,
                vOffsetMm: offsetV,
                hOffsetMm: offsetH,
                media: td404Job?.media ?? media,
                orientation: 0,
                dpi: jobDpi,
              }).catch(() => false);
              if (!usedNative) {
                throw err instanceof Error ? err : new Error(String(err));
              }
            } else {
              console.warn('[print] Native SDK fast print failed, falling back to JS:', err);
              usedNative = false;
            }
          }
          timer.end('sdkFastPrint');
        }

        if (!td404HeadlessMono && !manager.isLabelX && !manager.isJosh && !manager.isTez && !manager.isDev && !usedNative) {
          timer.start('rasterize');
          const bits = fitLabelMono
            ? fitLabelMono.bits
            : rasterizePngForPrint(rotatedBase64, {
            // `paper` mm is already orientation-swapped to match rotatedBase64's
            // pixel dimensions; passing orientation:0 here would re-derive
            // unswapped dims and mismatch the already-rotated bitmap.
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            orientation: 0,
            threshold,
            dither,
            hOffsetMm: offsetH,
            dpi: jobDpi,
            fitArtwork: artworkPhoto,
          });
          timer.end('rasterize');

          timer.start('encode');
          const bytes = encodeConnectedPrinterJob(bits, {
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: td404Job?.gapMm ?? gapLength,
            copies: 1,
            density: td404Job?.density ?? printDensity,
            speed: td404Job?.speed ?? printSpeed,
            vOffsetMm: offsetV,
            hOffsetMm: offsetH,
            media: td404Job?.media ?? media,
            dpi: jobDpi,
          });
          timer.end('encode');

          timer.start('transmit');
          await sendIsolatedPrintCopies(bytes, sendCopies);
          timer.end('transmit');

          console.info(
            '[print] page', page + 1, 'total:', Date.now() - pageStart, 'ms |',
            'data:', bytes.length, 'bytes (JS path)',
          );
        }
        labelsCompleted += sendCopies;
        usePrintStatsStore.getState().record(sendCopies, undefined, {
          widthMm,
          heightMm,
          source: serialRun ? 'serial' : bulkPlan ? 'excel_bulk' : isPdfJob ? 'pdf' : params.scanData ? 'scan' : params.imageUri ? 'photo' : baseDocument?.templatePreviewType ? 'template' : 'manual_size',
          templateId: baseDocument?.templatePreviewType ?? null,
          templateName: baseDocument?.templatePreviewType ? baseDocument.name : null,
          ups: baseDocument?.ups?.columns ?? 1,
        });
        if (serialRun && serialLogBase) {
          for (let c = 1; c <= sendCopies; c += 1) {
            console.info(serialPrintLogLine({ ...serialLogBase, copy: c, state: 'confirmed' }));
          }
          // Written after EVERY confirmed label, so a crash or pulled cable resumes at the right one.
          if (serialRun.cursor) {
            serialRun.cursor = confirmLabel(serialRun.cursor, page);
            useSerialJobStore.getState().save(serialRun.cursor);
          }
          setPrintProgress(`Label ${page + 1} of ${pageCount}`);
        }
        if (bulkPlan) {
          setPrintProgress(`Printing ${labelsCompleted} of ${bulkPlan.totalPhysical}`);
          if (collateJob && manager.isJosh && jobIndex < printJobs.length - 1) {
            const pitchMs = joshLabelPitchMs(
              paper.heightMm,
              joshJob?.gapMm ?? gapLength,
              joshJob?.speed ?? printSpeed,
            );
            await new Promise<void>((resolve) => setTimeout(resolve, pitchMs));
          }
        }
      }

      if (serialRun) {
        const labelId = params.labelId;
        const confirmed = serialRun.cursor ? Math.min(serialRun.cursor.total, serialRun.cursor.nextIndex) : pageCount;
        if (labelId && serialRun.cursor) {
          if (serialCancelled) useSerialJobStore.getState().save(markCancelled(serialRun.cursor));
          else useSerialJobStore.getState().clear(labelId);
        }
        const continueState = labelId ? useSerialContinueStore.getState().byLabel[labelId] : undefined;
        if (labelId && serialRun.batch && continueState?.enabled) {
          useSerialContinueStore.getState().setOffset(labelId, serialRun.baseOffset + (serialCancelled ? confirmed : pageCount));
        }
        if (serialCancelled) {
          Alert.alert('Print cancelled', `${confirmed} of ${pageCount} labels were printed. Print again to continue where it stopped.`);
          return;
        }
      }

      // Store timing for diagnostics screen.
      timer.dump('PRINT JOB');
      manager.setLastPrintTiming(timer.getEntries());

      if (printingSettings.recordHistory) {
        const docForHistory = displayDocument ?? previewDocument;
        addHistoryEntry({
          labelName: jobName,
          copies: bulkPlan ? bulkPlan.totalPhysical : copies * pageCount,
          documentId: params.labelId,
          source: historySource,
          documentSnapshot: docForHistory ?? undefined,
        });
      }

      // Josh shows its own "Print completed" card.
      if (!getPrinterManager().isJosh) {
        Alert.alert('Print Sent', `${jobName} was sent to ${deviceName ?? 'the printer'}.`);
      }
      if (printingSettings.returnPrevious) router.back();
    } catch (error) {
      if (serialRun) {
        if (serialRun.cursor && params.labelId) {
          const failed = markFailed(serialRun.cursor, serialRun.current);
          serialRun.cursor = failed;
          useSerialJobStore.getState().save(failed);
          const cs = useSerialContinueStore.getState().byLabel[params.labelId];
          if (cs?.enabled) {
            useSerialContinueStore.getState().setOffset(params.labelId, serialRun.baseOffset + Math.min(failed.total, failed.nextIndex));
          }
        }
        const idx = serialRun.batch ? serialRun.current + serialRun.baseOffset : serialRun.current;
        console.info(
          serialPrintLogLine({
            jobId: serialRun.jobId,
            label: serialRun.current + 1,
            total: pageCount,
            serialIndex: idx,
            value: baseDocument ? describeSerialValues(baseDocument, idx) : '',
            copy: 1,
            copies,
            state: 'failed',
          }),
        );
      }
      const message = formatPrintFailure(error);
      if (message) {
        const sent =
          bulkPlan != null
            ? `\n\nSent ${labelsCompleted} of ${bulkPlan.totalPhysical} before the printer stopped.`
            : serialRun
              ? `\n\nPrinted ${serialRun.cursor ? Math.min(serialRun.cursor.total, serialRun.cursor.nextIndex) : labelsCompleted} of ${pageCount} labels. Print again to continue where it stopped.`
              : '';
        Alert.alert('Print Failed', `${message}${sent}`);
      }
    } finally {
      printingLockRef.current = false;
      jobSerialOffsetRef.current = null;
      serialCancelRef.current = false;
      setSerialCancelAsked(false);
      setPrinting(false);
      setPrintProgress(null);
    }
  }, [
    serialInfo,
    liveSerialOffset,
    params.labelId,
    sourceDocument,
    isPdfJob,
    params.docUri,
    previewDocument,
    displayDocument,
    applyDisplayTransforms,
    buildPageDocument,
    jobDpi,
    defaults.labelWidth,
    defaults.labelHeight,
    defaults.colorMode,
    defaults.grayThreshold,
    orientation,
    effLayerOffsets,
    darkness,
    speed,
    pageCount,
    printOffsetMm,
    gapLength,
    copies,
    collate,
    baseDocument,
    excelFiles,
    paperType,
    printingSettings.recordHistory,
    printingSettings.returnPrevious,
    addHistoryEntry,
    jobName,
    params.labelId,
    params.imageUri,
    historySource,
    deviceName,
    jewelryDieCutJob,
    cableFlagJob,
    ratTail143Job,
    printCaptureShotOptions,
    printCaptureSize.widthPx,
    printCaptureSize.heightPx,
    calibrationKey,
  ]);

  const unrotatedJob = !ratTail143Job && orientation === '0°';
  const captureShiftMm = useMemo(() => {
    if (!unrotatedJob) return undefined;
    if (printerSdkId === 'josh') {
      return joshInkOffsetMm(printOffsetMm.x, printOffsetMm.y);
    }
    if (getPrinterManager().usesTd404CommandSet) return td404ContentShiftMm(printOffsetMm);
    return undefined;
  }, [unrotatedJob, printerSdkId, printOffsetMm.x, printOffsetMm.y]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor={C.onHeader} size={22} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/printer-connect')}
          style={({ pressed }) => [
            styles.connection,
            connected && styles.connectionConnected,
            pressed && styles.pressed,
          ]}>
          <Text numberOfLines={1} style={styles.connectionText}>
            {connected
              ? `${activeModelMeta.shortName}: ${deviceName ?? 'Connected'}`
              : 'Not connected'}
          </Text>
          <AppIcon name="link" tintColor="#FFFFFF" size={14} /* theme-fixed: white icon on status fill */ />
        </Pressable>
      </View>

      <FormScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: footerHeight + Spacing.three }}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.previewArea, { minHeight: previewAreaMinHeight }]}>
          <View style={styles.previewShadow}>
            {(displayDocument ?? previewDocument) ? (
              <View
                style={{
                  width: previewBoxW,
                  height: previewBoxH,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <View style={{ transform: [{ rotate: `${previewTurn}deg` }] }}>
                  <LabelPreview
                    document={(layerPreviewDocument ?? displayDocument ?? previewDocument)!}
                    width={previewDrawW}
                    maxHeight={previewDrawH}
                    showArtboardBorder={false}
                    hideNonPrinting
                  />
                </View>
              </View>
            ) : params.imageUri ? (
              <View style={[styles.previewCard, { width: cardWidth, height: cardHeight }]}>
                <Image
                  source={{ uri: params.imageUri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="contain"
                />
              </View>
            ) : isPdfJob && pdfPages.length > 0 ? (
              <View
                style={[
                  styles.previewCard,
                  {
                    width: cardWidth,
                    height: cardHeight,
                    backgroundColor: '#FFFFFF', // theme-fixed: print preview / capture surface
                    padding: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}>
                <Image
                  source={{
                    uri: `data:image/png;base64,${
                      pdfPages[Math.min(pageIndex, pdfPages.length - 1)]?.base64
                    }`,
                  }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              </View>
            ) : (
              <View
                style={[styles.previewCard, styles.docPreviewCard, { width: cardWidth, height: cardHeight }]}>
                <View style={styles.docBadgeLarge}>
                  <Text style={styles.docBadgeLargeText}>{params.docType ?? 'PDF'}</Text>
                </View>
                <Text style={styles.docPreviewTitle} numberOfLines={2}>
                  {params.docName ?? 'Document'}
                </Text>
                <Text style={styles.docPreviewSub}>
                  {pdfRendering ? 'Rendering PDF pages…' : 'Document Ready for Thermal Print'}
                </Text>
              </View>
            )}
          </View>

          {/* Dedicated 1:1 Hardware Dot Print Artboard (captured at SIZE dots, then cropped to BITMAP) */}
          {(displayDocument ?? previewDocument) ? (
            <View
              collapsable={false}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                captureLayoutPx.current = { w: width, h: height };
              }}
              style={[
                styles.printCaptureNative,
                { width: printCaptureLayoutPx.widthPx, height: printCaptureLayoutPx.heightPx },
              ]}>
              <ViewShot
                ref={shotRef}
                options={printCaptureShotOptions}
                style={{
                  width: printCaptureLayoutPx.widthPx,
                  height: printCaptureLayoutPx.heightPx,
                  backgroundColor: '#FFFFFF', // theme-fixed: print preview / capture surface
                }}>
                <LabelPreview
                  document={(displayDocument ?? previewDocument)!}
                  exactWidthPx={printCaptureLayoutPx.widthPx}
                  exactHeightPx={printCaptureLayoutPx.heightPx}
                  printDpi={jobDpi}
                  bakeTd404Feed={getPrinterManager().usesTd404CommandSet}
                  shiftMm={captureShiftMm}
                  showArtboardBorder={false}
                  hideNonPrinting
                />
              </ViewShot>
            </View>
          ) : null}

          {/* Actual print-size badge — shows the real mm / in dimensions that will be sent to the printer. */}
          {activeDoc ? (
            <View style={styles.sizeBadge}>
              <Text style={styles.sizeBadgeText}>
                {formatPrintSize(
                  ratTail143Job ? RAT_TAIL_143_PRINT.widthMm : activeDoc.widthMm,
                  ratTail143Job ? RAT_TAIL_143_PRINT.heightMm : activeDoc.heightMm,
                )}
              </Text>
            </View>
          ) : null}

          {pageCount > 1 ? (
            <View style={styles.pageNav}>
              <Pressable
                hitSlop={12}
                disabled={pageIndex <= 0}
                onPress={() => setPageIndex((p) => Math.max(0, p - 1))}
                style={({ pressed }) => [styles.pageNavBtn, pressed && styles.pressed]}>
                <AppIcon
                  name="chevron.left"
                  tintColor={pageIndex <= 0 ? '#7C848E' : '#FFFFFF'} // theme-fixed: on the dark page-nav pill
                  size={16}
                />
              </Pressable>
              <Text style={styles.pageNavText}>
                {baseDocument?.bulk || serialInfo?.mode === 'batch' ? 'Label' : 'Row'} {pageIndex + 1} / {pageCount}
              </Text>
              <Pressable
                hitSlop={12}
                disabled={pageIndex >= pageCount - 1}
                onPress={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                style={({ pressed }) => [styles.pageNavBtn, pressed && styles.pressed]}>
                <AppIcon
                  name="chevron.right"
                  tintColor={pageIndex >= pageCount - 1 ? '#7C848E' : '#FFFFFF'} // theme-fixed: on the dark page-nav pill
                  size={16}
                />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.zoomControls}>
            <Pressable
              hitSlop={6}
              onPress={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
              style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
              <Text style={styles.zoomText}>−</Text>
            </Pressable>
            <View style={styles.zoomDivider} />
            <Pressable
              hitSlop={6}
              onPress={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
              style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
              <Text style={styles.zoomText}>+</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.referenceNote}>Reference only. Depends on the actual print effect.</Text>

        <View style={styles.settingsWrap}>
          {/* Main Primary Settings Card (Clean & Simple) */}
          <View style={styles.settingsCard}>
            <StepperRow
              label={baseDocument?.bulk ? 'Multiply all counts' : 'Number of Copies'}
              value={String(copies)}
              valueColor={C.accent}
              minusDisabled={copies <= 1}
              onMinus={() => setCopies((n) => Math.max(1, n - 1))}
              onPlus={() => setCopies((n) => n + 1)}
              onCommitValue={setCopies}
              bordered
            />
            {serialInfo ? (
              <Text style={styles.serialTotal}>
                {serialInfo.mode === 'batch'
                  ? `${serialInfo.count} labels x ${copies} ${copies === 1 ? 'copy' : 'copies'} = ${serialInfo.count * copies} to print${liveSerialOffset > 0 ? `. Continues after ${liveSerialOffset} already printed.` : '.'}`
                  : `${serialInfo.count} rows x ${copies} ${copies === 1 ? 'copy' : 'copies'} = ${serialInfo.count * copies} to print.`}
              </Text>
            ) : null}
            {showCollate ? (
              <View style={styles.collateWrap}>
                <Text style={styles.collateLabel}>Print order</Text>
                <View style={styles.collateSeg}>
                  {([false, true] as const).map((on) => {
                    const selected = collateEnabled && collate === on;
                    return (
                      <Pressable
                        key={String(on)}
                        disabled={printing || !collateEnabled}
                        onPress={() => setCollate(on)}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: !collateEnabled }}
                        style={[
                          styles.collateOpt,
                          selected && styles.collateOptOn,
                          !collateEnabled && styles.collateOptOff,
                        ]}>
                        <Text style={[styles.collateOptText, selected && styles.collateOptTextOn]}>
                          {on ? 'Collated' : 'Uncollated'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.collateHelp}>
                  {!collateEnabled
                    ? 'Set the count above 1 to choose how repeats are ordered.'
                    : collate
                      ? `Collated: the whole job prints once, rows 1 to ${baseDocument?.bulk?.rowCount ?? 'N'}, then again, ${copies} times in all.`
                      : `Uncollated: row by row from the first, each row prints all its labels at once (its count × ${copies}).`}
                </Text>
              </View>
            ) : null}
            {bulkPrintPlan && baseDocument?.bulk ? (
              <Text style={styles.bulkTotal}>
                {bulkPrintPlan.totalPhysical} {bulkPrintPlan.totalPhysical === 1 ? 'label' : 'labels'} from{' '}
                {baseDocument.bulk.rowCount} {baseDocument.bulk.rowCount === 1 ? 'design' : 'designs'}
              </Text>
            ) : null}

            {jewelryDieCutJob ? (
              <View style={styles.cardSection}>
                <Text style={styles.groupLabel}>Jewelry Print Mode</Text>
                <ChipGroup
                  options={['3-Across (54×96 Sheet)', 'Single Label Tag']}
                  selected={
                    printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP
                      ? '3-Across (54×96 Sheet)'
                      : 'Single Label Tag'
                  }
                  onSelect={(opt) => {
                    if (opt === '3-Across (54×96 Sheet)') {
                      const p =
                        PRINT_SIZE_PRESETS.find((preset) => preset.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) ??
                        null;
                      setPrintPreset(p);
                      setPrintSize({
                        widthMm: JEWELRY_DIECUT.sheetWidthMm,
                        heightMm: JEWELRY_DIECUT.sheetHeightMm,
                      });
                    } else {
                      setPrintPreset(
                        PRINT_SIZE_PRESETS.find((preset) => preset.id === JEWELRY_DIECUT_PRINT_PRESET_SINGLE) ??
                          null,
                      );
                      setPrintSize({
                        widthMm: JEWELRY_DIECUT.tagWidthMm,
                        heightMm: JEWELRY_DIECUT.tagHeightMm,
                      });
                    }
                  }}
                />
                <Text style={styles.helperText}>
                  {printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP
                    ? 'Prints across all 3 labels on the 54 × 96 mm backing sheet (3 mm gaps).'
                    : `Prints one 14 × 96 mm tag (left column). SIZE 14.00 mm,96.00 mm.`}
                </Text>
              </View>
            ) : null}

            {cableFlagJob ? (
              <View style={styles.cardSection}>
                <Text style={styles.groupLabel}>Cable Label</Text>
                <Text style={styles.helperText}>
                  Prints both P-style flags on one 50 × 73 mm piece (SIZE 50.00 mm,73.00 mm). Each
                  head is 25 mm wide with a left wrap tab. This is not a 100 × 70 mm sheet.
                </Text>
              </View>
            ) : null}

            {ratTail143Job ? (
              <View style={styles.cardSection}>
                <Text style={styles.groupLabel}>Rat Tail Label</Text>
                <Text style={styles.helperText}>
                  Prints 14.3 × 101.6 mm wrap stock (paddle first, empty tail). Barcode and text stay
                  locked on the 63.5 mm body. SIZE is not 101.6 × 14.3 — that lands ink on the strap.
                </Text>
              </View>
            ) : null}

            {qualityBridge === 'josh-lpapi' ? (
              <View style={styles.cardSection}>
                <Text style={styles.groupLabel}>Paper Type</Text>
                <ChipGroup
                  options={PAPER_TYPES}
                  selected={paperType}
                  onSelect={changePaperType}
                  badgeFor={(option) => paperTypeTestBadge(option)}
                />
                {paperTypeSelectionNote(paperType) ? (
                  <Text style={styles.helperText}>{paperTypeSelectionNote(paperType)}</Text>
                ) : null}
                {jewelryDieCutJob ? (
                  <Text style={[styles.helperText, { color: C.link, marginTop: 6 }]}>
                    💡 Clear-liner jewelry rolls with black timing lines on the back require Paper Type set to "Black mark". If prints skip or overlap, run "Calibrate Paper Sensor" in Printer Connect.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Collapsible Advanced Settings (Darkness, Speed, Offsets, Orientation) */}
          <View style={styles.settingsCard}>
            <Pressable
              onPress={() => setShowAdvanced((v) => !v)}
              style={({ pressed }) => [styles.advancedHeader, pressed && styles.pressed]}>
              <View style={styles.advancedHeaderLeft}>
                <AppIcon name="gearshape" tintColor={C.textSecondary} size={18} />
                <Text style={styles.advancedHeaderTitle}>Advanced Settings</Text>
              </View>
              <View style={styles.advancedHeaderRight}>
                <Text style={styles.advancedStatusText}>
                  {showAdvanced
                    ? 'Hide'
                    : `${orientation} · Darkness ${darkness == null ? 'Auto' : darkness}`}
                </Text>
                <View style={styles.advancedChevron}>
                  <AppIcon
                    name={showAdvanced ? 'chevron.up' : 'chevron.down'}
                    tintColor={C.textSecondary}
                    size={16}
                  />
                </View>
              </View>
            </Pressable>

            {showAdvanced ? (
              <View style={styles.advancedBody}>
                <Text style={[styles.groupLabel, { marginTop: 8 }]}>Orientation</Text>
                <ChipGroup
                  options={ORIENTATIONS}
                  selected={orientation}
                  onSelect={(value) => {
                    if (ratTail143Job) return;
                    setOrientation(value);
                  }}
                />

                {qualityCaps.density !== 'legacy' ? (
                  <QualityControl
                    cap={qualityCaps.density}
                    value={darkness}
                    onChange={setDarkness}
                    Stepper={BorderedStepperRow}
                  />
                ) : (
                  <StepperRow
                    label="Print Darkness"
                    value={darkness == null ? 'Auto' : String(darkness)}
                    minusDisabled={darkness != null && darkness <= 1}
                    plusDisabled={darkness != null && darkness >= 15}
                    onMinus={() =>
                      setDarkness((d) => {
                        if (d == null) return 7;
                        if (d <= 1) return null;
                        return d - 1;
                      })
                    }
                    onPlus={() => setDarkness((d) => (d == null ? 8 : Math.min(15, d + 1)))}
                    bordered
                  />
                )}
                {qualityCaps.speed !== 'legacy' ? (
                  <QualityControl
                    cap={qualityCaps.speed}
                    value={speed}
                    onChange={setSpeed}
                    Stepper={BorderedStepperRow}
                  />
                ) : (
                  <StepperRow
                    label="Print Speed"
                    value={speed == null ? 'Auto' : String(speed)}
                    minusDisabled={speed != null && speed <= 1}
                    plusDisabled={speed != null && speed >= 8}
                    onMinus={() =>
                      setSpeed((s) => {
                        if (s == null) return 2;
                        if (s <= 1) return null;
                        return s - 1;
                      })
                    }
                    onPlus={() => setSpeed((s) => (s == null ? 3 : Math.min(8, s + 1)))}
                    bordered
                  />
                )}
                {calibrationQualityNote ? (
                  <Text style={styles.calibrationQualityNote}>{calibrationQualityNote}</Text>
                ) : null}
                <StepperRow
                  label="Gap Length"
                  value={`${(paperType === 'Receipt' ? 0 : gapLength).toFixed(2)} mm`}
                  minusDisabled={paperType === 'Receipt' || gapLength <= 0}
                  plusDisabled={paperType === 'Receipt' || gapLength >= 20}
                  onMinus={() => changeGapLength(Math.max(0, Math.round((gapLength - 0.5) * 100) / 100))}
                  onPlus={() => changeGapLength(Math.min(20, Math.round((gapLength + 0.5) * 100) / 100))}
                  bordered
                />
                <Text style={{ color: C.textMuted, fontSize: 12, paddingTop: 8 }}>
                  {(() => {
                    const mgr = getPrinterManager();
                    if (!mgr.usesTd404CommandSet) {
                      return 'Offsets move this printer’s bitmap origin.';
                    }
                    const page = activeDoc;
                    const spec = createPrintSpec({
                      widthMm: page?.widthMm ?? 50,
                      heightMm: page?.heightMm ?? 30,
                      dpi: jobDpi,
                      profile: mgr.getActivePrinterProfile(),
                      calibration: { horizontalOffsetMm: 0, verticalOffsetMm: 0 },
                    });
                    const total = `H ${printOffsetMm.x.toFixed(2)} mm, V ${printOffsetMm.y.toFixed(2)} mm`;
                    if (!unrotatedJob) {
                      return `Total offset ${total} (this printer plus Label Settings). The label is turned in dots, elements move and the border stays put.`;
                    }
                    return `Total offset ${total} (this printer plus Label Settings), plus 0 mm across and 2 mm down on text and codes. The border is its own layer and stays ${TD404_BORDER_GAP_MM} mm from the die-cut on every side.`;
                  })()}
                </Text>
                <Pressable
                  onPress={() => setShowTogetherOffset((v) => !v)}
                  style={({ pressed }) => [styles.offsetFoldHeader, pressed && styles.pressed]}>
                  <Text style={styles.offsetFoldTitle}>Whole label shift (elements + border)</Text>
                  <View style={styles.advancedHeaderRight}>
                    <Text style={styles.advancedStatusText}>{showTogetherOffset ? 'Hide' : 'Show'}</Text>
                    <View style={styles.advancedChevron}>
                      <AppIcon
                        name={showTogetherOffset ? 'chevron.up' : 'chevron.down'}
                        tintColor={C.textSecondary}
                        size={16}
                      />
                    </View>
                  </View>
                </Pressable>
                {showTogetherOffset ? (
                  <>
                    <Text style={{ color: C.textMuted, fontSize: 12, paddingBottom: 6 }}>
                      Moves everything on the label together: elements and border. Use it to fix a printer that
                      prints the whole label off-centre. Saved for this printer.
                    </Text>
                <StepperRow
                  label="Horizontal"
                  hint="−  moves left   ·   +  moves right"
                  value={`${hOffset.toFixed(2)} mm`}
                  minusDisabled={hOffset <= -10}
                  onMinus={() => setHOffset((v) => Math.max(-10, Math.round((v - 0.5) * 100) / 100))}
                  onPlus={() => setHOffset((v) => Math.min(10, Math.round((v + 0.5) * 100) / 100))}
                  bordered
                />
                <StepperRow
                  label="Vertical"
                  hint="−  moves up   ·   +  moves down"
                  value={`${vOffset.toFixed(2)} mm`}
                  minusDisabled={vOffset <= -10}
                  onMinus={() => setVOffset((v) => Math.max(-10, Math.round((v - 0.5) * 100) / 100))}
                  onPlus={() => setVOffset((v) => Math.min(20, Math.round((v + 0.5) * 100) / 100))}
                />
                  </>
                ) : null}
                <Text style={[styles.groupLabel, { marginTop: 12 }]}>Elements only (text, codes, shapes)</Text>
                <Text style={{ color: C.textMuted, fontSize: 12, paddingBottom: 6 }}>
                  Moves only the content; the border stays put. Saved with this label.
                </Text>
                <StepperRow
                  label="Horizontal"
                  hint="−  moves left   ·   +  moves right"
                  value={`${layerOffsets.elements.x.toFixed(2)} mm`}
                  minusDisabled={!layerOffsetsUsable || layerOffsets.elements.x <= LAYER_OFFSET_MIN_MM}
                  plusDisabled={!layerOffsetsUsable || layerOffsets.elements.x >= LAYER_OFFSET_MAX_MM}
                  onMinus={() => changeLayerOffset('elements', 'x', layerOffsets.elements.x - LAYER_OFFSET_STEP_MM)}
                  onPlus={() => changeLayerOffset('elements', 'x', layerOffsets.elements.x + LAYER_OFFSET_STEP_MM)}
                  bordered
                />
                <StepperRow
                  label="Vertical"
                  hint="−  moves up   ·   +  moves down"
                  value={`${layerOffsets.elements.y.toFixed(2)} mm`}
                  minusDisabled={!layerOffsetsUsable || layerOffsets.elements.y <= LAYER_OFFSET_MIN_MM}
                  plusDisabled={!layerOffsetsUsable || layerOffsets.elements.y >= LAYER_OFFSET_MAX_MM}
                  onMinus={() => changeLayerOffset('elements', 'y', layerOffsets.elements.y - LAYER_OFFSET_STEP_MM)}
                  onPlus={() => changeLayerOffset('elements', 'y', layerOffsets.elements.y + LAYER_OFFSET_STEP_MM)}
                />
                <Text style={[styles.groupLabel, { marginTop: 12 }]}>Border only</Text>
                <Text style={{ color: C.textMuted, fontSize: 12, paddingBottom: 6 }}>
                  Moves only the border frame; the content stays put. Saved with this label.
                </Text>
                <StepperRow
                  label="Horizontal"
                  hint="−  moves left   ·   +  moves right"
                  value={`${layerOffsets.border.x.toFixed(2)} mm`}
                  minusDisabled={!layerHasBorder || layerOffsets.border.x <= LAYER_OFFSET_MIN_MM}
                  plusDisabled={!layerHasBorder || layerOffsets.border.x >= LAYER_OFFSET_MAX_MM}
                  onMinus={() => changeLayerOffset('border', 'x', layerOffsets.border.x - LAYER_OFFSET_STEP_MM)}
                  onPlus={() => changeLayerOffset('border', 'x', layerOffsets.border.x + LAYER_OFFSET_STEP_MM)}
                  bordered
                />
                <StepperRow
                  label="Vertical"
                  hint="−  moves up   ·   +  moves down"
                  value={`${layerOffsets.border.y.toFixed(2)} mm`}
                  minusDisabled={!layerHasBorder || layerOffsets.border.y <= LAYER_OFFSET_MIN_MM}
                  plusDisabled={!layerHasBorder || layerOffsets.border.y >= LAYER_OFFSET_MAX_MM}
                  onMinus={() => changeLayerOffset('border', 'y', layerOffsets.border.y - LAYER_OFFSET_STEP_MM)}
                  onPlus={() => changeLayerOffset('border', 'y', layerOffsets.border.y + LAYER_OFFSET_STEP_MM)}
                />
                <Text style={{ color: C.textMuted, fontSize: 12, paddingTop: 8 }}>
                  {!layerOffsetsUsable
                    ? 'Elements and Border offsets work for TD-404 and Josh labels the app draws directly (not photos, tables or signatures; Josh at 0° only).'
                    : !layerHasBorder
                      ? 'This label has no border, so only the Elements offset applies. Minus moves left or up, plus moves right or down. Added to the offsets above.'
                      : 'Minus moves left or up, plus moves right or down. Added to the offsets above; 0 and 0 leaves the print unchanged.'}
                </Text>
                {layerWarning ? (
                  <Text style={{ color: C.warning, fontSize: 12, paddingTop: 6 }}>{layerWarning}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </FormScrollView>

      {joshStatusWarning ? <Text style={styles.printerWarning}>{joshStatusWarning}</Text> : null}
      <JoshProgressCard />
      {!joshProgressLine && printProgress ? (
        <Text style={styles.printProgress}>{printProgress}</Text>
      ) : null}
      {printing && serialInfo ? (
        <Pressable
          onPress={() => {
            serialCancelRef.current = true;
            setSerialCancelAsked(true);
          }}
          disabled={serialCancelAsked}
          hitSlop={8}>
          <Text style={styles.printProgress}>
            {serialCancelAsked ? 'Stopping after this label...' : 'Cancel after this label'}
          </Text>
        </Pressable>
      ) : null}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        {/* Print button — prints the active label at its selected/previewed dimensions */}
        <Pressable
          disabled={printing}
          hitSlop={6}
          style={({ pressed }) => [styles.printBtn, (pressed || printing) && styles.pressed]}
          onPress={() => {
            void handlePrint();
          }}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" /* theme-fixed: on accent button */ />
          ) : (
            <Text style={styles.printBtnText}>Print</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.fill,
  },
  header: {
    backgroundColor: c.header,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.dangerFill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    maxWidth: 220,
  },
  connectionConnected: {
    backgroundColor: c.successFill,
  },
  connectionText: {
    color: c.onAccent,
    ...Type.badge,
  },
  scroll: {
    flex: 1,
  },
  previewArea: {
    backgroundColor: scheme === 'light' ? '#AEB4BC' : c.canvasArea, // theme-fixed: light keeps its grey stage around the white label
    // minHeight is set inline from previewAreaMinHeight (dynamic).
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    position: 'relative',
  },
  previewShadow: {
    borderRadius: 6,
    // Subtle drop-shadow so the label lifts off the grey stage.
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  sizeBadge: {
    marginTop: 10,
    backgroundColor: c.scrim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sizeBadgeText: {
    color: c.onAccent,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  printCapture: {
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (printCapture)
  },
  printCaptureNative: {
    position: 'absolute',
    top: -10000,
    left: 0,
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (printCaptureNative)
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  previewCard: {
    borderRadius: 10,
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (previewCard)
    overflow: 'hidden',
  },
  docPreviewCard: {
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  docBadgeLarge: {
    backgroundColor: c.dangerSoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  docBadgeLargeText: {
    color: c.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  docPreviewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  docPreviewSub: {
    fontSize: 12,
    color: c.textSecondary,
  },
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    backgroundColor: c.neutralFill,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pageNavText: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '600',
  },
  pageNavBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.neutralFill,
    borderRadius: 8,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.25)', // theme-fixed: divider on the dark zoom pill
  },
  zoomText: {
    color: c.onAccent,
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 24,
  },
  referenceNote: {
    textAlign: 'center',
    color: c.textMuted,
    ...Type.caption,
    paddingVertical: 14,
    backgroundColor: c.fill,
  },
  settingsWrap: {
    paddingHorizontal: 12,
    gap: 10,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  collateWrap: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 8,
  },
  collateSeg: {
    flexDirection: 'row',
    gap: 8,
  },
  collateOpt: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collateOptOn: {
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  collateOptOff: {
    opacity: 0.5,
  },
  collateOptText: {
    color: c.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  collateOptTextOn: {
    color: c.accent,
  },
  collateLabel: {
    color: c.text,
    fontSize: 15,
    fontWeight: '600',
  },
  collateHelp: {
    color: c.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  bulkTotal: {
    color: c.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    paddingBottom: 10,
  },
  serialTotal: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontSize: 12,
    lineHeight: 16,
    color: c.textSecondary,
  },
  printerWarning: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: c.danger,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  printProgress: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 92,
    textAlign: 'center',
    color: c.text,
    fontSize: 13,
    fontWeight: '600',
  },
  settingsCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...cardElevation(c, scheme),
  },
  cardSection: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 10,
  },
  advancedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  advancedHeaderTitle: {
    ...Type.body,
    fontWeight: '600',
    color: c.text,
  },
  advancedHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offsetFoldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: c.fill,
  },
  offsetFoldTitle: {
    ...Type.bodyMedium,
    flex: 1,
    color: c.text,
  },
  advancedChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advancedStatusText: {
    fontSize: 12,
    color: c.textSecondary,
  },
  advancedBody: {
    paddingTop: 6,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  helperText: {
    fontSize: 12,
    color: c.textSecondary,
    marginTop: 6,
    marginBottom: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 10,
  },
  stepperRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  calibrationQualityNote: {
    color: c.warning,
    fontSize: 12,
    paddingVertical: 8,
  },
  stepperLabelWrap: {
    flex: 1,
    gap: 2,
  },
  stepperHint: {
    fontSize: 11,
    color: c.textMuted,
  },
  stepperLabel: {
    ...Type.body,
    color: c.text,
    paddingRight: 8,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDisabled: {
    borderColor: c.border,
  },
  stepperSymbol: {
    fontSize: 18,
    fontWeight: '400',
    color: c.accent,
    lineHeight: 20,
  },
  stepperSymbolDisabled: {
    color: c.textDisabled,
  },
  stepperValue: {
    ...Type.bodyMedium,
    color: c.text,
    minWidth: 68,
    textAlign: 'center',
  },
  groupLabel: {
    ...Type.bodyMedium,
    color: c.text,
    paddingTop: 14,
    paddingBottom: 10,
  },
  groupLabelSpaced: {
    paddingTop: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipWithBadge: {
    height: 48,
  },
  chipBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: c.textMuted,
    marginTop: 1,
  },
  chipBadgeActive: {
    color: c.onAccent,
  },
  chipActive: {
    backgroundColor: c.accentFill,
  },
  chipText: {
    ...Type.chip,
    color: c.textMuted,
  },
  chipTextActive: {
    color: c.onAccent,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    backgroundColor: c.fill,
  },
  gearBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.successFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtn: {
    flex: 1,
    height: 52,
    backgroundColor: c.accentFill,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnText: {
    color: c.onAccent,
    ...Type.button,
  },
  pressed: {
    opacity: 0.65,
  },
}));
