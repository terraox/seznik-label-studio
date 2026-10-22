/**
 * Upload label — upload a soft copy of one label, choose its true size,
 * then open the editor with that photo on the label, printing off.
 */

import { goBack } from '@/lib/go-back';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelSizeSetupSection } from '@/components/label-size-setup-section';
import type { Rotation } from '@/components/editor/types';
import { Spacing } from '@/constants/theme';

import { ingestReferenceImage } from '@/lib/editor/reference-image-ingest';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { clampLabelMm, validateLabelSize, type LabelUnit } from '@/lib/label-geometry';
import { createLabelDocument } from '@/lib/label-document';
import {
  referenceImageStoredFormatFromPick,
  referenceProportionWarns,
  withReferenceImage,
} from '@/lib/reference-image';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type Step = 'upload' | 'size';

const MEASURE_POINTS = [
  'Measure the true width and height of the label itself.',
  'Do not include the vertical gap between labels on the roll.',
];

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export default function ImageToLabelScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const defaults = useSettingsStore((s) => s.defaults);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();

  const [step, setStep] = useState<Step>('upload');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | undefined>(undefined);
  const [imagePixels, setImagePixels] = useState<{ width: number; height: number } | null>(null);
  const [widthMm, setWidthMm] = useState(defaults.labelWidth || 50);
  const [heightMm, setHeightMm] = useState(defaults.labelHeight || 30);
  const [labelUnit, setLabelUnit] = useState<LabelUnit>('mm');
  const [rotation, setRotation] = useState<Rotation>(0);
  const [needPrinting, setNeedPrinting] = useState(false);
  const [opening, setOpening] = useState(false);

  const proportionWarn =
    imagePixels != null &&
    referenceProportionWarns(imagePixels.width, imagePixels.height, widthMm, heightMm);

  const pickImage = useCallback(async () => {
    try {
      const asset = await pickImageAsset();
      if (!asset) return;
      const format = referenceImageStoredFormatFromPick(asset.name, asset.uri);
      if (!format) {
        Alert.alert('Upload label', 'Use a PNG or JPG image.');
        return;
      }
      setImageUri(asset.uri);
      setImageName(asset.name);
      setImagePixels({ width: asset.width, height: asset.height });
      setStep('size');
    } catch {
      Alert.alert('Upload label', 'Unable to load this image. Please try another image.');
    }
  }, [pickImageAsset]);

  const openEditor = useCallback(async () => {
    if (opening || !imageUri || !imagePixels) return;
    const sizeError = validateLabelSize(widthMm, heightMm);
    if (sizeError) {
      Alert.alert('Invalid size', sizeError);
      return;
    }
    const size = clampLabelMm(widthMm, heightMm);
    setOpening(true);
    try {
      const stored = await ingestReferenceImage({
        uri: imageUri,
        width: imagePixels.width,
        height: imagePixels.height,
        name: imageName,
      });
      const created = createLabelDocument({
        name: 'Uploaded label',
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        paperType: defaults.paperType,
      });
      const doc = withReferenceImage(created, {
        ...stored,
        rotation,
        needPrinting,
      });
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this image on the label.';
      Alert.alert('Upload label', message);
      setOpening(false);
    }
  }, [
    defaults.paperType,
    heightMm,
    imageName,
    imagePixels,
    imageUri,
    needPrinting,
    opening,
    rotation,
    upsertDocument,
    widthMm,
  ]);

  const goBack = () => {
    if (opening) return;
    if (step === 'size') {
      setStep('upload');
      return;
    }
    goBack();
  };

  const sizePreview = imageUri ? (
    <View style={[StyleSheet.absoluteFill, styles.previewClip]}>
      <Image
        source={{ uri: imageUri }}
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${rotation}deg` }] }]}
        contentFit="contain"
      />
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Upload label</Text>
        <View style={styles.headerSpacer} />
      </View>

      {step === 'upload' || !imageUri ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <AppIcon name="photo.on.rectangle" tintColor={C.accent} size={32} />
          </View>
          <Text style={styles.emptyTitle}>Upload a soft copy</Text>
          <Text style={styles.emptyBody}>
            Photograph or scan one label, cropped tightly to its outer edges. PNG or JPG.
          </Text>
          <View style={styles.guide}>
            <Text style={styles.guideTitle}>How to measure</Text>
            {MEASURE_POINTS.map((point) => (
              <View key={point} style={styles.guideRow}>
                <View style={styles.guideDot} />
                <Text style={styles.guideText}>{point}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.fileRow}>
            <Image source={{ uri: imageUri }} style={styles.fileLogo} contentFit="cover" />
            <View style={styles.fileText}>
              <Text style={styles.fileName} numberOfLines={1}>
                {imageName || 'Label image'}
              </Text>
              {imagePixels ? (
                <Text style={styles.fileMeta}>
                  {imagePixels.width} × {imagePixels.height} px
                </Text>
              ) : null}
            </View>
            <Pressable onPress={() => void pickImage()} hitSlop={8}>
              <Text style={styles.change}>Change</Text>
            </Pressable>
          </View>

          <View style={styles.optionCard}>
            <Text style={styles.optionLabel}>Rotation</Text>
            <View style={styles.rotationRow}>
              {ROTATIONS.map((angle) => {
                const active = angle === rotation;
                return (
                  <Pressable
                    key={angle}
                    onPress={() => setRotation(angle)}
                    style={[styles.rotationChip, active && styles.rotationChipActive]}>
                    <Text style={[styles.rotationText, active && styles.rotationTextActive]}>{angle}°</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.printRow}>
              <View style={styles.printText}>
                <Text style={styles.optionLabel}>Need Printing</Text>
                <Text style={styles.optionHint}>Turn this on when the photo should print.</Text>
              </View>
              <Switch
                value={needPrinting}
                onValueChange={setNeedPrinting}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor="#FFFFFF" // theme-fixed: white switch thumb
                ios_backgroundColor={C.border}
              />
            </View>
          </View>

          <Text style={styles.sizeNote}>
            Choose the label's own width and height. Leave out the gap between labels.
          </Text>

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
            preview={sizePreview}
          />

          {proportionWarn ? (
            <Text style={styles.warn}>
              This photo's proportions differ from the label size by more than 3%. It will still be
              stretched to fill the label.
            </Text>
          ) : null}
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        <Pressable
          onPress={() => {
            if (step === 'upload' || !imageUri) {
              void pickImage();
              return;
            }
            void openEditor();
          }}
          disabled={opening}
          style={({ pressed }) => [
            styles.openButton,
            opening && styles.openButtonDisabled,
            pressed && !opening && styles.pressed,
          ]}>
          {opening ? (
            <ActivityIndicator color="#FFFFFF" size="small" /* theme-fixed: on accent button */ />
          ) : (
            <Text style={styles.openButtonText}>
              {step === 'upload' || !imageUri ? 'Upload image' : 'Create label'}
            </Text>
          )}
        </Pressable>
      </View>
      {imageSourceSheet}
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text },
  emptyBody: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
  guide: {
    alignSelf: 'stretch',
    marginTop: 8,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    padding: 14,
    gap: 10,
  },
  guideTitle: { fontSize: 14, fontWeight: '700', color: c.text },
  guideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  guideDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.accentFill,
    marginTop: 6,
  },
  guideText: { flex: 1, fontSize: 13, color: c.textSecondary, lineHeight: 18 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, gap: 12 },
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
  fileLogo: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: c.fill,
  },
  fileText: { flex: 1, gap: 2 },
  fileName: { fontSize: 15, fontWeight: '600', color: c.text },
  fileMeta: { fontSize: 12, color: c.textSecondary },
  change: { fontSize: 14, fontWeight: '600', color: c.accent },
  sizeNote: { fontSize: 13, color: c.textSecondary, lineHeight: 18, paddingHorizontal: 4 },
  previewClip: { overflow: 'hidden' },
  optionCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    padding: 14,
    gap: 12,
  },
  optionLabel: { fontSize: 14, fontWeight: '700', color: c.text },
  optionHint: { fontSize: 12, color: c.textSecondary, lineHeight: 16 },
  rotationRow: { flexDirection: 'row', gap: 8 },
  rotationChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.fill,
  },
  rotationChipActive: { backgroundColor: c.accentFill, borderColor: c.accent },
  rotationText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  rotationTextActive: { color: c.onAccent },
  printRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  printText: { flex: 1, gap: 2 },
  warn: {
    color: c.warning,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: c.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  openButton: {
    backgroundColor: c.accentFill,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openButtonDisabled: { opacity: 0.5 },
  openButtonText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.72 },
}));
