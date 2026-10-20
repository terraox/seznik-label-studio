import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/ecommerce-label/label-preview';
import { PdfPrintPanel, type PdfPrintPanelHandle } from '@/components/pdf-editor/pdf-print-sheet';
import { PrintPagesStrip, type PrintStripItem } from '@/components/pdf-editor/print-pages-strip';
import { PdfOutputSizeRow } from '@/components/pdf-editor/pdf-output-size-row';
import { PrinterConnectionPill } from '@/components/printers/printer-connection-pill';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { androidRipple } from '@/constants/ui';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import {
  printItems,
  printLabelPages,
  scanLabelPdf,
  WrongPlatformError,
  type ScanResult,
} from '@/lib/ecommerce-label/job';
import { bestRotation, PLATFORMS, platformName, type PlatformId } from '@/lib/ecommerce-label/platforms';
import { copyPdfToCache, loadPdfMetadata } from '@/lib/pdf-editor/load';
import { clearPrintRasterCache, type PdfPrintOptions } from '@/lib/pdf-editor/print';
import { clearRasterCache } from '@/lib/pdf-editor/raster';
import {
  OUTPUT_SIZE_PRESETS,
  resolvePrintPageIndices,
  type OutputSize,
  type PdfPrintSelection,
} from '@/lib/pdf-editor/session';
import { formatPrintFailure } from '@/lib/printer/print-job';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type Step = 'platform' | 'setup' | 'preview' | 'print';

type PickedFile = {
  uri: string;
  name: string;
  pageCount: number;
  pageSizesPt: { w: number; h: number }[];
};

const DEFAULT_SIZE: OutputSize = (() => {
  const p = OUTPUT_SIZE_PRESETS.find((x) => x.kind === '4x6') ?? OUTPUT_SIZE_PRESETS[0];
  return { kind: p.kind, widthMm: p.widthMm, heightMm: p.heightMm };
})();

