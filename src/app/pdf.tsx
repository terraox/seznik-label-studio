import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { PdfColorTool } from '@/components/pdf-editor/pdf-color-tool';
import { PdfCropTool } from '@/components/pdf-editor/pdf-crop-tool';
import { PdfOutputSizeRow } from '@/components/pdf-editor/pdf-output-size-row';
import { PdfPageNav } from '@/components/pdf-editor/pdf-page-nav';
import { PdfPageViewer } from '@/components/pdf-editor/pdf-page-viewer';
import { PdfPrintPanel, type PdfPrintPanelHandle } from '@/components/pdf-editor/pdf-print-sheet';
import { PdfRotateTool } from '@/components/pdf-editor/pdf-rotate-tool';
import { PdfSharpnessTool } from '@/components/pdf-editor/pdf-sharpness-tool';
import { PdfToolPanel, type PdfToolId } from '@/components/pdf-editor/pdf-tool-panel';
import { PrinterConnectionPill } from '@/components/printers/printer-connection-pill';
import { PdfWatermarkTool } from '@/components/pdf-editor/pdf-watermark-tool';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { planLabelRender } from '@/lib/pdf-editor/label-render-plan';
import { exportEditedPdf } from '@/lib/pdf-editor/export';
import { copyPdfToCache, loadPdfMetadata } from '@/lib/pdf-editor/load';
import { printEditedPdf, type PdfPrintOptions } from '@/lib/pdf-editor/print';
import { resolvePrintPageIndices, type PdfPrintSelection } from '@/lib/pdf-editor/session';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { formatPrintFailure } from '@/lib/printer/print-job';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  PREVIEW_DPI,
  clearRasterCache,
  rasterPdfPageCached,
} from '@/lib/pdf-editor/raster';
import {
  clampCropNorm,
  cropAspectForLabel,
  defaultCropWindow,
  defaultWatermark,
  pageColorMode,
  ptToMm,
  resolveScopeIndices,
  snapCropToAspect,
  type PageScope,
} from '@/lib/pdf-editor/session';
import { downscaleWatermarkTile, previewTileSize } from '@/lib/pdf-editor/watermark-tile';
import { usePdfEditStore } from '@/stores/pdf-edit-store';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';

type Step = 'pick' | 'size' | 'edit' | 'print';

const STEP_TITLE: Record<Step, string> = {
  pick: 'Print PDF',
  size: 'Label size',
  edit: 'Edit PDF',
  print: 'Print',
};

