import { goBack } from '@/lib/go-back';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { PlatformTile } from '@/components/ecommerce-label/platform-tile';
import { LabelPreview } from '@/components/ecommerce-label/label-preview';
import { SamplePdfModal } from '@/components/ecommerce-label/sample-pdf-modal';
import { PdfPrintPanel, type PdfPrintPanelHandle } from '@/components/pdf-editor/pdf-print-sheet';
import { PrintPagesStrip, type PrintStripItem } from '@/components/pdf-editor/print-pages-strip';
import { PdfOutputSizeRow } from '@/components/pdf-editor/pdf-output-size-row';
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
import { PLATFORMS, SHIPPING_SIZE_PRESETS, parsePlatformId, platformName, type PlatformId } from '@/lib/ecommerce-label/platforms';
import { copyPdfToCache, loadPdfMetadata } from '@/lib/pdf-editor/load';
import { clearPrintRasterCache, type PdfPrintOptions } from '@/lib/pdf-editor/print';
import { clearRasterCache } from '@/lib/pdf-editor/raster';
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
  const printerStatus = usePrinterStore((s) => s.status);
  const printerLive = printerStatus === 'connected' || printerStatus === 'printing';
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
    setFile(null);
    setScan(null);
    clearRasterCache();
    clearPrintRasterCache();
  }, []);

  const handleBack = () => {
    if (busy) return;
    if (step === 'print') setStep('preview');
    else if (step === 'preview') setStep('setup');
    else if (step === 'setup') {
      clearFile();
      setPlatform(null);
      setStep('platform');
    } else goBack();
  };

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
      setReceived(null);
      setScan(result);
      setPreviewIndex(0);
      setStep('preview');
    } catch (err) {
      if (err instanceof WrongPlatformError) {
        Alert.alert('Wrong PDF', `${err.message}\nUpload the ${platformName(platform)} label PDF exactly as downloaded from your seller panel. A PDF saved again with Ctrl+P, the Print dialog or Save as PDF, a screenshot or a photo may not work.`);
      } else {
        Alert.alert('PDF', err instanceof Error ? err.message : 'Could not open this PDF.');
      }
      clearFile();
    } finally {
      setProgress(null);
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
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top, height: 48 + insets.top }]}>
        <Pressable onPress={handleBack} hitSlop={8} style={styles.headerBtn}>
          <AppIcon name="chevron.left" size={22} tintColor={C.onAccent} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {step === 'platform' ? (
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroBadge}>
                <Ionicons name="print-outline" size={24} color={C.onAccent} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.heroTitle}>Print marketplace labels</Text>
                <Text style={styles.heroSub}>
                  Crop the shipping label from your PDF and print it on your label roll.
                </Text>
              </View>
            </View>
            <View style={styles.flow}>
              {['Choose platform', 'Upload PDF', 'Preview & print'].map((label, i) => (
                <View key={label} style={styles.flowItem}>
                  <View style={styles.flowDot}>
                    <Text style={styles.flowNum}>{i + 1}</Text>
                  </View>
                  <Text style={styles.flowText} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.heading}>Choose your platform</Text>
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
            <View style={styles.noteBar} />
            <View style={styles.cardText}>
              <Text style={styles.noteTitle}>Upload the PDF you downloaded</Text>
              <Text style={styles.noteBody}>
                Use the label PDF exactly as downloaded from your seller panel. A PDF saved again with
                Ctrl+P, the browser Print dialog, System Print or Save as PDF, a screenshot or a photo
                may not work.
              </Text>
            </View>
          </View>
        </FormScrollView>
      ) : null}

      {step === 'setup' && platform ? (
        <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

          <Text style={styles.heading}>{platformName(platform)} label PDF</Text>
          <Pressable
            onPress={() => setSampleOpen(true)}
            hitSlop={8}
            style={styles.sampleBtn}
            accessibilityRole="button">
            <AppIcon name="doc.text" size={18} tintColor={C.accent} />
            <Text style={styles.link}>See a sample {platformName(platform)} PDF</Text>
          </Pressable>
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
              <Text style={styles.cardTitle}>{progress ?? (received ? received.name : 'Choose PDF')}</Text>
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
          <BottomBar insetBottom={insets.bottom} onBack={handleBack} nextLabel="Next" onNext={() => setStep('print')} />
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
            onBack={handleBack}
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
      {platform ? (
        <SamplePdfModal platform={platform} visible={sampleOpen} onClose={() => setSampleOpen(false)} />
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
  hero: {
    backgroundColor: c.surface,
    padding: 16,
    gap: 14,
    borderRadius: 20,
    ...cardElevation(c, scheme),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: c.text },
  heroSub: { fontSize: 13, lineHeight: 18, color: c.textMuted },
  flow: { flexDirection: 'row', gap: 8 },
  flowItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: c.accentSoft,
  },
  flowDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowNum: { fontSize: 11, fontWeight: '800', color: c.onAccent },
  flowText: { flex: 1, fontSize: 11, fontWeight: '600', color: c.accentInk },
  note: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: c.warningSoft,
    overflow: 'hidden',
  },
  noteBar: { width: 4, borderRadius: 2, backgroundColor: c.warning },
  noteTitle: { fontSize: 14, fontWeight: '700', color: c.text },
  noteBody: { fontSize: 13, lineHeight: 19, color: c.textSecondary },
  tiles: { gap: 12 },
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
