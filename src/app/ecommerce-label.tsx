import { goBack } from '@/lib/go-back';
import { useStepBack } from '@/lib/use-step-back';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { StatusChip } from '@/components/home/status-chip';
import { PlatformHero, PlatformSteps } from '@/components/ecommerce-label/platform-hero';
import { ProcessingCard } from '@/components/ecommerce-label/processing-card';
import { PlatformTile } from '@/components/ecommerce-label/platform-tile';
import { LabelPreview } from '@/components/ecommerce-label/label-preview';
import { SamplePdfModal } from '@/components/ecommerce-label/sample-pdf-modal';
import { PdfPrintPanel, type PdfPrintPanelHandle } from '@/components/pdf-editor/pdf-print-sheet';
import { PrintPageViewer } from '@/components/ecommerce-label/print-page-viewer';
import type { PrintStripItem } from '@/components/pdf-editor/print-pages-strip';
import { PdfOutputSizeRow } from '@/components/pdf-editor/pdf-output-size-row';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { Spacing } from '@/constants/theme';
import { Type } from '@/constants/ui';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import {
  printItems,
  printLabelPages,
  scanLabelPdf,
  WrongPlatformError,
  type ScannedPage,
  type ScanResult,
} from '@/lib/ecommerce-label/job';
import { PLATFORMS, SHIPPING_SIZE_PRESETS, parsePlatformId, platformName, type PlatformId } from '@/lib/ecommerce-label/platforms';
import { openPdfUri } from '@/lib/pdf-editor/load';
import { SMART_CROP_DPI } from '@/lib/pdf-editor/smart-crop/source';
import { clearPrintRasterCache, type PdfPrintOptions } from '@/lib/pdf-editor/print';
import { clearRasterCache, rasterPdfPageCached } from '@/lib/pdf-editor/raster';
import {
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

// 4 × 6 in is 100 × 150 mm here, exactly.
const DEFAULT_SIZE: OutputSize = {
  kind: 'custom',
  widthMm: SHIPPING_SIZE_PRESETS[0].width,
  heightMm: SHIPPING_SIZE_PRESETS[0].height,
};

export default function EcommerceLabelScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ platform?: string | string[]; docUri?: string; docName?: string }>();
  const linkedPlatform = parsePlatformId(Array.isArray(params.platform) ? params.platform[0] : params.platform);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const printPanelRef = useRef<PdfPrintPanelHandle>(null);
  const [printIndices, setPrintIndices] = useState<number[]>([]);
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  const [step, setStep] = useState<Step>(linkedPlatform ? 'setup' : 'platform');
  const [platform, setPlatform] = useState<PlatformId | null>(linkedPlatform);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [size, setSize] = useState<OutputSize>(DEFAULT_SIZE);
  const [keepInvoice, setKeepInvoice] = useState(false);
  // A PDF sent from another app: used for the first choose, then "Change" asks for a file as usual.
  const [received, setReceived] = useState<{ uri: string; name: string } | null>(
    params.docUri ? { uri: params.docUri, name: params.docName || 'label.pdf' } : null,
  );
  const autoOpened = useRef(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // Pages checked so far while the first labels are not on screen yet.
  const [checkCount, setCheckCount] = useState<{ done: number; total: number } | null>(null);
  const [printing, setPrinting] = useState(false);
  const cancelled = useRef(false);
  // Each file open gets a number; a scan whose number is old (Back, Change, a newer file) stops.
  const runId = useRef(0);
  // The rest of the file is still being checked while the first labels are already on screen.
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null || printing;

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      clearRasterCache();
      clearPrintRasterCache();
    };
  }, []);

  // Home-screen widgets (and other deep links) can open a platform directly.
  useEffect(() => {
    if (!linkedPlatform) return;
    setPlatform(linkedPlatform);
    setStep((current) => (current === 'platform' ? 'setup' : current));
  }, [linkedPlatform]);

  const items = useMemo(() => (scan ? printItems(scan.pages, keepInvoice) : []), [scan, keepInvoice]);

  const stripItems = useMemo<PrintStripItem[]>(
    () =>
      file
        ? printIndices
            .filter((i) => items[i])
            .map((i) => ({
              pageIndex: items[i].pageIndex,
              rect: items[i].rect,
              rotation: 0,
            }))
        : [],
    [file, items, printIndices],
  );

  const clearFile = useCallback(() => {
    runId.current += 1;
    setScanning(null);
    setFile(null);
    setScan(null);
    clearRasterCache();
    clearPrintRasterCache();
  }, []);

  const handleBack = () => {
    if (busy) return;
    if (step === 'print') setStep('preview');
    else if (step === 'preview') {
      // Leaving while the rest of the file is still being checked stops the check: its list is incomplete.
      if (scanning) clearFile();
      setStep('setup');
    }
    else if (step === 'setup') {
      clearFile();
      setPlatform(null);
      setStep('platform');
    } else goBack();
  };

  useStepBack(step !== 'platform' || busy, handleBack);

  const chooseFile = useCallback(async () => {
    if (!platform || busy) return;
    try {
      const picked = received
        ? { ok: true as const, uri: received.uri, name: received.name }
        : await pickDocumentWithSource({ preset: 'pdf' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('PDF', 'Please choose a PDF document.');
        return;
      }
      clearFile();
      const run = runId.current;
      const stale = () => cancelled.current || runId.current !== run;
      setProgress('Opening…');
      // Read the file where the picker left it: no copy before the first label appears.
      const uri = await openPdfUri(picked.uri, picked.name);
      // Page 1 at the analysis resolution gives the page count and size, and is reused by the scan.
      const first = await rasterPdfPageCached(uri, 0, SMART_CROP_DPI);
      const pageCount = Math.max(1, first.pageCount);
      const firstSize = { w: first.widthPt, h: first.heightPt };
      const pageSizesPt = Array.from({ length: pageCount }, () => firstSize);
      let opened = false;
      const openPreview = (pages: ScannedPage[]) => {
        if (stale()) return;
        setScan({ pages, skipped: [] });
        if (opened) return;
        // The first label is ready: show it now and keep checking the other pages behind it.
        opened = true;
        setFile({ uri, name: picked.name, pageCount, pageSizesPt });
        setReceived(null);
        setPreviewIndex(0);
        setStep('preview');
        setProgress(null);
      };
      const result = await scanLabelPdf(
        uri,
        pageCount,
        platform,
        (done, total) => {
          if (stale()) return;
          if (opened) setScanning({ done, total });
          else {
            setProgress(`Checking page ${done} / ${total}`);
            setCheckCount({ done, total });
          }
        },
        stale,
        pageCount > 1 ? openPreview : undefined,
      );
      if (stale()) return;
      setFile({ uri, name: picked.name, pageCount, pageSizesPt });
      setReceived(null);
      setScan(result);
      if (!opened) {
        setPreviewIndex(0);
        setStep('preview');
      }
      setScanning(null);
    } catch (err) {
      if (err instanceof WrongPlatformError) {
        Alert.alert('Wrong PDF', `${err.message}\nUpload the ${platformName(platform)} label PDF exactly as downloaded from your seller panel. A PDF saved again with Ctrl+P, the Print dialog or Save as PDF, a screenshot or a photo may not work.`);
      } else {
        Alert.alert('PDF', err instanceof Error ? err.message : 'Could not open this PDF.');
      }
      clearFile();
      setStep((s) => (s === 'preview' ? 'setup' : s));
    } finally {
      setProgress(null);
      setCheckCount(null);
    }
  }, [busy, clearFile, pickDocumentWithSource, platform, received]);

  // The received PDF is checked as soon as the platform is known; a failed check leaves it for another try.
  useEffect(() => {
    if (step !== 'setup' || !platform || !received || file || busy || autoOpened.current) return;
    autoOpened.current = true;
    void chooseFile();
  }, [step, platform, received, file, busy, chooseFile]);

  const print = useCallback(
    async (selection: PdfPrintSelection, options: PdfPrintOptions) => {
      if (!file || busy) return;
      const chosen = resolvePrintPageIndices(selection, items.length, previewIndex).map((i) => items[i]);
      if (chosen.length === 0) {
        Alert.alert('Print', 'No labels match this selection.');
        return;
      }
      if (!getPrinterManager().isConnected) {
        askToConnectPrinter();
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
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6, minHeight: 48 + insets.top }]}>
        <Pressable onPress={handleBack} hitSlop={8} style={styles.headerBtn}>
          <AppIcon name="chevron.left" size={22} tintColor={C.onAccent} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <StatusChip poll={false} keepLive={printing} />
      </View>

      {step === 'platform' ? (
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PlatformHero />
          <PlatformSteps />

          <Text style={styles.sectionLabel}>Choose your platform</Text>
          <View style={styles.tiles}>
            {PLATFORMS.map((p) => (
              <PlatformTile
                key={p.id}
                id={p.id}
                name={p.name}
                onPress={() => {
                  setPlatform(p.id);
                  setStep('setup');
                }}
              />
            ))}
          </View>

          <View style={styles.note}>
            <Ionicons name="information-circle" size={18} color={C.warning} />
            <Text style={styles.noteBody}>
              <Text style={styles.noteTitle}>Use the PDF exactly as downloaded. </Text>
              Re-saved PDFs (Ctrl+P, Print, Save as PDF), screenshots and photos may not work.
            </Text>
          </View>
        </FormScrollView>
      ) : null}

      {step === 'setup' && platform ? (
        <>
        <FormScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>Label size</Text>
          <PdfOutputSizeRow value={size} onChange={setSize} presets={SHIPPING_SIZE_PRESETS} unitSwitch />

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

          {file && scan ? (
            <>
              <Text style={styles.heading}>{platformName(platform)} label PDF</Text>
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
            </>
          ) : (
            <>
              <Text style={styles.cardSub}>
                Set the size and options, then tap Continue to choose your {platformName(platform)} label PDF.
              </Text>
              {progress || received ? (
                <ProcessingCard
                  title={checkCount ? 'Checking your labels' : 'Opening your PDF'}
                  progress={checkCount}
                />
              ) : null}
            </>
          )}
          <Pressable
            onPress={() => setSampleOpen(true)}
            hitSlop={8}
            style={styles.sampleBtn}
            accessibilityRole="button">
            <AppIcon name="doc.text" size={18} tintColor={C.accent} />
            <Text style={styles.link}>See a sample {platformName(platform)} PDF</Text>
          </Pressable>
        </FormScrollView>
        <BottomBar
          insetBottom={insets.bottom}
          onBack={handleBack}
          backDisabled={busy}
          nextLabel={file && scan ? 'Preview' : 'Continue'}
          nextBusy={busy}
          onNext={() => (file && scan ? setStep('preview') : void chooseFile())}
        />
        </>
      ) : null}

      {step === 'preview' && file && scan && current ? (
        <View style={styles.previewColumn}>
          <LabelPreview
            uri={file.uri}
            pageIndex={current.pageIndex}
            rect={current.rect}
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
          {scanning ? (
            <View style={styles.scanStrip}>
              <View style={styles.scanRow}>
                <ActivityIndicator size="small" color={C.accent} />
                <Text style={styles.scanText} numberOfLines={1}>
                  Checking pages {scanning.done} / {scanning.total} · {labelCount} label{labelCount === 1 ? '' : 's'} so far
                </Text>
              </View>
              <View style={styles.scanTrack}>
                <View style={[styles.scanFill, { width: `${Math.min(100, (scanning.done / Math.max(1, scanning.total)) * 100)}%` }]} />
              </View>
            </View>
          ) : null}
          {scan.skipped.length > 0 ? (
            <Text style={styles.skipNote}>
              {scan.skipped.length} page{scan.skipped.length === 1 ? '' : 's'} skipped: not a{' '}
              {platformName(platform!)} label.
            </Text>
          ) : null}
          <BottomBar
            insetBottom={insets.bottom}
            onBack={handleBack}
            nextLabel="Next"
            nextBusy={scanning !== null}
            onNext={() => setStep('print')}
          />
        </View>
      ) : null}

      {step === 'print' && file && scan ? (
        <>
          <FormScrollView style={styles.flex} contentContainerStyle={styles.printContent} showsVerticalScrollIndicator={false}>
            <PrintPageViewer uri={file.uri} items={stripItems} size={size} />
            <View style={styles.printPanel}>
              <PdfPrintPanel
                ref={printPanelRef}
                shipping
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
          <View style={[styles.printFooter, { paddingBottom: insets.bottom + Spacing.two }]}>
            <Pressable
              disabled={printing}
              hitSlop={6}
              onPress={() => {
                if (!getPrinterManager().isConnected) {
                  askToConnectPrinter();
                  return;
                }
                printPanelRef.current?.submit();
              }}
              style={({ pressed }) => [styles.printPill, (pressed || printing) && styles.pressed]}>
              {printing ? (
                <ActivityIndicator size="small" color={C.onAccent} />
              ) : (
                <Text style={styles.printPillText}>Print</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : null}
      {platform ? (
        <SamplePdfModal platform={platform} visible={sampleOpen} onClose={() => setSampleOpen(false)} />
      ) : null}
      {documentSourceSheet}
    </View>
  );
}

/** Same prompt as the normal Print screen when no printer is connected. */
function askToConnectPrinter() {
  Alert.alert(
    'Connect a printer first',
    'No printer is connected. Connect your printer first. You can print only after it is connected.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Connect printer', onPress: () => router.push('/printer-connect') },
    ],
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
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insetBottom, 4) + 2 }]}>
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
  flex: { flex: 1 },
  header: {
    paddingBottom: 6,
    backgroundColor: c.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBtn: { width: 44, paddingHorizontal: 6, paddingVertical: 8 },
  headerTitle: { flex: 1, minWidth: 0, paddingRight: 8, color: c.onAccent, fontSize: 17, fontWeight: '600' },
  content: { padding: 16, gap: 10 },
  printContent: { paddingBottom: 16, gap: 12 },
  printPanel: { paddingHorizontal: 16 },
  printFooter: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: c.fill,
  },
  printPill: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printPillText: { color: c.onAccent, ...Type.button },
  heading: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: c.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: c.warningSoft,
  },
  noteTitle: { fontWeight: '700', color: c.onWarningSoft },
  noteBody: { flex: 1, fontSize: 12.5, lineHeight: 18, color: c.onWarningSoft },
  tiles: { gap: 10 },
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
  link: { fontSize: 14, fontWeight: '700', color: c.accent, flexShrink: 1 },
  sampleBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  previewColumn: { flex: 1 },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 4,
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentSoft,
  },
  navOff: { opacity: 0.35 },
  navText: { fontSize: 15, fontWeight: '700', color: c.text, minWidth: 56, textAlign: 'center', flexShrink: 1 },
  scanStrip: { gap: 6, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: c.surface },
  scanRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  scanTrack: { height: 4, borderRadius: 2, backgroundColor: c.fill, overflow: 'hidden' },
  scanFill: { height: '100%', borderRadius: 2, backgroundColor: c.accentFill },
  scanText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },
  skipNote: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingBottom: 12, backgroundColor: c.surface },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: c.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  backBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
  backText: { color: c.accent, fontSize: 14, fontWeight: '600' },
  nextBtn: {
    flex: 1.4,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentFill,
  },
  nextDanger: { backgroundColor: c.dangerFill },
  nextText: { color: c.onAccent, fontSize: 14, fontWeight: '600' },
  btnOff: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
}));