/** Standalone PDF editor: size, then crop tools, then print or export. */
export default function PdfEditorScreen() {
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
  const setRotationForScope = usePdfEditStore((s) => s.setRotationForScope);
  const setSharpnessForScope = usePdfEditStore((s) => s.setSharpnessForScope);
  const setWatermark = usePdfEditStore((s) => s.setWatermark);
  const patchWatermark = usePdfEditStore((s) => s.patchWatermark);
  const setColorModeForScope = usePdfEditStore((s) => s.setColorModeForScope);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const printerStatus = usePrinterStore((s) => s.status);
  const printerLive = printerStatus === 'connected' || printerStatus === 'printing';
  const grayThreshold = useSettingsStore((s) => s.defaults.grayThreshold);

  const [step, setStep] = useState<Step>('pick');
  const [tool, setTool] = useState<PdfToolId | null>(null);
  const [pageUri, setPageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState<string | null>(null);
  const printPanelRef = useRef<PdfPrintPanelHandle>(null);
  // Crop is edited as a draft and only saved to the session when Apply is pressed.
  const [draftCrop, setDraftCrop] = useState<{
    originNorm: { x: number; y: number };
    sizeNorm: { w: number; h: number };
  } | null>(null);
  const [draftScope, setDraftScope] = useState<PageScope>({ mode: 'this' });
  // Optional: lock the crop to the label's shape. Off by default so width and height crop freely.
  const [matchLabel, setMatchLabel] = useState(false);
  // Page size as the PDF renderer sees it; crop fractions are measured against this bitmap.
  const [rasterPt, setRasterPt] = useState<{ index: number; w: number; h: number } | null>(null);
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  useEffect(() => {
    return () => {
      resetSession();
      clearRasterCache();
    };
  }, [resetSession]);

  useEffect(() => {
    const rawUri = params.docUri || params.uri;
    const rawName = params.docName || params.name || 'document.pdf';
    if (!rawUri || session) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const cached = await copyPdfToCache(rawUri, rawName);
        const meta = await loadPdfMetadata(cached);
        if (!cancelled) {
          startSession({
            sourceUri: cached,
            sourceName: rawName,
            pageCount: meta.pageCount,
            pageSizesPt: meta.pageSizesPt,
          });
          setStep('size');
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
  }, [params.docUri, params.uri, params.docName, params.name, session, startSession]);

  const importPdf = useCallback(async () => {
    try {
      const picked = await pickDocumentWithSource({ preset: 'pdf' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('PDF', 'Please choose a PDF document.');
        return;
      }
      setLoading(true);
      const cached = await copyPdfToCache(picked.uri, picked.name);
      const meta = await loadPdfMetadata(cached);
      startSession({
        sourceUri: cached,
        sourceName: picked.name,
        pageCount: meta.pageCount,
        pageSizesPt: meta.pageSizesPt,
      });
      setStep('size');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open this PDF.';
      Alert.alert('PDF', msg);
    } finally {
      setLoading(false);
    }
  }, [pickDocumentWithSource, startSession]);

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
    router.back();
  };

  const metaPageSize = session?.pageSizesPt[session.currentPageIndex] ?? { w: 612, h: 792 };
  const pageSize =
    rasterPt && session && rasterPt.index === session.currentPageIndex
      ? { w: rasterPt.w, h: rasterPt.h }
      : metaPageSize;
  const currentRotation = session?.rotationByPage[session.currentPageIndex] ?? 0;
  const labelAspect = session ? cropAspectForLabel(session.outputSize, currentRotation) : 1;
  const onCropRect = useCallback(
    (o: { x: number; y: number }, sz: { w: number; h: number }) => setDraftCrop(clampCropNorm(o, sz)),
    [],
  );

  const openCrop = () => {
    const saved = session?.crop;
    setDraftScope(saved?.scope ?? { mode: 'this' });
    const start = saved?.sizeNorm
      ? clampCropNorm(saved.originNorm, saved.sizeNorm)
      : session
        ? defaultCropWindow(pageSize, session.outputSize)
        : null;
    setDraftCrop(start && matchLabel ? snapCropToAspect(start, pageSize, labelAspect) : start);
  };
  const applyCrop = () => {
    if (draftCrop) setCrop({ scope: draftScope, ...draftCrop });
    setTool(null);
  };
  const toggleMatchLabel = (on: boolean) => {
    setMatchLabel(on);
    if (on && draftCrop) setDraftCrop(snapCropToAspect(draftCrop, pageSize, labelAspect));
  };
  const removeCrop = () => {
    setCrop(null);
    if (session) setDraftCrop(defaultCropWindow(pageSize, session.outputSize));
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
    setLoading(true);
    rasterPdfPageCached(session.sourceUri, session.currentPageIndex, previewDpi)
      .then((page) => {
        if (!cancelled) {
          setPageUri(page.uri);
          setRasterPt({ index: session.currentPageIndex, w: page.widthPt, h: page.heightPt });
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
    };
  }, [session?.sourceUri, session?.currentPageIndex, session?.pageCount, previewDpi]);

  const renderViewer = (mode: { crop: boolean; watermark: boolean; expand?: boolean; hideHint?: boolean }) => {
    if (!session) return null;
    return (
      <PdfPageViewer
        uri={pageUri}
        pageWpt={pageSize.w}
        pageHpt={pageSize.h}
        rotation={session.rotationByPage[session.currentPageIndex] ?? 0}
        outputSize={session.outputSize}
        originNorm={mode.crop ? (draftCrop?.originNorm ?? { x: 0, y: 0 }) : (session.crop?.originNorm ?? { x: 0, y: 0 })}
        sizeNorm={mode.crop ? draftCrop?.sizeNorm : session.crop?.sizeNorm}
        onCropRect={onCropRect}
        aspectLock={mode.crop && matchLabel ? labelAspect : 0}
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
      <ActivityIndicator color={Palette.accent} />
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.headerBtn}>
          <AppIcon name="chevron.left" size={22} tintColor="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{STEP_TITLE[step]}</Text>
        <PrinterConnectionPill />
      </View>

      {step !== 'pick' && session ? (
        <View style={styles.stepBar}>
          {(['size', 'edit', 'print'] as const).map((id, i) => {
            const order = ['size', 'edit', 'print'];
            const done = order.indexOf(step) > i;
            const on = step === id;
            return (
              <View key={id} style={styles.stepItem}>
                <View style={[styles.stepDot, (on || done) && styles.stepDotOn]}>
                  {done ? (
                    <AppIcon name="checkmark" size={11} tintColor="#FFFFFF" />
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
          {loading ? <ActivityIndicator color={Palette.accent} /> : null}
          <Text style={styles.emptyTitle}>Import a PDF</Text>
          <Text style={styles.emptyBody}>
            Choose a file from this device or Google Drive. You will set the label size next.
          </Text>
        </View>
      ) : step === 'size' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.fileRow}>
            <View style={styles.fileIcon}>
              <AppIcon name="doc.text" size={22} tintColor={Palette.accent} />
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
          </View>
          <PdfOutputSizeRow value={session.outputSize} onChange={setOutputSize} preview={sizePreview} />
        </ScrollView>
      ) : step === 'edit' ? (
        <View style={styles.editColumn}>
          {tool === 'crop' ? (
            <View style={styles.cropStage}>
              {renderViewer({ crop: true, watermark: false, expand: true })}
              {loading ? <ActivityIndicator color={Palette.accent} style={{ marginVertical: 8 }} /> : null}
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.editContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.previewArea}>
                <View style={styles.previewShadow}>
                  {renderViewer({ crop: false, watermark: tool === 'watermark', hideHint: true })}
                </View>
                <View style={styles.sizeBadge}>
                  <Text style={styles.sizeBadgeText}>
                    {isCropped ? 'Cropped · ' : ''}
                    {session.outputSize.widthMm} × {session.outputSize.heightMm} mm
                  </Text>
                </View>
                {loading ? <ActivityIndicator color="#FFFFFF" style={{ marginTop: 8 }} /> : null}
              </View>
            </ScrollView>
          )}
          {session.pageCount > 1 ? (
            <PdfPageNav
              index={session.currentPageIndex}
              total={session.pageCount}
              onPrev={() => setCurrentPage(session.currentPageIndex - 1)}
              onNext={() => setCurrentPage(session.currentPageIndex + 1)}
            />
          ) : null}
          <PdfToolPanel
            active={tool}
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
                        w: draftCrop.sizeNorm.w * ptToMm(pageSize.w),
                        h: draftCrop.sizeNorm.h * ptToMm(pageSize.h),
                      }
                    : null
                }
                outputSize={session.outputSize}
                matchLabel={matchLabel}
                onMatchLabel={toggleMatchLabel}
                onResetCrop={removeCrop}
                onApplyCrop={applyCrop}
                onCancel={() => setTool(null)}
                onScope={setDraftScope}
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
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.printContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.previewArea}>
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
            {loading ? <ActivityIndicator color="#FFFFFF" style={{ marginTop: 8 }} /> : null}
          </View>
          <View style={styles.printSettings}>
            <PdfPrintPanel
              ref={printPanelRef}
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
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        {step === 'print' && session ? (
          <View style={styles.printActions}>
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
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryText}>{printerLive ? 'Print' : 'Connect printer'}</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              if (step === 'pick' || !session) {
                void importPdf();
                return;
              }
              if (step === 'size') setStep('edit');
              else if (step === 'edit') setStep('print');
            }}
            disabled={loading && (step === 'pick' || !session)}
            style={({ pressed }) => [
              styles.primaryBtn,
              loading && (step === 'pick' || !session) && styles.btnOff,
              pressed && styles.pressed,
            ]}>
            {loading && (step === 'pick' || !session) ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryText}>{step === 'pick' || !session ? 'Import PDF' : 'Next'}</Text>
            )}
          </Pressable>
        )}
      </View>
      {documentSourceSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.screen },
  header: {
    height: 48,
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBtn: { width: 44, paddingHorizontal: 6, paddingVertical: 8 },
  headerTitle: {
    flex: 1,
    textAlign: 'left',
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: Palette.accent },
  stepNum: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  stepNumOn: { color: '#FFFFFF' },
  stepLabel: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  stepLabelOn: { color: Palette.ink },
  stepLine: { flex: 1, height: 2, marginHorizontal: 8, backgroundColor: '#E2E8F0', borderRadius: 1 },
  stepLineOn: { backgroundColor: Palette.accent },
  editColumn: { flex: 1 },
  cropStage: { flex: 1, width: '100%', backgroundColor: '#111827' },
  previewArea: {
    backgroundColor: '#AEB4BC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  previewShadow: {
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  sizeBadge: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sizeBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  printContent: { paddingBottom: 24 },
  printSettings: { paddingHorizontal: 12, paddingTop: 12 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 24, gap: 12 },
  editContent: { paddingBottom: 24 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Palette.ink },
  emptyBody: { fontSize: 14, color: Palette.muted, textAlign: 'center', lineHeight: 20 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1, gap: 2 },
  fileName: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  fileMeta: { fontSize: 12, color: '#64748B' },
  change: { fontSize: 14, fontWeight: '600', color: Palette.accent },
  previewSpinner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: Palette.screen,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  primaryBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 26,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  printActions: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  exportBtnText: { color: Palette.accent, fontSize: 16, fontWeight: '600' },
  printBtn: { flex: 1.4 },
  connectFirstBtn: { backgroundColor: '#DC2626' },
  btnOff: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
