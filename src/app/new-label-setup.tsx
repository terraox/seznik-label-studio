import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabelDimensionModal } from '@/components/label-dimension-modal';
import { IosAlertModal, IosAlertInput } from '@/components/ui/ios-alert-modal';
import { JEWELRY_DIECUT, JEWELRY_DIECUT_PREVIEW_SINGLE } from '@/constants/jewelry-diecut';
import { Spacing } from '@/constants/theme';

import { useTranslation } from '@/lib/i18n';
import {
    createLabelDocument,
    createUpsConfig,
    generateId,
    type LabelElement,
} from '@/lib/label-document';
import {
    clampLabelMm,
    containFitImageOnLabel,
    fromMm,
    validateLabelSize,
    type LabelUnit,
} from '@/lib/label-geometry';
import { scaleDocumentToSize } from '@/lib/element-sizing';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Image } from 'expo-image';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const SETUP_PRESETS = [
  { label: '50 × 25', width: 50, height: 25 },
  { label: '50 × 50', width: 50, height: 50 },
  { label: '50 × 30', width: 50, height: 30 },
  { label: '50 × 75', width: 50, height: 75 },
  { label: '50 × 15', width: 50, height: 15 },
  { label: '100 × 150', width: 100, height: 150 },
];

function formatDimension(mm: number, unit: LabelUnit): string {
  const v = fromMm(mm, unit);
  if (unit === 'in') return String(Math.round(v * 100) / 100);
  if (unit === 'cm') return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

function unitSuffix(unit: LabelUnit): string {
  return unit === 'in' ? 'in' : unit;
}

export default function NewLabelSetupScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    isClone?: string;
    isTwoUps?: string;
    isJewellery3Up?: string;
    cloneFromId?: string;
    cloneName?: string;
    cloneWidth?: string;
    cloneHeight?: string;
    focusSize?: string;
    importImageUri?: string;
    importImageWidth?: string;
    importImageHeight?: string;
    defaultWidth?: string;
    defaultHeight?: string;
    isSingleCanvas?: string;
    isJewelleryTag?: string;
  }>();
  const isImportImage = Boolean(params.importImageUri);
  const isSingleCanvas = params.isSingleCanvas === 'true' || isImportImage;
  const isClone = params.isClone === 'true';
  const isTwoUps = !isSingleCanvas && params.isTwoUps === 'true';
  const isJewellery3Up = !isSingleCanvas && params.isJewellery3Up === 'true';
  const defaults = useSettingsStore((s) => s.defaults);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);

  const [labelName, setLabelName] = useState(
    isImportImage
      ? params.isJewelleryTag === 'true'
        ? 'Jewellery Image Label'
        : 'Imported Image Label'
      : isJewellery3Up
        ? 'Jewellery Label'
        : isClone
          ? params.cloneName
            ? `${params.cloneName} Copy`
            : 'Label Copy'
          : isTwoUps
            ? params.cloneName
              ? `${params.cloneName} · 2ups`
              : '2ups label'
            : 'Default label',
  );
  const [labelWidth, setLabelWidth] = useState(
    params.defaultWidth
      ? parseFloat(params.defaultWidth)
      : isJewellery3Up
        ? JEWELRY_DIECUT.tagWidthMm
        : params.cloneWidth
          ? parseFloat(params.cloneWidth)
          : 50,
  );
  const [labelHeight, setLabelHeight] = useState(
    params.defaultHeight
      ? parseFloat(params.defaultHeight)
      : isJewellery3Up
        ? JEWELRY_DIECUT.tagHeightMm
        : params.cloneHeight
          ? parseFloat(params.cloneHeight)
          : 30,
  );
  const [columns, setColumns] = useState(
    isSingleCanvas ? 1 : isJewellery3Up ? JEWELRY_DIECUT.columns : isTwoUps ? 2 : 1,
  );
  // Stick 2-up: labels sit flush (0 mm). Jewellery 3-up: 3 mm gaps.
  const [columnSpacing, setColumnSpacing] = useState(isJewellery3Up ? JEWELRY_DIECUT.gapMm : isTwoUps ? 0 : 1);
  const [batchEdit, setBatchEdit] = useState(false);

  const [labelUnit, setLabelUnit] = useState<LabelUnit>('mm');
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [widthModalVisible, setWidthModalVisible] = useState(params.focusSize === '1');
  const [heightModalVisible, setHeightModalVisible] = useState(false);
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    if (params.focusSize === '1') setWidthModalVisible(true);
  }, [params.focusSize]);

  const handleCreateLabel = () => {
    const size = clampLabelMm(labelWidth, labelHeight);
    const error = validateLabelSize(size.widthMm, size.heightMm);
    if (error) {
      Alert.alert('Invalid size', error);
      return;
    }

    if (params.importImageUri) {
      const imgId = generateId();
      const assetW = parseFloat(params.importImageWidth || '0') || 1;
      const assetH = parseFloat(params.importImageHeight || '0') || 1;
      const jewelryBody =
        params.isJewelleryTag === 'true' || size.widthMm <= 15
          ? { left: 0, top: 0, width: size.widthMm, height: Math.min(size.heightMm, JEWELRY_DIECUT.bodyHeightMm) }
          : undefined;
      const nested = containFitImageOnLabel(
        { widthMm: size.widthMm, heightMm: size.heightMm },
        { widthPx: assetW, heightPx: assetH },
        jewelryBody,
      );

      const imgElement: LabelElement = {
        id: imgId,
        type: 'image',
        uri: params.importImageUri,
        rotation: 0,
        left: nested.left,
        top: nested.top,
        width: nested.width,
        height: nested.height,
        lockMovement: false,
        needPrinting: true,
        antiColor: false,
        contentFit: 'contain',
        aspectRatioLocked: true,
        originalAspect: assetW / assetH,
      };

      // Nested image canvas on the selected label size. Phone pad stays constant.
      const doc = createLabelDocument({
        name: labelName,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        elements: [imgElement],
        background: { type: 'color', color: '#FFFFFF' }, // theme-fixed: label paper colour (document data)
      });
      if (params.isJewelleryTag === 'true' || size.widthMm <= 15) {
        doc.templateCategory = 'jewelry';
        doc.templatePreviewType = JEWELRY_DIECUT_PREVIEW_SINGLE;
      }
      upsertDocument(doc);
      router.replace({
        pathname: '/edit',
        params: {
          labelId: doc.id,
          selectedElementId: imgId,
          autoOpenPanel: 'true',
        },
      });
      return;
    }

    let seedElements: LabelElement[] = [];
    if (params.cloneFromId) {
      const source = useLabelStore.getState().getDocument(params.cloneFromId);
      if (source) {
        const cloned = JSON.parse(JSON.stringify(source.elements)) as LabelElement[];
        // Each ups panel is one label at `size` mm. A source cloned at a
        // different size needs proportional rescale, or geometry stays stale
        // and clips at the new bounds.
        seedElements =
          source.widthMm === size.widthMm && source.heightMm === size.heightMm
            ? cloned
            : scaleDocumentToSize(
                { ...source, elements: cloned, ups: undefined },
                size.widthMm,
                size.heightMm,
              ).elements;
      }
    }

    if (columns > 1) {
      const ups = createUpsConfig({
        columns,
        columnSpacingMm: columnSpacing,
        batchEdit,
        seedElements,
      });
      const doc = createLabelDocument({
        name: labelName,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        elements: ups.panels[0] ?? [],
        background: { type: 'color', color: '#FFFFFF' }, // theme-fixed: label paper colour (document data)
      });
      doc.ups = ups;
      doc.templateCategory = 'Multi-UP';
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
      return;
    }

    router.replace({
      pathname: '/edit',
      params: {
        labelName,
        labelWidth: String(size.widthMm),
        labelHeight: String(size.heightMm),
        orientation: `${defaults.orientation}°`,
        paperType: defaults.paperType,
        ...(params.cloneFromId ? { cloneFromId: params.cloneFromId } : {}),
      },
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {isImportImage
            ? 'Label Sizing Setup'
            : isTwoUps
              ? '2ups label'
              : isClone
                ? 'Label Clone'
                : t('editor.newLabel')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.previewPad}>
          <View style={styles.previewRow}>
            {Array.from({ length: Math.max(1, columns) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.previewCell,
                  {
                    marginRight: i < columns - 1 ? Math.max(0, columnSpacing * 4) : 0,
                    aspectRatio: isImportImage
                      ? Math.max(0.6, Math.min(2.2, labelWidth / Math.max(labelHeight, 1)))
                      : labelWidth / Math.max(labelHeight, 1),
                    minWidth: isImportImage ? 160 : undefined,
                    minHeight: isImportImage ? 110 : 48,
                  },
                ]}>
                {isImportImage && params.importImageUri ? (
                  <Image
                    source={{ uri: params.importImageUri }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="contain"
                  />
                ) : columns > 1 ? (
                  <Text style={styles.previewCellLabel}>{i + 1}</Text>
                ) : null}
              </View>
            ))}
          </View>
          {columns > 1 ? (
            <Text style={styles.previewHint}>
              Each panel is {labelWidth}×{labelHeight} mm — edit one at a time. Print strip ≈{' '}
              {Math.max(
                labelWidth,
                Math.round((labelWidth * columns + columnSpacing * (columns - 1)) * 10) / 10,
              )}
              ×{labelHeight} mm.
            </Text>
          ) : (
            <Text style={styles.previewHint}>
              Phone pad stays the same size. Label canvas: {labelWidth} × {labelHeight} mm
              {isImportImage ? ' · imported image sits on that canvas' : ''}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Size presets</Text>
          <View style={styles.presetFormatCard}>
            <Text style={styles.presetFormatTitle}>Size format</Text>
            <View style={styles.presetFormatRow}>
              <View style={styles.presetFormatPill}>
                <Text style={styles.presetFormatPillLabel}>Width</Text>
              </View>
              <Text style={styles.presetFormatTimes}>×</Text>
              <View style={styles.presetFormatPill}>
                <Text style={styles.presetFormatPillLabel}>Height</Text>
              </View>
              <Text style={styles.presetFormatUnit}>mm</Text>
            </View>
            <Text style={styles.presetFormatHint}>Each preset is shown as width × height in millimetres.</Text>
          </View>
          <View style={styles.presetGrid}>
            {SETUP_PRESETS.map((p) => {
              const active =
                Math.abs(labelWidth - p.width) < 0.1 && Math.abs(labelHeight - p.height) < 0.1;
              return (
                <Pressable
                  key={p.label}
                  onPress={() => {
                    setLabelWidth(p.width);
                    setLabelHeight(p.height);
                  }}
                  style={[styles.presetChip, active && styles.presetChipActive]}>
                  <Text
                    style={[styles.presetChipText, active && styles.presetChipTextActive]}
                    numberOfLines={1}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => router.push('/(tabs)/template')}
            style={({ pressed }) => [styles.templatesLink, pressed && styles.cardPressed]}>
            <Text style={styles.templatesLinkText}>Browse our templates</Text>
            <Text style={styles.chevronRight}>›</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Custom size</Text>
          <View style={styles.groupCard}>
            <Pressable
              onPress={() => {
                setTempName(labelName);
                setNameModalVisible(true);
              }}
              style={({ pressed }) => [styles.groupRow, pressed && styles.cardPressed]}>
              <Text style={styles.fieldLabel}>{t('editor.labelName')}</Text>
              <View style={styles.fieldValueWrap}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {labelName}
                </Text>
                <Text style={styles.chevronRight}>›</Text>
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            <Pressable
              onPress={() => setWidthModalVisible(true)}
              style={({ pressed }) => [styles.groupRow, pressed && styles.cardPressed]}>
              <Text style={styles.fieldLabel}>Width</Text>
              <View style={styles.fieldValueWrap}>
                <Text style={styles.fieldValueText}>
                  {formatDimension(labelWidth, labelUnit)} {unitSuffix(labelUnit)}
                </Text>
                <Text style={styles.chevronRight}>›</Text>
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            <Pressable
              onPress={() => setHeightModalVisible(true)}
              style={({ pressed }) => [styles.groupRow, pressed && styles.cardPressed]}>
              <Text style={styles.fieldLabel}>Height</Text>
              <View style={styles.fieldValueWrap}>
                <Text style={styles.fieldValueText}>
                  {formatDimension(labelHeight, labelUnit)} {unitSuffix(labelUnit)}
                </Text>
                <Text style={styles.chevronRight}>›</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {!isSingleCanvas && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Multi-up layout</Text>
            <View style={styles.groupCard}>
            <View style={styles.groupRow}>
              <Text style={styles.fieldLabel}>{columns > 1 ? 'Labels across' : t('editor.columns')}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setColumns((c) => Math.max(1, c - 1))}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{columns}</Text>
                <Pressable
                  onPress={() => setColumns((c) => Math.min(4, c + 1))}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            {columns > 1 ? (
              <>
              <View style={styles.groupDivider} />
              <View style={styles.groupRow}>
                <Text style={styles.fieldLabel}>{t('editor.columnSpacing')}</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setColumnSpacing((s) => Math.max(-4, Math.round((s - 0.5) * 10) / 10))}
                    style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{columnSpacing}</Text>
                  <Pressable
                    onPress={() => setColumnSpacing((s) => Math.min(8, Math.round((s + 0.5) * 10) / 10))}
                    style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                    <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
              </>
            ) : null}

            {columns > 1 ? (
              <>
              <View style={styles.groupDivider} />
              <View style={styles.groupRow}>
                <View style={styles.batchRow}>
                  <Text style={styles.fieldLabel}>{t('editor.batchEdit')}</Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      Alert.alert(
                        t('editor.batchEdit'),
                        'When enabled, edits on one label are mirrored to every label in the series.',
                      )
                    }>
                    <Text style={styles.infoHint}>?</Text>
                  </Pressable>
                </View>
                <Switch
                  value={batchEdit}
                  onChange={() => setBatchEdit((b) => !b)}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
                />
              </View>
              </>
            ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        <Pressable
          onPress={handleCreateLabel}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
          <Text style={styles.newButtonText}>
            {isImportImage ? 'Open in Editor' : 'New'}
          </Text>
        </Pressable>
      </View>

      <IosAlertModal
        visible={nameModalVisible}
        onClose={() => setNameModalVisible(false)}
        title={t('editor.labelName')}
        buttons={[
          { text: t('common.cancel'), style: 'cancel', onPress: () => setNameModalVisible(false) },
          {
            text: t('common.confirm'),
            style: 'default',
            bold: true,
            onPress: () => {
              if (tempName.trim()) setLabelName(tempName.trim());
              setNameModalVisible(false);
            },
          },
        ]}>
        <IosAlertInput
          value={tempName}
          onChangeText={setTempName}
          autoFocus
        />
      </IosAlertModal>

      <LabelDimensionModal
        visible={widthModalVisible}
        title="Set width"
        axis="width"
        valueMm={labelWidth}
        otherMm={labelHeight}
        unit={labelUnit}
        onUnitChange={setLabelUnit}
        onClose={() => setWidthModalVisible(false)}
        onConfirm={setLabelWidth}
      />

      <LabelDimensionModal
        visible={heightModalVisible}
        title="Set height"
        axis="height"
        valueMm={labelHeight}
        otherMm={labelWidth}
        unit={labelUnit}
        onUnitChange={setLabelUnit}
        onClose={() => setHeightModalVisible(false)}
        onConfirm={setLabelHeight}
      />
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
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
  previewPad: {
    backgroundColor: scheme === 'light' ? '#D5DCE4' : c.canvasArea, // theme-fixed: light keeps its grey stage around the white label
    borderRadius: 10,
    minHeight: 140,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewRow: { flexDirection: 'row', alignItems: 'stretch', maxWidth: '100%' },
  previewCell: {
    flex: 1,
    maxWidth: 120,
    minHeight: 48,
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (previewCell)
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C8D0D8', // theme-fixed: light preview (previewCell)
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCellLabel: {
    color: '#94A3B8', // theme-fixed: light preview (previewCellLabel)
    fontSize: 13,
    fontWeight: '600',
  },
  previewHint: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  section: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  presetFormatCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  presetFormatTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  presetFormatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  presetFormatPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: c.fill,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  presetFormatPillLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  presetFormatTimes: {
    fontSize: 18,
    fontWeight: '500',
    color: c.textMuted,
  },
  presetFormatUnit: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
  },
  presetFormatHint: {
    fontSize: 12,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  templatesLink: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  templatesLinkText: {
    fontSize: 15,
    fontWeight: '500',
    color: c.accent,
  },
  presetChip: {
    width: '31.5%',
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetChipActive: {
    backgroundColor: c.accentSoft,
    borderColor: c.accent,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    lineHeight: 16,
    textAlign: 'center',
  },
  presetChipTextActive: {
    color: c.accent,
    fontWeight: '600',
  },
  groupCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.hairline,
  },
  groupRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    marginLeft: 14,
  },
  cardPressed: { opacity: 0.88 },
  fieldLabel: { color: c.text, fontSize: 15, fontWeight: '500', flexShrink: 1 },
  fieldValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  fieldValueText: { color: c.textSecondary, fontSize: 14, fontWeight: '400', maxWidth: 160 },
  chevronRight: { color: c.textMuted, fontSize: 22, fontWeight: '300' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: c.text, fontWeight: '400', lineHeight: 22 },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '500', color: c.text },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  infoHint: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: c.border,
    textAlign: 'center',
    fontSize: 11,
    color: c.textSecondary,
    overflow: 'hidden',
    lineHeight: 16,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: c.bg,
  },
  newButton: {
    backgroundColor: c.accentFill,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newButtonText: { color: c.onAccent, fontSize: 17, fontWeight: '500' },
  pressed: { opacity: 0.75 },
}));
