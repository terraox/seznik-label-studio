/**
 * Fit Image — pick a photo or PDF page, choose stock size (same as New Label
 * Setup), then open the existing `/edit` canvas. Crop and proportional fit
 * happen on that canvas; print uses the normal `/print` path.
 */

import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
import { LabelSizeSetupSection } from '@/components/label-size-setup-section';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { applyFitLabelToEditor } from '@/lib/img-to-label-apply';
import { loadPdfLabelSource, rasterPdfLabelPage } from '@/lib/img-to-label-content';
import {
  clampLabelMm,
  validateLabelSize,
  type LabelUnit,
} from '@/lib/label-geometry';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { useSettingsStore } from '@/stores/settings-store';

type Step = 'import' | 'size';

export default function ImgToLabelScreen() {
  const insets = useSafeAreaInsets();
  const defaults = useSettingsStore((s) => s.defaults);
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  const [step, setStep] = useState<Step>('import');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imagePixels, setImagePixels] = useState<{ width: number; height: number } | null>(null);
  const [sourceKind, setSourceKind] = useState<'image' | 'pdf'>('image');
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [pdfPageIndex, setPdfPageIndex] = useState(0);
  const [widthMm, setWidthMm] = useState(defaults.labelWidth || 50);
  const [heightMm, setHeightMm] = useState(defaults.labelHeight || 30);
  const [labelUnit, setLabelUnit] = useState<LabelUnit>('mm');
  const [pageLoading, setPageLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);

  const pickImage = useCallback(async () => {
    try {
      const asset = await pickImageAsset();
      if (!asset) return;
      setSourceKind('image');
      setPdfUri(null);
      setPdfPageCount(1);
      setPdfPageIndex(0);
      setImageUri(asset.uri);
      setImagePixels({ width: asset.width, height: asset.height });
      setStep('size');
    } catch {
      Alert.alert('Error', 'Unable to load this image.\nPlease try another image.');
    }
  }, [pickImageAsset]);

  const pickPdf = useCallback(async () => {
    try {
      const picked = await pickDocumentWithSource({ preset: 'pdf' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('PDF', 'Please choose a PDF document.');
        return;
      }
      const loaded = await loadPdfLabelSource(picked.uri, getPrinterManager().getPrintDpi());
      setSourceKind('pdf');
      setPdfUri(picked.uri);
      setPdfPageCount(loaded.pageCount);
      setPdfPageIndex(0);
      setImageUri(loaded.firstPage.uri);
      setImagePixels({ width: loaded.firstPage.width, height: loaded.firstPage.height });
      setStep('size');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this PDF.';
      Alert.alert('PDF', message);
    }
  }, [pickDocumentWithSource]);

  const openPdfPage = useCallback(
    async (index: number) => {
      if (!pdfUri) return;
      const next = Math.min(pdfPageCount - 1, Math.max(0, index));
      try {
        setPageLoading(true);
        const page = await rasterPdfLabelPage(pdfUri, next, getPrinterManager().getPrintDpi());
        setPdfPageIndex(next);
        setImageUri(page.uri);
        setImagePixels({ width: page.width, height: page.height });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open that PDF page.';
        Alert.alert('PDF', message);
      } finally {
        setPageLoading(false);
      }
    },
    [pdfPageCount, pdfUri],
  );

  const openOnCanvas = useCallback(async () => {
    if (openingRef.current) return;
    if (!imageUri || !imagePixels) {
      Alert.alert('No Image', 'Please import an image first.');
      return;
    }
    const size = clampLabelMm(widthMm, heightMm);
    const sizeError = validateLabelSize(size.widthMm, size.heightMm);
    if (sizeError) {
      Alert.alert('Invalid size', sizeError);
      return;
    }

    openingRef.current = true;
    setOpening(true);
    try {
      const doc = await applyFitLabelToEditor({
        sourceKind,
        imageUri,
        imageWidth: imagePixels.width,
        imageHeight: imagePixels.height,
        pdfUri,
        pdfPageIndex,
        crop: null,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        fitMode: 'contain',
        outputDpi: getPrinterManager().getPrintDpi(),
        paperType: defaults.paperType,
      });
      const imageId = doc.elements.find((el) => el.type === 'image')?.id;
      router.replace({
        pathname: '/edit',
        params: {
          labelId: doc.id,
          ...(imageId ? { selectedElementId: imageId, autoOpenPanel: 'true' } : {}),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to open this image on the canvas.';
      Alert.alert('Fit Image', message);
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }, [
    defaults.paperType,
    heightMm,
    imagePixels,
    imageUri,
    pdfPageIndex,
    pdfUri,
    sourceKind,
    widthMm,
  ]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => (step === 'size' ? setStep('import') : router.back())}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{step === 'import' ? 'Fit Image' : 'Label Sizing Setup'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>
        {step === 'import' ? (
          <View style={styles.importCard}>
            <Text style={styles.importTitle}>Import Image or PDF</Text>
            <Text style={styles.importHint}>
              Choose stock size next, then crop and fit on the editor canvas.
            </Text>
            <Pressable
              onPress={() => void pickImage()}
              style={({ pressed }) => [styles.importArea, pressed && styles.pressed]}>
              <AppIcon name="photo.on.rectangle" tintColor={Palette.accent} size={36} />
              <Text style={styles.importText}>Select image</Text>
              <Text style={styles.importSub}>PNG, JPG, JPEG</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickPdf()}
              style={({ pressed }) => [styles.importArea, styles.importAreaSecond, pressed && styles.pressed]}>
              <AppIcon name="doc.text" tintColor={Palette.accent} size={32} />
              <Text style={styles.importText}>Select PDF</Text>
              <Text style={styles.importSub}>One page becomes one label on the canvas</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {imageUri ? (
              <View style={styles.thumbCard}>
                <Image source={{ uri: imageUri }} style={styles.thumb} contentFit="contain" />
                {imagePixels ? (
                  <Text style={styles.thumbMeta}>
                    {imagePixels.width} × {imagePixels.height} px
                  </Text>
                ) : null}
                {sourceKind === 'pdf' && pdfPageCount > 1 ? (
                  <View style={styles.pdfNavRow}>
                    <Pressable
                      onPress={() => void openPdfPage(pdfPageIndex - 1)}
                      disabled={pdfPageIndex <= 0 || pageLoading}
                      style={({ pressed }) => [styles.pdfNavBtn, pressed && styles.pressed]}>
                      <Text style={styles.pdfNavText}>Prev</Text>
                    </Pressable>
                    <Text style={styles.pdfNavLabel}>
                      Page {pdfPageIndex + 1} / {pdfPageCount}
                    </Text>
                    <Pressable
                      onPress={() => void openPdfPage(pdfPageIndex + 1)}
                      disabled={pdfPageIndex >= pdfPageCount - 1 || pageLoading}
                      style={({ pressed }) => [styles.pdfNavBtn, pressed && styles.pressed]}>
                      <Text style={styles.pdfNavText}>Next</Text>
                    </Pressable>
                  </View>
                ) : null}
                {pageLoading ? (
                  <ActivityIndicator color={Palette.accent} style={styles.pageSpinner} />
                ) : null}
                <View style={styles.changeRow}>
                  <Pressable
                    onPress={() => void (sourceKind === 'pdf' ? pickPdf() : pickImage())}
                    style={({ pressed }) => [styles.changeBtn, pressed && styles.pressed]}>
                    <Text style={styles.changeBtnText}>
                      {sourceKind === 'pdf' ? 'Change PDF' : 'Change Image'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <LabelSizeSetupSection
              widthMm={widthMm}
              heightMm={heightMm}
              unit={labelUnit}
              onWidthChange={setWidthMm}
              onHeightChange={setHeightMm}
              onUnitChange={setLabelUnit}
            />
          </>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        {step === 'import' ? (
          <Pressable
            onPress={() => void pickImage()}
            style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
            <Text style={styles.newButtonText}>Select Image</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void openOnCanvas()}
            disabled={opening || !imageUri || !imagePixels || pageLoading}
            style={({ pressed }) => [
              styles.newButton,
              (opening || !imageUri || !imagePixels || pageLoading) && styles.newButtonDisabled,
              pressed && !opening && styles.pressed,
            ]}>
            {opening ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.newButtonText}>Open in Editor</Text>
            )}
          </Pressable>
        )}
      </View>

      {imageSourceSheet}
      {documentSourceSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backChevron: { color: '#FFFFFF', fontSize: 32, fontWeight: '300', lineHeight: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
  },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, gap: 12 },
  importCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  importTitle: { fontSize: 16, fontWeight: '600', color: Palette.ink },
  importHint: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  importArea: {
    minHeight: 120,
    borderRadius: 12,
    backgroundColor: '#F4F6F9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  importAreaSecond: { minHeight: 108 },
  importText: { fontSize: 15, fontWeight: '500', color: Palette.ink },
  importSub: { fontSize: 12, color: '#94A3B8' },
  thumbCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  thumb: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#F4F6F9',
  },
  thumbMeta: { fontSize: 12, color: '#64748B', textAlign: 'center' },
  pdfNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pdfNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  pdfNavText: { fontSize: 13, fontWeight: '600', color: Palette.ink },
  pdfNavLabel: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  pageSpinner: { marginTop: 4 },
  changeRow: { alignItems: 'center' },
  changeBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  changeBtnText: { fontSize: 13, fontWeight: '600', color: Palette.accent },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: Palette.screen,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  newButton: {
    backgroundColor: Palette.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonDisabled: { opacity: 0.5 },
  newButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
