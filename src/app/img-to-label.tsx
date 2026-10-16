/**
 * Fit Image — pick a photo or PDF page, choose stock size (same as New Label
 * Setup), extract the label region from the original file, then open the
 * existing `/edit` canvas. Image-only print uses that extract, not a ViewShot.
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
import { ImageCropScreen } from '@/components/editor/image-crop-screen';
import { LabelSizeSetupSection } from '@/components/label-size-setup-section';
import { Spacing } from '@/constants/theme';

import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { FULL_CROP, type NormalizedCrop } from '@/lib/editor/image-crop-math';
import { applyFitLabelToEditor, detectFitLabelCropFromUri } from '@/lib/img-to-label-apply';
import { loadPdfLabelSource, rasterPdfLabelPage } from '@/lib/img-to-label-content';
import { fitLabelRasterDpi } from '@/lib/img-to-label-document';
import { FitLabelExtractError } from '@/lib/img-to-label-extract';
import {
  clampLabelMm,
  validateLabelSize,
  type LabelUnit,
} from '@/lib/label-geometry';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { useSettingsStore } from '@/stores/settings-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type Step = 'import' | 'size';

export default function ImgToLabelScreen() {
  useThemeRefresh();
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
  const [crop, setCrop] = useState<NormalizedCrop | null>(null);
  const [cropCertain, setCropCertain] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const openingRef = useRef(false);

  const detectCrop = useCallback(async (uri: string) => {
    const detected = await detectFitLabelCropFromUri(uri);
    setCrop(detected.crop);
    setCropCertain(detected.certain);
    if (detected.width && detected.height) {
      setImagePixels({ width: detected.width, height: detected.height });
    }
  }, []);

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
      setCrop(null);
      setCropCertain(false);
      setShowCrop(false);
      setStep('size');
      void detectCrop(asset.uri);
    } catch {
      Alert.alert('Error', 'Unable to load this image.\nPlease try another image.');
    }
  }, [detectCrop, pickImageAsset]);

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
      setCrop(null);
      setCropCertain(false);
      setShowCrop(false);
      setStep('size');
      void detectCrop(loaded.firstPage.uri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this PDF.';
      Alert.alert('PDF', message);
    }
  }, [detectCrop, pickDocumentWithSource]);

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
        setCrop(null);
        setCropCertain(false);
        void detectCrop(page.uri);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open that PDF page.';
        Alert.alert('PDF', message);
      } finally {
        setPageLoading(false);
      }
    },
    [detectCrop, pdfPageCount, pdfUri],
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

    if (!cropCertain) {
      setShowCrop(true);
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
        crop: crop ?? FULL_CROP,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        fitMode: 'contain',
        outputDpi: fitLabelRasterDpi(getPrinterManager().getPrintDpi()),
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
      if (error instanceof FitLabelExtractError || (error instanceof Error && error.name === 'FitLabelExtractError')) {
        setCropCertain(false);
        setShowCrop(true);
        Alert.alert('Check the crop', 'The extracted region did not match the original. Adjust the crop frame, then open in the editor.');
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Unable to open this image on the canvas.';
      Alert.alert('Fit Image', message);
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }, [
    crop,
    cropCertain,
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
              Choose stock size next. The original file stays unchanged; only the detected label region is placed on the canvas.
            </Text>
            <Pressable
              onPress={() => void pickImage()}
              style={({ pressed }) => [styles.importArea, pressed && styles.pressed]}>
              <AppIcon name="photo.on.rectangle" tintColor={C.accent} size={36} />
              <Text style={styles.importText}>Select image</Text>
              <Text style={styles.importSub}>PNG, JPG, JPEG</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickPdf()}
              style={({ pressed }) => [styles.importArea, styles.importAreaSecond, pressed && styles.pressed]}>
              <AppIcon name="doc.text" tintColor={C.accent} size={32} />
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
                  <ActivityIndicator color={C.accent} style={styles.pageSpinner} />
                ) : null}
                <View style={styles.changeRow}>
                  <Pressable
                    onPress={() => void (sourceKind === 'pdf' ? pickPdf() : pickImage())}
                    style={({ pressed }) => [styles.changeBtn, pressed && styles.pressed]}>
                    <Text style={styles.changeBtnText}>
                      {sourceKind === 'pdf' ? 'Change PDF' : 'Change Image'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowCrop(true)}
                    style={({ pressed }) => [styles.changeBtn, pressed && styles.pressed]}>
                    <Text style={styles.changeBtnText}>Adjust crop</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <LabelSizeSetupSection
              widthMm={widthMm}
              heightMm={heightMm}
              unit={labelUnit}
              onSizeChange={(w, h) => {
                setWidthMm(w);
                setHeightMm(h);
              }}
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
              <ActivityIndicator color="#FFFFFF" size="small" /* theme-fixed: on accent button */ />
            ) : (
              <Text style={styles.newButtonText}>Open in Editor</Text>
            )}
          </Pressable>
        )}
      </View>

      {imageSourceSheet}
      {documentSourceSheet}
      {showCrop && imageUri ? (
        <View style={styles.cropOverlay}>
          <ImageCropScreen
            sourceUri={imageUri}
            sourceWidth={imagePixels?.width}
            sourceHeight={imagePixels?.height}
            initialCrop={crop ?? FULL_CROP}
            commitMode="window"
            onCancel={() => setShowCrop(false)}
            onDone={(result) => {
              setCrop(result.crop);
              setCropCertain(true);
              if (result.width > 0 && result.height > 0) {
                setImagePixels({ width: result.width, height: result.height });
              }
              setShowCrop(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: c.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backChevron: { color: c.onAccent, fontSize: 32, fontWeight: '300', lineHeight: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: c.onAccent,
    fontSize: 17,
    fontWeight: '500',
  },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, gap: 12 },
  importCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: c.hairline,
    gap: 12,
  },
  importTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  importHint: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
  importArea: {
    minHeight: 120,
    borderRadius: 12,
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: c.hairline,
    borderStyle: 'dashed',
  },
  importAreaSecond: { minHeight: 108 },
  importText: { fontSize: 15, fontWeight: '500', color: c.text },
  importSub: { fontSize: 12, color: c.textMuted },
  thumbCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    gap: 8,
  },
  thumb: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: c.fill,
  },
  thumbMeta: { fontSize: 12, color: c.textSecondary, textAlign: 'center' },
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
    borderColor: c.hairline,
    backgroundColor: c.fill,
  },
  pdfNavText: { fontSize: 13, fontWeight: '600', color: c.text },
  pdfNavLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  pageSpinner: { marginTop: 4 },
  cropOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  changeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  changeBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  changeBtnText: { fontSize: 13, fontWeight: '600', color: c.accent },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: c.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  newButton: {
    backgroundColor: c.accentFill,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonDisabled: { opacity: 0.5 },
  newButtonText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.72 },
}));