export default function EcommerceLabelScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const deviceName = usePrinterStore((s) => s.deviceName);
  const printerStatus = usePrinterStore((s) => s.status);
  const printerLive = printerStatus === 'connected' || printerStatus === 'printing';
  const printPanelRef = useRef<PdfPrintPanelHandle>(null);
  const [printIndices, setPrintIndices] = useState<number[]>([]);
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  const [step, setStep] = useState<Step>('platform');
  const [platform, setPlatform] = useState<PlatformId | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [size, setSize] = useState<OutputSize>(DEFAULT_SIZE);
  const [keepInvoice, setKeepInvoice] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const cancelled = useRef(false);
  const busy = progress !== null || printing;

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      clearRasterCache();
      clearPrintRasterCache();
    };
  }, []);

  const items = useMemo(() => (scan ? printItems(scan.pages, keepInvoice) : []), [scan, keepInvoice]);

  const stripItems = useMemo<PrintStripItem[]>(
    () =>
      file
        ? printIndices
            .filter((i) => items[i])
            .map((i) => ({
              pageIndex: items[i].pageIndex,
              rect: items[i].rect,
              rotation: bestRotation(items[i].rect, file.pageSizesPt[items[i].pageIndex] ?? file.pageSizesPt[0], size),
            }))
        : [],
    [file, items, printIndices, size],
  );

  const clearFile = useCallback(() => {
    setFile(null);
    setScan(null);
    clearRasterCache();
    clearPrintRasterCache();
  }, []);

  const goBack = () => {
    if (busy) return;
    if (step === 'print') setStep('preview');
    else if (step === 'preview') setStep('setup');
    else if (step === 'setup') {
      clearFile();
      setPlatform(null);
      setStep('platform');
    } else router.back();
  };

  const chooseFile = useCallback(async () => {
    if (!platform || busy) return;
    try {
      const picked = await pickDocumentWithSource({ preset: 'pdf' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('PDF', 'Please choose a PDF document.');
        return;
      }
      clearFile();
      setProgress('Opening…');
      const uri = await copyPdfToCache(picked.uri, picked.name);
      const meta = await loadPdfMetadata(uri);
      const result = await scanLabelPdf(
        uri,
        meta.pageCount,
        platform,
        (done, total) => setProgress(`Checking page ${done} / ${total}`),
        () => cancelled.current,
      );
      if (cancelled.current) return;
      setFile({ uri, name: picked.name, pageCount: meta.pageCount, pageSizesPt: meta.pageSizesPt });
      setScan(result);
      setPreviewIndex(0);
      setStep('preview');
    } catch (err) {
      if (err instanceof WrongPlatformError) {
        Alert.alert('Wrong PDF', `${err.message}\nChoose the ${platformName(platform)} label PDF downloaded from the seller panel.`);
      } else {
        Alert.alert('PDF', err instanceof Error ? err.message : 'Could not open this PDF.');
      }
      clearFile();
    } finally {
      setProgress(null);
    }
  }, [busy, clearFile, pickDocumentWithSource, platform]);

  const print = useCallback(
    async (selection: PdfPrintSelection, options: PdfPrintOptions) => {
      if (!file || busy) return;
      const chosen = resolvePrintPageIndices(selection, items.length, previewIndex).map((i) => items[i]);
      if (chosen.length === 0) {
        Alert.alert('Print', 'No labels match this selection.');
        return;
      }
      if (!getPrinterManager().isConnected) {
        Alert.alert('Connect your printer first', 'Your printer is not connected. Connect it, then come back to print.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect', onPress: () => router.push('/printer-connect') },
        ]);
        return;
      }
      setPrinting(true);
      setProgress('Rendering…');
      try {
        const { printed } = await printLabelPages({
          uri: file.uri,
          name: file.name,
          pageCount: file.pageCount,
          pageSizesPt: file.pageSizesPt,
          outputSize: size,
          items: chosen,
          options,
          onProgress: (done, total) => setProgress(`Label ${done} / ${total}`),
        });
        Alert.alert('Print Sent', `${printed} label${printed === 1 ? '' : 's'} sent to ${deviceName || 'the printer'}.`);
      } catch (err) {
        const message = formatPrintFailure(err);
        if (message) Alert.alert('Print Failed', message);
      } finally {
        setPrinting(false);
        setProgress(null);
      }
    },
    [busy, deviceName, file, items, previewIndex, size],
  );

  const labelCount = scan?.pages.length ?? 0;
  const current = items[Math.min(previewIndex, Math.max(0, items.length - 1))];
  const title =
    step === 'platform'
      ? 'Shipping label'
      : step === 'setup'
        ? `${platformName(platform!)} shipping label`
        : step === 'preview'
          ? 'Preview'
          : 'Print';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.headerBtn}>
          <AppIcon name="chevron.left" size={22} tintColor={C.onAccent} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <PrinterConnectionPill />
      </View>

      {step === 'platform' ? (
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>Select the platform</Text>
          <Text style={styles.sub}>Pick where the label PDF came from.</Text>
          {PLATFORMS.map((p) => (
            <View key={p.id} style={styles.cardFrame}>
              <Pressable
                onPress={() => {
                  setPlatform(p.id);
                  setStep('setup');
                }}
                android_ripple={androidRipple}
                accessibilityRole="button"
                accessibilityLabel={p.name}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                <View style={styles.cardIcon}>
                  <Ionicons name="cube-outline" size={22} color={C.accent} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{p.name}</Text>
                  <Text style={styles.cardSub}>{p.layout}</Text>
                </View>
                <AppIcon name="chevron.right" size={16} tintColor={C.textMuted} />
              </Pressable>
            </View>
          ))}
        </FormScrollView>
      ) : null}

      {step === 'setup' && platform ? (
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>Label size</Text>
          <PdfOutputSizeRow value={size} onChange={setSize} />

          <View style={styles.row}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Keep invoice</Text>
              <Text style={styles.cardSub}>Print the invoice after each label</Text>
            </View>
            <Switch
              value={keepInvoice}
              onValueChange={setKeepInvoice}
              disabled={busy}
              trackColor={{ true: C.accentFill }}
            />
          </View>

          <Text style={styles.heading}>{platformName(platform)} label PDF</Text>
          {file && scan ? (
            <>
              <View style={styles.row}>
                <AppIcon name="doc.text" size={22} tintColor={C.accent} />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Text style={styles.cardSub}>
                    {labelCount} label{labelCount === 1 ? '' : 's'} found
                  </Text>
                </View>
                <Pressable onPress={() => void chooseFile()} hitSlop={8} disabled={busy}>
                  <Text style={styles.link}>Change</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setStep('preview')} style={styles.printBtn}>
                <Text style={styles.printText}>Preview</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => void chooseFile()}
              disabled={busy}
              android_ripple={androidRipple}
              style={({ pressed }) => [styles.upload, pressed && styles.pressed]}>
              {progress ? (
                <ActivityIndicator color={C.accent} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={26} color={C.accent} />
              )}
              <Text style={styles.cardTitle}>{progress ?? 'Choose PDF'}</Text>
            </Pressable>
          )}
        </FormScrollView>
      ) : null}

      {step === 'preview' && file && scan && current ? (
        <View style={styles.previewColumn}>
          <LabelPreview
            uri={file.uri}
            pageIndex={current.pageIndex}
            rect={current.rect}
            pageSizePt={file.pageSizesPt[current.pageIndex] ?? file.pageSizesPt[0]}
            size={size}
          />
          <View style={styles.previewBar}>
            <Pressable
              onPress={() => setPreviewIndex((i) => Math.max(0, i - 1))}
              disabled={previewIndex <= 0}
              hitSlop={8}
              style={[styles.navBtn, previewIndex <= 0 && styles.navOff]}>
              <AppIcon name="chevron.left" size={20} tintColor={C.accent} />
            </Pressable>
            <Text style={styles.navText}>
              {Math.min(previewIndex, items.length - 1) + 1} / {items.length}
            </Text>
            <Pressable
              onPress={() => setPreviewIndex((i) => Math.min(items.length - 1, i + 1))}
              disabled={previewIndex >= items.length - 1}
              hitSlop={8}
              style={[styles.navBtn, previewIndex >= items.length - 1 && styles.navOff]}>
              <AppIcon name="chevron.right" size={20} tintColor={C.accent} />
            </Pressable>
          </View>
          {scan.skipped.length > 0 ? (
            <Text style={styles.skipNote}>
              {scan.skipped.length} page{scan.skipped.length === 1 ? '' : 's'} skipped: not a{' '}
              {platformName(platform!)} label.
            </Text>
          ) : null}
          <BottomBar insetBottom={insets.bottom} onBack={goBack} nextLabel="Next" onNext={() => setStep('print')} />
        </View>
      ) : null}

      {step === 'print' && file && scan ? (
        <>
          <FormScrollView contentContainerStyle={styles.printContent} showsVerticalScrollIndicator={false}>
            <PrintPagesStrip uri={file.uri} items={stripItems} labelAspect={size.widthMm / size.heightMm} />
            <View style={styles.printPanel}>
            <PdfPrintPanel
              ref={printPanelRef}
              onSelectedPagesChange={setPrintIndices}
              pageCount={items.length}
              currentPage={Math.min(previewIndex, items.length - 1) + 1}
              printing={printing}
              progress={progress}
              outputLabel={`${size.widthMm} × ${size.heightMm} mm`}
              onPrint={(selection, options) => {
                void print(selection, options);
              }}
            />
            </View>
          </FormScrollView>
          <BottomBar
            insetBottom={insets.bottom}
            onBack={goBack}
            backDisabled={printing}
            nextLabel={printerLive ? 'Print' : 'Connect printer'}
            nextBusy={printing}
            nextDanger={!printerLive}
            onNext={() => {
              if (!printerLive) {
                router.push('/printer-connect');
                return;
              }
              printPanelRef.current?.submit();
            }}
          />
        </>
      ) : null}
      {documentSourceSheet}
    </View>
  );
}

