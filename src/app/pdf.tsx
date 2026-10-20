import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { PdfColorTool } from '@/components/pdf-editor/pdf-color-tool';
import { PdfCropTool, type PdfCropScreenNotice } from '@/components/pdf-editor/pdf-crop-tool';
import { PdfOutputSizeRow } from '@/components/pdf-editor/pdf-output-size-row';
import { PdfPageNav } from '@/components/pdf-editor/pdf-page-nav';
import { PdfPageViewer } from '@/components/pdf-editor/pdf-page-viewer';
import { PdfPrintPanel, type PdfPrintPanelHandle } from '@/components/pdf-editor/pdf-print-sheet';
import { PrintPagesStrip, type PrintStripItem } from '@/components/pdf-editor/print-pages-strip';
import { PdfRotateTool } from '@/components/pdf-editor/pdf-rotate-tool';
import { PdfSharpnessTool } from '@/components/pdf-editor/pdf-sharpness-tool';
import { PdfToolPanel, type PdfToolId } from '@/components/pdf-editor/pdf-tool-panel';
import { WalkthroughOverlay } from '@/components/walkthrough/walkthrough-overlay';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { PDF_WALKTHROUGHS } from '@/lib/walkthrough/pdf-steps';
import { setWalkthroughScroller } from '@/lib/walkthrough/registry';
import { useWalkthroughStore } from '@/stores/walkthrough-store';
import { PrinterConnectionPill } from '@/components/printers/printer-connection-pill';
import { PdfWatermarkTool } from '@/components/pdf-editor/pdf-watermark-tool';
import {
  clearSmartCropCache,
  useSmartCrop,
  type SmartCropSelectionInfo,
} from '@/components/pdf-editor/use-smart-crop';
import { Spacing } from '@/constants/theme';

import { planLabelRender } from '@/lib/pdf-editor/label-render-plan';
import { exportEditedPdf } from '@/lib/pdf-editor/export';
import { copyPdfToCache, loadPdfMetadata, loadPdfPageSizes } from '@/lib/pdf-editor/load';
import {
  clearPrintRasterCache,
  prewarmPrintPages,
  printEditedPdf,
  type PdfPrintOptions,
} from '@/lib/pdf-editor/print';
import { resolvePrintPageIndices, type PdfPrintSelection } from '@/lib/pdf-editor/session';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { formatPrintFailure } from '@/lib/printer/print-job';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  PREVIEW_DPI,
  clearRasterCache,
  prefetchNeighborPages,
  rasterPdfPageCached,
  regionImageCached,
} from '@/lib/pdf-editor/raster';
import {
  clampCropNorm,
  defaultWatermark,
  pageColorMode,
  ptToMm,
  resolveScopeIndices,
  type PageScope,
} from '@/lib/pdf-editor/session';
import { downscaleWatermarkTile, previewTileSize } from '@/lib/pdf-editor/watermark-tile';
import { usePdfEditStore } from '@/stores/pdf-edit-store';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type Step = 'pick' | 'size' | 'edit' | 'print';

/** Manual crop starts on the whole page (or the whole cropped part), so nothing is left out. */
const FULL_WINDOW = { originNorm: { x: 0, y: 0 }, sizeNorm: { w: 1, h: 1 } };

const STEP_TITLE: Record<Step, string> = {
  pick: 'Print PDF',
  size: 'Label size',
  edit: 'Edit PDF',
  print: 'Print',
};

