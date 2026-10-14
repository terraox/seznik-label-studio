import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { PdfWatermarkTool } from '@/components/pdf-editor/pdf-watermark-tool';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { exportEditedPdf } from '@/lib/pdf-editor/export';
import { copyPdfToCache, loadPdfMetadata } from '@/lib/pdf-editor/load';
import { printEditedPdf } from '@/lib/pdf-editor/print';
import { resolvePrintPageIndices, type PdfPrintSelection } from '@/lib/pdf-editor/session';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { formatPrintFailure } from '@/lib/printer/print-job';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  PREVIEW_DPI,
  clearRasterCache,
  prefetchNeighborPages,
  rasterPdfPageCached,
} from '@/lib/pdf-editor/raster';
import {
  cropWindowPts,
  defaultWatermark,
  pageColorMode,
  resolveScopeIndices,
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
  const setCropScope = usePdfEditStore((s) => s.setCropScope);
  const setCropRect = usePdfEditStore((s) => s.setCropRect);
  const setRotationForScope = usePdfEditStore((s) => s.setRotationForScope);
  const setSharpnessForScope = usePdfEditStore((s) => s.setSharpnessForScope);
  const setWatermark = usePdfEditStore((s) => s.setWatermark);
  const patchWatermark = usePdfEditStore((s) => s.patchWatermark);
  const setColorModeForScope = usePdfEditStore((s) => s.setColorModeForScope);
  const deviceName = usePrinterStore((s) => s.deviceName);
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

  useEffect(() => {
    if (!session) {
      setPageUri(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    rasterPdfPageCached(session.sourceUri, session.currentPageIndex, PREVIEW_DPI)
      .then((page) => {
        if (!cancelled) setPageUri(page.uri);
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
    prefetchNeighborPages(session.sourceUri, session.currentPageIndex, session.pageCount, PREVIEW_DPI);
    return () => {
      cancelled = true;
    };
  }, [session?.sourceUri, session?.currentPageIndex, session?.pageCount]);

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
    async (selection: PdfPrintSelection, copies: number) => {
      if (!session || printing) return;
      const indices = resolvePrintPageIndices(selection, session.pageCount, session.currentPageIndex);
      if (indices.length === 0) {
        Alert.alert('Print', 'No pages match this selection.');
        return;
      }
      const manager = getPrinterManager();
      if (!manager.isConnected) {
        Alert.alert('Printer Not Connected', 'Please connect your thermal printer before printing.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect', onPress: () => router.push('/printer-connect') },
        ]);
        return;
      }
      setPrinting(true);
      setPrintProgress('Rendering…');
      try {
        const result = await printEditedPdf(session, indices, {
          copies,
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

  const pageSize = session?.pageSizesPt[session.currentPageIndex] ?? { w: 612, h: 792 };
  const defaultOrigin = (() => {
    if (!session) return { x: 0, y: 0 };
    const box = cropWindowPts(pageSize, session.outputSize, { x: 0, y: 0 });
    if (!box.fits) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (pageSize.w - box.w) / 2 / pageSize.w),
      y: Math.max(0, (pageSize.h - box.h) / 2 / pageSize.h),
    };
  })();
  const origin = session?.crop?.originNorm ?? defaultOrigin;
  const cropScope: PageScope = session?.crop?.scope ?? { mode: 'this' };

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
    session?.crop &&
      resolveScopeIndices(session.crop.scope, session.pageCount, session.currentPageIndex).includes(
        session.currentPageIndex,
      ),
  );

  const renderViewer = (mode: { crop: boolean; watermark: boolean; expand?: boolean }) => {
    if (!session) return null;
    return (
      <PdfPageViewer
        uri={pageUri}
        pageWpt={pageSize.w}
        pageHpt={pageSize.h}
        rotation={session.rotationByPage[session.currentPageIndex] ?? 0}
        outputSize={session.outputSize}
        originNorm={origin}
        sizeNorm={session.crop?.sizeNorm}
        onCropRect={setCropRect}
        cropEnabled={mode.crop}
        isCropped={isCropped}
        expand={mode.expand}
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
        <View style={styles.headerBtn} />
      </View>

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
              {renderViewer({ crop: false, watermark: tool === 'watermark' })}
              {loading ? <ActivityIndicator color={Palette.accent} style={{ marginVertical: 8 }} /> : null}
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
              if (nextTool === 'crop' && !session.crop) {
                setCropRect({ x: 0.1, y: 0.1 }, { w: 0.8, h: 0.8 });
              }
              if (id === 'watermark') ensureWatermark();
            }}>
            {tool === 'crop' ? (
              <PdfCropTool
                scope={cropScope}
                pageCount={session.pageCount}
                hasCrop={Boolean(session.crop)}
                onResetCrop={() => setCrop(null)}
                onApplyCrop={() => setTool(null)}
                onScope={(scope) => {
                  setCropScope(scope);
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
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {renderViewer({ crop: false, watermark: false })}
          <PdfPrintPanel
            ref={printPanelRef}
            pageCount={session.pageCount}
            currentPage={session.currentPageIndex + 1}
            printing={printing}
            progress={printProgress ?? exportProgress}
            onPrint={(selection, copies) => {
              void printPdf(selection, copies);
            }}
          />
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
              onPress={() => printPanelRef.current?.submit()}
              disabled={printing || exporting}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.printBtn,
                (printing || exporting) && styles.btnOff,
                pressed && styles.pressed,
              ]}>
              {printing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryText}>Print</Text>
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
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  editColumn: { flex: 1 },
  cropStage: { flex: 1, width: '100%' },
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
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  printActions: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  exportBtnText: { color: Palette.accent, fontSize: 16, fontWeight: '600' },
  printBtn: { flex: 1.4 },
  btnOff: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