function BottomBar({
  insetBottom,
  onBack,
  backDisabled,
  nextLabel,
  nextBusy,
  nextDanger,
  onNext,
}: {
  insetBottom: number;
  onBack: () => void;
  backDisabled?: boolean;
  nextLabel: string;
  nextBusy?: boolean;
  nextDanger?: boolean;
  onNext: () => void;
}) {
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insetBottom, 8) + 8 }]}>
      <Pressable
        onPress={onBack}
        disabled={backDisabled}
        style={({ pressed }) => [styles.backBtn, backDisabled && styles.btnOff, pressed && styles.pressed]}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Pressable
        onPress={onNext}
        disabled={nextBusy}
        style={({ pressed }) => [
          styles.nextBtn,
          nextDanger && styles.nextDanger,
          nextBusy && styles.btnOff,
          pressed && styles.pressed,
        ]}>
        {nextBusy ? <ActivityIndicator color={C.onAccent} size="small" /> : <Text style={styles.nextText}>{nextLabel}</Text>}
      </Pressable>
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
  headerTitle: { flex: 1, color: c.onAccent, fontSize: 17, fontWeight: '600' },
  content: { padding: 16, gap: 12 },
  printContent: { paddingVertical: 16, gap: 16 },
  printPanel: { paddingHorizontal: 16 },
  heading: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 4 },
  sub: { fontSize: 13, color: c.textMuted, marginTop: -6 },
  cardFrame: {
    borderRadius: 14,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  cardSub: { fontSize: 12, color: c.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  link: { fontSize: 14, fontWeight: '700', color: c.accent },
  upload: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: c.accentFill,
    marginTop: 4,
  },
  printText: { fontSize: 16, fontWeight: '700', color: c.onAccent },
  previewColumn: { flex: 1 },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 12,
    paddingBottom: 12 + 8,
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentSoft,
  },
  navOff: { opacity: 0.35 },
  navText: { fontSize: 15, fontWeight: '700', color: c.text, minWidth: 56, textAlign: 'center' },
  skipNote: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingBottom: 12, backgroundColor: c.surface },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: c.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  backBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
  backText: { color: c.accent, fontSize: 16, fontWeight: '600' },
  nextBtn: {
    flex: 1.4,
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentFill,
  },
  nextDanger: { backgroundColor: c.dangerFill },
  nextText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
  btnOff: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
}));
