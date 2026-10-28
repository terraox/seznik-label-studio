/**
 * Upload label — upload a soft copy of one label, choose its true size,
 * then open the editor with that photo on the label, printing off.
 */

import { goBack } from '@/lib/go-back';
import { useStepBack } from '@/lib/use-step-back';
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
import { ToolArt } from '@/components/home/tool-art';
import { UploadHero, UploadSteps } from '@/components/upload-label/upload-hero';
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

  const handleBack = () => {
    if (opening) return;
    if (step === 'size') {
      setStep('upload');
      return;
    }
    goBack();
  };

  useStepBack(step === 'size' && !opening, handleBack);

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
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Upload label</Text>
        <View style={styles.headerSpacer} />
      </View>

      {step === 'upload' || !imageUri ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}>
          <UploadHero />
          <UploadSteps current={0} />

          <Pressable
            onPress={() => void pickImage()}
            accessibilityRole="button"
            accessibilityLabel="Upload image"
            style={({ pressed }) => [styles.uploadCard, pressed && styles.pressed]}>
            <View style={styles.uploadIcon}>
              <ToolArt id="imageToLabel" size={116} />
            </View>
            <Text style={styles.uploadTitle}>Upload your label</Text>
            <Text style={styles.uploadSub}>
              Tap here to pick a photo or scan of one label.
            </Text>
            <View style={styles.uploadChips}>
              {['Gallery', 'Files'].map((label) => (
                <View key={label} style={styles.uploadChip}>
                  <Text style={styles.uploadChipText}>{label}</Text>
                </View>
              ))}
              <View style={[styles.uploadChip, styles.uploadChipAccent]}>
                <Text style={[styles.uploadChipText, styles.uploadChipTextAccent]}>PNG · JPG</Text>
              </View>
            </View>
          </Pressable>

          <View style={styles.tipCard}>
            <AppIcon name="lightbulb" tintColor={C.textMuted} size={16} />
            <Text style={styles.tipText}>
              <Text style={styles.tipStrong}>Use an accurately designed label photo. </Text>
              It should be sharp, flat and straight, with nothing cut off. Crop tightly to the
              label's edges, and measure the label itself, not the gap between labels on the roll.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <UploadSteps current={1} />

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

          <Text style={styles.sectionTitle}>Label size</Text>
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

          <Text style={styles.sectionTitle}>Options</Text>
          <View style={styles.optionCard}>
            <Text style={styles.optionLabel}>Turn the photo</Text>
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
                <Text style={styles.optionLabel}>Print this photo</Text>
                <Text style={styles.optionHint}>Off: the photo is only a guide to trace over. On: it prints with your label.</Text>
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
              {step === 'upload' || !imageUri ? 'Choose image' : 'Create label'}
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
  uploadCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accent,
    backgroundColor: c.surface,
  },
  uploadIcon: {
    width: 148,
    height: 148,
    borderRadius: 38,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  uploadTitle: { fontSize: 22, fontWeight: '800', color: c.text, textAlign: 'center' },
  uploadSub: {
    fontSize: 14.5,
    color: c.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  uploadChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 6 },
  uploadChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: c.fill,
  },
  uploadChipAccent: { backgroundColor: c.accentSoft },
  uploadChipText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },
  uploadChipTextAccent: { color: c.accentInk },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginLeft: 2 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
  },
  tipStrong: { fontWeight: '700', color: c.text },
  tipText: { flex: 1, fontSize: 12.5, color: c.textMuted, lineHeight: 18 },
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