/** Standalone PDF editor: size, then crop tools, then print or export. */
export default function PdfEditorScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    docUri?: string;
    docName?: string;
    uri?: string;
    name?: string;
  }>();
  const session = usePdfEditStore((s) => s.session);
  const startSession = usePdfEditStore((s) => s.startSession);
  const resetSession = usePdfEditStore((s) => s.resetSession);
  const setCurrentPage = usePdfEditStore((s) => s.setCurrentPage);
  const setOutputSize = usePdfEditStore((s) => s.setOutputSize);
  const setCrop = usePdfEditStore((s) => s.setCrop);
  const setPageSizes = usePdfEditStore((s) => s.setPageSizes);
  const setRotationForScope = usePdfEditStore((s) => s.setRotationForScope);
  const setSharpnessForScope = usePdfEditStore((s) => s.setSharpnessForScope);
  const setWatermark = usePdfEditStore((s) => s.setWatermark);
  const patchWatermark = usePdfEditStore((s) => s.patchWatermark);
  const setColorModeForScope = usePdfEditStore((s) => s.setColorModeForScope);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const printerStatus = usePrinterStore((s) => s.status);
  const printerLive = printerStatus === 'connected' || printerStatus === 'printing';
  const grayThreshold = useSettingsStore((s) => s.defaults.grayThreshold);
  const smartCropHintSeen = useSettingsStore((s) => s.smartCropHintSeen);
  const setSmartCropHintSeen = useSettingsStore((s) => s.setSmartCropHintSeen);

  const [step, setStep] = useState<Step>('pick');
  const startWalkthrough = useWalkthroughStore((s) => s.start);
  const stopWalkthrough = useWalkthroughStore((s) => s.stop);
  const markPdfTourSeen = useSettingsStore((s) => s.markPdfTourSeen);
  const scrollRef = useRef<import('react-native').ScrollView>(null);
  const scrollY = useRef(0);
  const [tool, setTool] = useState<PdfToolId | null>(null);
  const [pageUri, setPageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState<string | null>(null);
  const printPanelRef = useRef<PdfPrintPanelHandle>(null);
  const [printIndices, setPrintIndices] = useState<number[]>([]);
  // Crop is edited as a draft and only saved to the session when Apply is pressed.
  const [draftCrop, setDraftCrop] = useState<{
    originNorm: { x: number; y: number };
    sizeNorm: { w: number; h: number };
  } | null>(null);
  const [draftScope, setDraftScope] = useState<PageScope>({ mode: 'this' });
  // Optional: lock the crop to the label's shape. Off by default so width and height crop freely.
  // Cropping an already-cropped page: that crop is the "page" the tool works on.
  const [cropBase, setCropBase] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [baseUri, setBaseUri] = useState<string | null>(null);
  const [cropKind, setCropKind] = useState<'smart' | 'manual'>('manual');
  // Smart Crop: label size a selected section will set, applied with the crop on Apply.
  const [cropNotice, setCropNotice] = useState<PdfCropScreenNotice | null>(null);
  // Page size as the PDF renderer sees it; crop fractions are measured against this bitmap.
  const [rasterPt, setRasterPt] = useState<{ index: number; w: number; h: number } | null>(null);
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  useEffect(() => {
    return () => {
      resetSession();
      clearRasterCache();
      clearPrintRasterCache();
      clearSmartCropCache();
    };
  }, [resetSession]);

  // Exact sizes of every page, read after the editor is already open.
  const refinePageSizes = useCallback(
    (uri: string) => {
      setTimeout(() => {
        void loadPdfPageSizes(uri)
          .then((m) => setPageSizes(m.pageSizesPt))
          .catch(() => {});
      }, 1500);
    },
    [setPageSizes],
  );

  useEffect(() => {
    const rawUri = params.docUri || params.uri;
    const rawName = params.docName || params.name || 'document.pdf';
    if (!rawUri || session) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const cached = await copyPdfToCache(rawUri, rawName);
        const meta = await loadPdfMetadata(cached, 150);
        if (!cancelled) {
          startSession({
            sourceUri: cached,
            sourceName: rawName,
            pageCount: meta.pageCount,
            pageSizesPt: meta.pageSizesPt,
          });
          setStep('size');
          refinePageSizes(cached);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Could not open this PDF.';
          Alert.alert('PDF', msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.docUri, params.uri, params.docName, params.name, refinePageSizes, session, startSession]);

  // On the print step, render the likely first pages now so Print starts sending at once.
  useEffect(() => {
    if (step !== 'print' || !session) return;
    prewarmPrintPages(session, [0, session.currentPageIndex]);
  }, [step, session]);

  const importPdf = useCallback(async () => {
    try {
      const picked = await pickDocumentWithSource({ preset: 'pdf' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('PDF', 'Please choose a PDF document.');
        return;
      }
      setLoading(true);
      const cached = await copyPdfToCache(picked.uri, picked.name);
      const meta = await loadPdfMetadata(cached, 150);
      startSession({
        sourceUri: cached,
        sourceName: picked.name,
        pageCount: meta.pageCount,
        pageSizesPt: meta.pageSizesPt,
      });
      setStep('size');
      refinePageSizes(cached);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open this PDF.';
      Alert.alert('PDF', msg);
    } finally {
      setLoading(false);
    }
  }, [pickDocumentWithSource, refinePageSizes, startSession]);

  const exportPdf = useCallback(async () => {
    if (!session || exporting) return;
    setExporting(true);
    setExportProgress('Exporting…');
    try {
      const result = await exportEditedPdf(session, (current, total) => {
        setExportProgress(`Page ${current} / ${total}`);
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: session.sourceName,
        });
      } else {
        Alert.alert('Exported', result.uri);
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Could not write PDF.');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [exporting, session]);

  const printPdf = useCallback(
    async (selection: PdfPrintSelection, options: PdfPrintOptions) => {
      if (!session || printing) return;
      const indices = resolvePrintPageIndices(selection, session.pageCount, session.currentPageIndex);
      if (indices.length === 0) {
        Alert.alert('Print', 'No pages match this selection.');
        return;
      }
      const manager = getPrinterManager();
      if (!manager.isConnected) {
        Alert.alert('Connect your printer first', 'Your printer is not connected. Connect it, then come back to print.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect', onPress: () => router.push('/printer-connect') },
        ]);
        return;
      }
      setPrinting(true);
      setPrintProgress('Rendering…');
      try {
        const result = await printEditedPdf(session, indices, {
          ...options,
          onProgress: (current, total) => setPrintProgress(`Page ${current} / ${total}`),
        });
        Alert.alert(
          'Print Sent',
          `${result.pagesPrinted} page${result.pagesPrinted === 1 ? '' : 's'} sent to ${deviceName || 'the printer'}.`,
        );
      } catch (err) {
        const message = formatPrintFailure(err);
        if (message) Alert.alert('Print Failed', message);
      } finally {
        setPrinting(false);
        setPrintProgress(null);
      }
    },
    [deviceName, printing, session],
  );

  useEffect(() => {
    setWalkthroughScroller((dy) =>
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: false }),
    );
    return () => setWalkthroughScroller(null);
  }, []);

  // Each screen has its own tour: it opens the first time that screen is shown.
  const hasIncomingDoc = Boolean(params.docUri || params.uri);
  useEffect(() => {
    const running = useWalkthroughStore.getState();
    if (running.active && running.tour === 'pdf') running.stop();
    if (step === 'pick' && hasIncomingDoc) return; // a shared PDF skips straight to Size
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maybeStart = () => {
      if (useSettingsStore.getState().pdfTourSeen.includes(step)) return;
      timer = setTimeout(() => startWalkthrough('pdf'), 600);
    };
    if (useSettingsStore.persist.hasHydrated()) maybeStart();
    const unsub = useSettingsStore.persist.onFinishHydration(maybeStart);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [step, hasIncomingDoc, startWalkthrough]);

  useEffect(
    () => () => {
      const { active, tour } = useWalkthroughStore.getState();
      if (active && tour === 'pdf') useWalkthroughStore.getState().stop();
    },
    [],
  );

  const goBack = () => {
    if (printing || exporting) return;
    if (step === 'print') {
      setStep('edit');
      return;
    }
    if (step === 'edit') {
      setStep('size');
      return;
    }
    if (step === 'size') {
      setStep('pick');
      return;
    }
    router.back();
  };

  const metaPageSize = session?.pageSizesPt[session.currentPageIndex] ?? { w: 612, h: 792 };
  const pageSize =
    rasterPt && session && rasterPt.index === session.currentPageIndex
      ? { w: rasterPt.w, h: rasterPt.h }
      : metaPageSize;
  const cropRegion = tool === 'crop' ? cropBase : null;
  const cropPageSize = cropRegion ? { w: pageSize.w * cropRegion.w, h: pageSize.h * cropRegion.h } : pageSize;
  // Window and section rects are fractions of the working page; the session stores fractions of the full page.
  const toFullPage = useCallback(
    (c: { originNorm: { x: number; y: number }; sizeNorm: { w: number; h: number } }) =>
      cropRegion
        ? {
            originNorm: { x: cropRegion.x + c.originNorm.x * cropRegion.w, y: cropRegion.y + c.originNorm.y * cropRegion.h },
            sizeNorm: { w: c.sizeNorm.w * cropRegion.w, h: c.sizeNorm.h * cropRegion.h },
          }
        : c,
    [cropRegion],
  );

  // A tapped section snaps the window to it. The label size is never changed:
  // the crop is fitted into the size the user already chose.
  const onSmartSelection = useCallback(
    (info: SmartCropSelectionInfo) => {
      if (!info.rect) {
        // Selection cleared: keep the window where it is.
        setCropNotice(null);
        return;
      }
      const next = clampCropNorm({ x: info.rect.x, y: info.rect.y }, { w: info.rect.w, h: info.rect.h });
      setDraftCrop(next);
      if (info.outcome === 'added' || info.outcome === 'stepped') {
        // Tapping a section is the choice: crop to it and stay on this page for more edits.
        setCrop({ scope: draftScope, ...toFullPage(next) });
        setTool(null);
        return;
      }
      setCropNotice(null);
    },
    [draftScope, setCrop, toFullPage],
  );

  const smart = useSmartCrop({
    sourceUri: session?.sourceUri ?? null,
    pageIndex: session?.currentPageIndex ?? 0,
    active: step === 'edit' && tool === 'crop',
    region: cropRegion,
    pageMm: { w: ptToMm(cropPageSize.w), h: ptToMm(cropPageSize.h) },
    hintSeen: smartCropHintSeen,
    onHintSeen: () => setSmartCropHintSeen(true),
    onSelection: onSmartSelection,
  });
  const smartNudged = smart.nudged;

  const onCropRect = useCallback(
    (o: { x: number; y: number }, sz: { w: number; h: number }) => {
      setDraftCrop(clampCropNorm(o, sz));
      // Dragging the window keeps it but drops the "selected section" highlight.
      smartNudged();
    },
    [smartNudged],
  );

  const openCrop = () => {
    setCropNotice(null);
    setCropKind('manual');
    setBaseUri(null);
    const saved = session?.crop;
    setDraftScope(saved?.scope ?? { mode: 'this' });
    if (session && saved?.sizeNorm && isCropped) {
      // Re-cropping: the existing crop becomes the page, with a fresh window on it.
      const c = clampCropNorm(saved.originNorm, saved.sizeNorm);
      setCropBase({ x: c.originNorm.x, y: c.originNorm.y, w: c.sizeNorm.w, h: c.sizeNorm.h });
      setDraftCrop(FULL_WINDOW);
      return;
    }
    setCropBase(null);
    setDraftCrop(FULL_WINDOW);
  };
  const applyCrop = () => {
    if (draftCrop) setCrop({ scope: draftScope, ...toFullPage(draftCrop) });
    setTool(null);
  };
  const removeCrop = () => {
    setCrop(null);
    smart.clear();
    setCropBase(null);
    setBaseUri(null);
    setDraftCrop(FULL_WINDOW);
  };

  const ensureWatermark = () => {
    if (!session?.watermark) setWatermark(defaultWatermark());
  };

  const onPickWmImage = async (uri: string) => {
    if (!session) return;
    const minSide = Math.min(session.outputSize.widthMm, session.outputSize.heightMm);
    const spacing = session.watermark?.tiled?.spacingNorm ?? { x: 0.22, y: 0.22 };
    const tilePx = previewTileSize(minSide, spacing);
    const tile = await downscaleWatermarkTile(uri, tilePx);
    patchWatermark({
      type: 'image',
      image: { sourceUri: uri, tileUri: tile.tileUri, tilePx: tile.tilePx },
    });
  };

  const isCropped = Boolean(
    session?.crop?.sizeNorm &&
      resolveScopeIndices(session.crop.scope, session.pageCount, session.currentPageIndex).includes(
        session.currentPageIndex,
      ),
  );

  // Render the preview only as sharp as the label needs: a zoomed-in crop gets more pixels,
  // a whole page fitted to a small label gets fewer. Keeps page changes quick.
  const previewDpi = useMemo(() => {
    if (!session) return PREVIEW_DPI;
    const cropForPreview = tool !== 'crop' && isCropped && session.crop?.sizeNorm ? session.crop : null;
    const longMm = Math.max(session.outputSize.widthMm, session.outputSize.heightMm, 1);
    const plan = planLabelRender({
      pageWpt: pageSize.w,
      pageHpt: pageSize.h,
      crop: cropForPreview ? { originNorm: cropForPreview.originNorm, sizeNorm: cropForPreview.sizeNorm! } : null,
      rotationDeg: 0,
      widthMm: session.outputSize.widthMm,
      heightMm: session.outputSize.heightMm,
      dpi: 640 / (longMm / 25.4),
      oversample: 1,
    });
    const floor = tool === 'crop' || !cropForPreview ? 150 : 0;
    // Few fixed steps, so switching tools never triggers a pile of new renders.
    const want = Math.max(floor, plan.rasterDpi);
    return want <= 150 ? 150 : want <= 225 ? 225 : PREVIEW_DPI;
  }, [isCropped, pageSize.h, pageSize.w, session, tool]);

  useEffect(() => {
    if (!session) {
      setPageUri(null);
      return;
    }
    let cancelled = false;
    let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    rasterPdfPageCached(session.sourceUri, session.currentPageIndex, previewDpi)
      .then((page) => {
        if (!cancelled) {
          setPageUri(page.uri);
          setRasterPt({ index: session.currentPageIndex, w: page.widthPt, h: page.heightPt });
          // Warm the next and previous page once this one is on screen, so paging is instant.
          prefetchTimer = setTimeout(
            () =>
              prefetchNeighborPages(session.sourceUri, session.currentPageIndex, session.pageCount, previewDpi),
            400,
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Could not render this page.';
          Alert.alert('PDF', msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (prefetchTimer) clearTimeout(prefetchTimer);
    };
  }, [session?.sourceUri, session?.currentPageIndex, session?.pageCount, previewDpi]);

  // Moving to another page while cropping: start over on that page's own crop.
  const cropPageIndex = session?.currentPageIndex;
  const lastCropPage = useRef(cropPageIndex);
  useEffect(() => {
    if (lastCropPage.current === cropPageIndex) return;
    lastCropPage.current = cropPageIndex;
    if (tool === 'crop') openCrop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropPageIndex]);

  useEffect(() => {
    if (tool !== 'crop' || !cropBase || !pageUri) return;
    let cancelled = false;
    regionImageCached(pageUri, cropBase)
      .then((uri) => {
        if (!cancelled) setBaseUri(uri);
      })
      .catch(() => {
        // Fall back to the whole page: the crop still works, just not zoomed to the region.
        if (!cancelled) {
          setCropBase(null);
          setBaseUri(null);
          setDraftCrop(FULL_WINDOW);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tool, cropBase, pageUri]);

  // Cut the cropped part out in the background, so opening Crop again does not wait for it.
  const savedCrop = session?.crop;
  useEffect(() => {
    if (tool === 'crop' || !pageUri || !isCropped || !savedCrop?.sizeNorm) return;
    const c = clampCropNorm(savedCrop.originNorm, savedCrop.sizeNorm);
    void regionImageCached(pageUri, { x: c.originNorm.x, y: c.originNorm.y, w: c.sizeNorm.w, h: c.sizeNorm.h }).catch(() => {});
  }, [tool, pageUri, isCropped, savedCrop]);

  // Smart Crop Phase 1: dev-only on-device measurement. Logs detected boxes and the
  // render / decode / downscale / detect split. No UI, no session change.
  const probeUri = session?.sourceUri;
  const probePage = session?.currentPageIndex;
  useEffect(() => {
    if (!__DEV__ || !probeUri || probePage == null) return;
    // Let the preview render settle first so the timings are not contended.
    const timer = setTimeout(() => {
      void import('@/lib/pdf-editor/smart-crop/dev-probe').then((m) =>
        m.logSmartCropProbe(probeUri, probePage, { writeFixture: true }),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [probeUri, probePage]);

  const stripItems = useMemo<PrintStripItem[]>(() => {
    if (!session) return [];
    const crop = session.crop?.sizeNorm ? session.crop : null;
    const cropped = crop ? new Set(resolveScopeIndices(crop.scope, session.pageCount, session.currentPageIndex)) : null;
    return printIndices.map((pageIndex) => ({
      pageIndex,
      rect:
        crop && cropped?.has(pageIndex)
          ? { x: crop.originNorm.x, y: crop.originNorm.y, w: crop.sizeNorm!.w, h: crop.sizeNorm!.h }
          : null,
      rotation: session.rotationByPage[pageIndex] ?? 0,
    }));
  }, [printIndices, session]);

  const renderViewer = (mode: { crop: boolean; watermark: boolean; expand?: boolean; hideHint?: boolean }) => {
    if (!session) return null;
    return (
      <PdfPageViewer
        uri={mode.crop && cropRegion ? baseUri : pageUri}
        pending={Boolean(mode.crop && cropRegion && !baseUri)}
        pageWpt={mode.crop ? cropPageSize.w : pageSize.w}
        pageHpt={mode.crop ? cropPageSize.h : pageSize.h}
        rotation={session.rotationByPage[session.currentPageIndex] ?? 0}
        outputSize={session.outputSize}
        originNorm={mode.crop ? (draftCrop?.originNorm ?? { x: 0, y: 0 }) : (session.crop?.originNorm ?? { x: 0, y: 0 })}
        sizeNorm={mode.crop ? draftCrop?.sizeNorm : session.crop?.sizeNorm}
        onCropRect={onCropRect}
        overlays={mode.crop && cropKind === 'smart' ? smart.overlays : undefined}
        onTapPage={mode.crop && cropKind === 'smart' ? smart.tap : undefined}
        busyAt={mode.crop ? smart.busyAt : null}
        revealOutside={mode.crop && cropKind === 'smart' && !smart.focused && (smart.overlaysOn || smart.selectedCount > 0)}
        onOverlayActivate={mode.crop && cropKind === 'smart' ? smart.activate : undefined}
        cropEnabled={mode.crop}
        isCropped={isCropped}
        expand={mode.expand}
        hideHint={mode.hideHint}
        watermark={session.watermark}
        watermarkEnabled={mode.watermark && !!session.watermark}
        onStampOffset={(offsetNorm) => {
          const wm = session.watermark ?? defaultWatermark();
          patchWatermark({
            stamp: {
              anchor: wm.stamp?.anchor ?? 'center',
              offsetNorm,
              sizeNorm: wm.stamp?.sizeNorm ?? 0.42,
            },
          });
        }}
        sharpness={session.sharpnessByPage[session.currentPageIndex] ?? 0}
        colorMode={pageColorMode(session, session.currentPageIndex)}
        grayThreshold={grayThreshold}
      />
    );
  };

  const sizePreview = pageUri ? (
    <Image source={{ uri: pageUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
  ) : (
    <View style={[StyleSheet.absoluteFill, styles.previewSpinner]}>
      <ActivityIndicator color={C.accent} />
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.headerBtn}>
          <AppIcon name="chevron.left" size={22} tintColor={C.onAccent} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {STEP_TITLE[step]}
        </Text>
        <Pressable
          onPress={() => startWalkthrough('pdf')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Help for this screen"
          style={({ pressed }) => [styles.headerHelp, pressed && styles.pressed]}>
          <AppIcon name="info.circle" tintColor={C.onAccent} size={22} />
        </Pressable>
        <PrinterConnectionPill />
      </View>

      {step !== 'pick' && step !== 'edit' && session ? (
        <View style={styles.stepBar}>
          {(['size', 'edit', 'print'] as const).map((id, i) => {
            const order = ['size', 'edit', 'print'];
            const done = order.indexOf(step) > i;
            const on = step === id;
            return (
              <View key={id} style={styles.stepItem}>
                <View style={[styles.stepDot, (on || done) && styles.stepDotOn]}>
                  {done ? (
                    <AppIcon name="checkmark" size={11} tintColor={C.onAccent} />
                  ) : (
                    <Text style={[styles.stepNum, (on || done) && styles.stepNumOn]}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, on && styles.stepLabelOn]}>
                  {id === 'size' ? 'Size' : id === 'edit' ? 'Edit' : 'Print'}
                </Text>
                {i < 2 ? <View style={[styles.stepLine, done && styles.stepLineOn]} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {step === 'pick' || !session ? (
        <View style={styles.empty}>
          {loading ? <ActivityIndicator color={C.accent} /> : null}
          <Text style={styles.emptyTitle}>Import a PDF</Text>
          <Text style={styles.emptyBody}>
            Choose a file from this device or Google Drive. You will set the label size next.
          </Text>
        </View>
      ) : step === 'size' ? (
        <FormScrollView
          ref={scrollRef}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <WalkthroughTarget id="pdf.file" style={styles.fileRow}>
            <View style={styles.fileIcon}>
              <AppIcon name="doc.text" size={22} tintColor={C.accent} />
            </View>
            <View style={styles.fileText}>
              <Text style={styles.fileName} numberOfLines={1}>
                {session.sourceName}
              </Text>
              <Text style={styles.fileMeta}>
                {session.pageCount} {session.pageCount === 1 ? 'page' : 'pages'}
              </Text>
            </View>
            <Pressable onPress={() => void importPdf()} hitSlop={8} disabled={loading}>
              <Text style={styles.change}>Change</Text>
            </Pressable>
          </WalkthroughTarget>
          <WalkthroughTarget id="pdf.size">
            <PdfOutputSizeRow value={session.outputSize} onChange={setOutputSize} preview={sizePreview} />
          </WalkthroughTarget>
        </FormScrollView>
      ) : step === 'edit' ? (
        <View style={styles.editColumn}>
          <WalkthroughTarget id="pdf.stage" style={styles.cropStage}>
            {renderViewer({
              crop: tool === 'crop',
              watermark: tool === 'watermark',
              expand: true,
              hideHint: true,
            })}
            {loading ? (
              <View pointerEvents="none" style={styles.pageLoading}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : null}
          </WalkthroughTarget>
          <PdfToolPanel
            active={tool}
            bottomInset={Math.max(insets.bottom, 8)}
            accessory={
              <PdfPageNav
                index={session.currentPageIndex}
                total={session.pageCount}
                onPrev={() => setCurrentPage(session.currentPageIndex - 1)}
                onNext={() => setCurrentPage(session.currentPageIndex + 1)}
              />
            }
            onChange={(id) => {
              const nextTool = tool === id ? null : id;
              setTool(nextTool);
              if (nextTool === 'crop') openCrop();
              if (id === 'watermark') ensureWatermark();
            }}>
            {tool === 'crop' ? (
              <PdfCropTool
                scope={draftScope}
                pageCount={session.pageCount}
                hasCrop={Boolean(session.crop)}
                selectionMm={
                  draftCrop
                    ? {
                        w: draftCrop.sizeNorm.w * ptToMm(cropPageSize.w),
                        h: draftCrop.sizeNorm.h * ptToMm(cropPageSize.h),
                      }
                    : null
                }
                outputSize={session.outputSize}
                onResetCrop={removeCrop}
                onApplyCrop={applyCrop}
                onCancel={() => setTool(null)}
                onScope={setDraftScope}
                kind={cropKind}
                onKind={(next) => {
                  setCropKind(next);
                  if (next === 'manual') smart.clear();
                  else smart.showAll(); // detect and outline the sections right away
                }}
                smart={{
                  status: smart.status,
                  notice: smart.notice ?? cropNotice,
                  selectedCount: smart.selectedCount,
                  selectedLabel: smart.selectedLabel,
                  hiddenCount: smart.hiddenCount,
                  canStep: smart.canStep,
                  onSmartCrop: smart.showAll,
                  onPrev: () => smart.step(-1),
                  onNext: () => smart.step(1),
                  onClear: smart.clear,
                }}
              />
            ) : null}
            {tool === 'rotate' ? (
              <PdfRotateTool
                value={session.rotationByPage[session.currentPageIndex] ?? 0}
                pageCount={session.pageCount}
                onChange={setRotationForScope}
              />
            ) : null}
            {tool === 'sharpness' ? (
              <PdfSharpnessTool
                value={session.sharpnessByPage[session.currentPageIndex] ?? 0}
                pageCount={session.pageCount}
                onChange={setSharpnessForScope}
              />
            ) : null}
            {tool === 'watermark' && session.watermark ? (
              <PdfWatermarkTool
                value={session.watermark}
                pageCount={session.pageCount}
                onChange={async (next) => {
                  if (next.type === 'image' && next.layout === 'tiled' && next.image?.sourceUri) {
                    const minSide = Math.min(session.outputSize.widthMm, session.outputSize.heightMm);
                    const tilePx = previewTileSize(minSide, next.tiled?.spacingNorm ?? { x: 0.22, y: 0.22 });
                    const tile = await downscaleWatermarkTile(next.image.sourceUri, tilePx);
                    setWatermark({
                      ...next,
                      image: { ...next.image, tileUri: tile.tileUri, tilePx: tile.tilePx },
                    });
                    return;
                  }
                  setWatermark(next);
                }}
                onPickImage={onPickWmImage}
              />
            ) : null}
            {tool === 'color' ? (
              <PdfColorTool
                value={pageColorMode(session, session.currentPageIndex)}
                pageCount={session.pageCount}
                onChange={setColorModeForScope}
              />
            ) : null}
          </PdfToolPanel>
        </View>
      ) : (
        <FormScrollView
          ref={scrollRef}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          style={styles.scroll}
          bottomOffset={100}
          contentContainerStyle={styles.printContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <WalkthroughTarget id="pdf.preview" style={styles.previewArea}>
            <View style={styles.previewShadow}>
              {renderViewer({ crop: false, watermark: false, hideHint: true })}
            </View>
            <View style={styles.sizeBadge}>
              <Text style={styles.sizeBadgeText}>
                {session.outputSize.widthMm} × {session.outputSize.heightMm} mm
              </Text>
            </View>
            {session.pageCount > 1 ? (
              <PdfPageNav
                index={session.currentPageIndex}
                total={session.pageCount}
                onPrev={() => setCurrentPage(session.currentPageIndex - 1)}
                onNext={() => setCurrentPage(session.currentPageIndex + 1)}
              />
            ) : null}
            {loading ? <ActivityIndicator color={C.onAccent} style={{ marginTop: 8 }} /> : null}
          </WalkthroughTarget>
          <PrintPagesStrip uri={session.sourceUri} items={stripItems} labelAspect={session.outputSize.widthMm / session.outputSize.heightMm} />
          <View style={styles.printSettings}>
            <PdfPrintPanel
              ref={printPanelRef}
              onSelectedPagesChange={setPrintIndices}
              pageCount={session.pageCount}
              currentPage={session.currentPageIndex + 1}
              printing={printing}
              progress={printProgress ?? exportProgress}
              outputLabel={`${session.outputSize.widthMm} × ${session.outputSize.heightMm} mm`}
              onPrint={(selection, options) => {
                void printPdf(selection, options);
              }}
            />
          </View>
        </FormScrollView>
      )}

      {(
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) + Spacing.two + 6 }]}>
        {step === 'print' && session ? (
          <View style={styles.printActions}>
            <WalkthroughTarget id="pdf.export" style={styles.exportSlot}>
            <Pressable
              onPress={() => void exportPdf()}
              disabled={exporting || printing}
              style={({ pressed }) => [
                styles.exportBtn,
                (exporting || printing) && styles.btnOff,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.exportBtnText}>{exporting ? 'Exporting…' : 'Export'}</Text>
            </Pressable>
            </WalkthroughTarget>
            <WalkthroughTarget id="pdf.print" style={styles.printSlot}>
            <Pressable
              onPress={() => {
                if (!printerLive) {
                  router.push('/printer-connect');
                  return;
                }
                printPanelRef.current?.submit();
              }}
              disabled={printing || exporting}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.printBtn,
                !printerLive && styles.connectFirstBtn,
                (printing || exporting) && styles.btnOff,
                pressed && styles.pressed,
              ]}>
              {printing ? (
                <ActivityIndicator color={C.onAccent} size="small" />
              ) : (
                <Text style={styles.primaryText}>{printerLive ? 'Print' : 'Connect printer'}</Text>
              )}
            </Pressable>
            </WalkthroughTarget>
          </View>
        ) : (step === 'size' || step === 'edit') && session ? (
          <View style={styles.printActions}>
            <Pressable
              onPress={goBack}
              style={({ pressed }) => [styles.exportBtn, pressed && styles.pressed]}>
              <Text style={styles.exportBtnText}>Back</Text>
            </Pressable>
            <WalkthroughTarget id={step === 'edit' ? 'pdf.headerNext' : 'pdf.next'} style={styles.printSlot}>
              <Pressable
                onPress={() => setStep(step === 'size' ? 'edit' : 'print')}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Next</Text>
              </Pressable>
            </WalkthroughTarget>
          </View>
        ) : (
          <WalkthroughTarget id="pdf.import">
          <Pressable
            onPress={() => {
              void importPdf();
            }}
            disabled={loading}
            style={({ pressed }) => [styles.primaryBtn, loading && styles.btnOff, pressed && styles.pressed]}>
            {loading ? (
              <ActivityIndicator color={C.onAccent} size="small" />
            ) : (
              <Text style={styles.primaryText}>Import PDF</Text>
            )}
          </Pressable>
          </WalkthroughTarget>
        )}
      </View>
      )}
      {documentSourceSheet}
      <WalkthroughOverlay
        tour="pdf"
        steps={PDF_WALKTHROUGHS[step]}
        onFinish={() => {
          markPdfTourSeen(step);
          stopWalkthrough();
        }}
      />
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  header: {
    height: 48,
    backgroundColor: c.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBtn: { width: 44, paddingHorizontal: 6, paddingVertical: 8 },
  headerTitle: {
    flex: 1,
    textAlign: 'left',
    color: c.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
  headerHelp: { paddingHorizontal: 6, paddingVertical: 6 },
  exportSlot: { flex: 1 },
  printSlot: { flex: 1.4 },
  pageLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: c.accentFill },
  stepNum: { fontSize: 11, fontWeight: '700', color: c.textSecondary },
  stepNumOn: { color: c.onAccent },
  stepLabel: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: c.textMuted },
  stepLabelOn: { color: c.text },
  stepLine: { flex: 1, height: 2, marginHorizontal: 8, backgroundColor: c.fillStrong, borderRadius: 1 },
  stepLineOn: { backgroundColor: c.accentFill },
  editColumn: { flex: 1, minHeight: 0 },
  cropStage: { flex: 1, minHeight: 0, width: '100%', overflow: 'hidden', backgroundColor: '#111827' }, // theme-fixed: dark crop stage in both themes
  previewArea: {
    backgroundColor: scheme === 'light' ? '#AEB4BC' : c.canvasArea, // theme-fixed: light keeps its grey stage around the white label
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  previewShadow: {
    borderRadius: 6,
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
  sizeBadgeText: { color: c.onAccent, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  printContent: { paddingBottom: 24 },
  printSettings: { paddingHorizontal: 12, paddingTop: 12 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 24, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text },
  emptyBody: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1, gap: 2 },
  fileName: { fontSize: 15, fontWeight: '600', color: c.text },
  fileMeta: { fontSize: 12, color: c.textSecondary },
  change: { fontSize: 14, fontWeight: '600', color: c.accent },
  previewSpinner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: c.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  primaryBtn: {
    backgroundColor: c.accentFill,
    borderRadius: 26,
    minHeight: 52,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
  printActions: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1,
    minHeight: 52,
    flexShrink: 0,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
  exportBtnText: { color: c.accent, fontSize: 16, fontWeight: '600' },
  printBtn: { flex: 1.4 },
  connectFirstBtn: { backgroundColor: c.dangerFill },
  btnOff: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
}));
