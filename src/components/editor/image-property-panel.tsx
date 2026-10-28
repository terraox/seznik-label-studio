import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { AppIcon } from '@/components/app-icon';
import { PositionControls } from '@/components/editor/position-controls';
import { formatMm, normalizeRotation } from '@/components/editor/types';
import { GrayThresholdSlider } from '@/components/editor/gray-threshold-slider';
import type { ImageElementState } from '@/lib/label-document';
import { resolveEditorColorMode } from '@/lib/editor/image-mono';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { containFitImageOnLabel } from '@/lib/label-coordinate-system';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const TABS = ['Regular', 'Position', 'Image', 'Effect'] as const;
export type ImagePropertyTab = (typeof TABS)[number];
const COLOR_MODES = ['Original', 'B & W', 'Halftone'] as const;

function Divider() {
  useThemeRefresh();
  return <View style={styles.divider} />;
}

function SectionGap() {
  useThemeRefresh();
  return <View style={styles.sectionGap} />;
}

function GraySection({ children }: { children: React.ReactNode }) {
  useThemeRefresh();
  return <View style={styles.graySection}>{children}</View>;
}

function SegmentRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.block}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.segmentRow}>
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={[styles.segmentChip, active && styles.segmentChipActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepperRight}>
        <Pressable onPress={onMinus} style={styles.stepperCircle}>
          <Text style={styles.stepperSymbol}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable onPress={onPlus} style={[styles.stepperCircle, styles.stepperCircleActive]}>
          <Text style={[styles.stepperSymbol, styles.stepperSymbolActive]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.border, true: C.accent }}
        thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
        ios_backgroundColor={C.border}
      />
    </View>
  );
}

export type ImagePropertyPanelProps = {
  activeTab: ImagePropertyTab;
  onTabChange: (tab: ImagePropertyTab) => void;
  state: ImageElementState & { id?: string };
  patch: (updates: Partial<ImageElementState>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
  onBusyChange?: (busy: boolean) => void;
  onColumnNamePress?: () => void;
};

export function ImagePropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
  onColumnNamePress,
}: ImagePropertyPanelProps) {
  useThemeRefresh();
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();
  const currentRotation = normalizeRotation(state.rotation ?? 0);
  const isAspectLocked = state.aspectRatioLocked ?? true;
  const currentAspect = state.width > 0 && state.height > 0 ? state.width / state.height : 1;

  const handleRotate90 = useCallback(() => {
    patch({ rotation: normalizeRotation(currentRotation + 90) });
  }, [currentRotation, patch]);

  const openCropScreen = useCallback(
    (uri: string, width: number, height: number, mode: 'recrop' | 'replace') => {
      if (!state.id) {
        Alert.alert('Crop unavailable', 'Select the image on the canvas first.');
        return;
      }
      router.push({
        pathname: '/image-crop',
        params: {
          uri,
          width: String(width),
          height: String(height),
          mode,
          elementId: state.id,
        },
      });
    },
    [state.id],
  );

  const handleCropImage = useCallback(() => {
    const sourceUri = state.printUri || state.uri;
    if (!sourceUri) return;
    openCropScreen(sourceUri, 0, 0, 'recrop');
  }, [openCropScreen, state.printUri, state.uri]);

  const handleReplaceImage = useCallback(async () => {
    const asset = await pickImageAsset();
    if (!asset) return;
    openCropScreen(asset.uri, asset.width, asset.height, 'replace');
  }, [openCropScreen, pickImageAsset]);

  const handleFlipH = useCallback(() => {
    patch({ flipH: !state.flipH });
  }, [state.flipH, patch]);

  const handleFlipV = useCallback(() => {
    patch({ flipV: !state.flipV });
  }, [state.flipV, patch]);

  const handleFitToCanvasPad = useCallback(() => {
    const widthPx =
      state.workingWidthPx && state.workingWidthPx > 0
        ? state.workingWidthPx
        : Math.max(1, state.originalAspect ?? 1);
    const heightPx =
      state.workingHeightPx && state.workingHeightPx > 0 ? state.workingHeightPx : 1;
    const placed = containFitImageOnLabel(
      { widthMm: labelWidthMm, heightMm: labelHeightMm },
      { widthPx, heightPx },
    );
    patch({
      left: placed.left,
      top: placed.top,
      width: placed.width,
      height: placed.height,
      contentFit: 'contain',
      aspectRatioLocked: true,
    });
  }, [
    labelHeightMm,
    labelWidthMm,
    patch,
    state.originalAspect,
    state.workingHeightPx,
    state.workingWidthPx,
  ]);

  const handleFitToWidth = useCallback(() => {
    const newW = labelWidthMm;
    const newH = isAspectLocked ? Math.round((newW / currentAspect) * 10) / 10 : state.height;
    patch({
      width: newW,
      height: Math.min(newH, labelHeightMm),
      left: 0,
    });
  }, [labelWidthMm, labelHeightMm, isAspectLocked, currentAspect, state.height, patch]);

  const handleCenter = useCallback(() => {
    patch({
      left: Math.max(0, Math.round(((labelWidthMm - state.width) / 2) * 10) / 10),
      top: Math.max(0, Math.round(((labelHeightMm - state.height) / 2) * 10) / 10),
    });
  }, [labelWidthMm, labelHeightMm, state.width, state.height, patch]);

  const handleWidthChange = useCallback(
    (delta: number) => {
      const nextW = Math.max(0.5, Math.round((state.width + delta) * 10) / 10);
      if (isAspectLocked) {
        const nextH = Math.max(0.5, Math.round((nextW / currentAspect) * 10) / 10);
        patch({ width: nextW, height: nextH });
      } else {
        patch({ width: nextW });
      }
    },
    [state.width, isAspectLocked, currentAspect, patch],
  );

  const handleHeightChange = useCallback(
    (delta: number) => {
      const nextH = Math.max(0.5, Math.round((state.height + delta) * 10) / 10);
      if (isAspectLocked) {
        const nextW = Math.max(0.5, Math.round((nextH * currentAspect) * 10) / 10);
        patch({ width: nextW, height: nextH });
      } else {
        patch({ height: nextH });
      }
    },
    [state.height, isAspectLocked, currentAspect, patch],
  );

  const colorMode = resolveEditorColorMode(state.colorMode);
  const threshold = state.grayThreshold ?? 128;
  const contentType = state.contentType === 'Data Source' ? 'Data Source' : 'Local Image';
  const applyTile = (tile: boolean) => {
    if (tile) {
      patch({
        tile: true,
        left: 0,
        top: 0,
        width: labelWidthMm,
        height: labelHeightMm,
        contentFit: 'fill',
      });
    } else {
      patch({ tile: false });
    }
  };

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContent}>
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <Pressable key={tab} onPress={() => onTabChange(tab)} style={styles.tabItem}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
              {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabSpacer} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}>
        {activeTab === 'Regular' && (
          <>
            <SegmentRow
              label="Content Type"
              options={['Local Image', 'Data Source'] as const}
              selected={contentType}
              onSelect={(val) => patch({ contentType: val })}
            />
            {contentType === 'Data Source' ? (
              <Pressable
                onPress={onColumnNamePress}
                style={({ pressed }) => [styles.chooseRow, pressed && styles.pressed]}>
                <Text style={styles.rowLabel}>Column</Text>
                <Text style={styles.chooseLink}>{state.columnNameContent || 'Select column'}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleReplaceImage}
                style={({ pressed }) => [styles.chooseRow, pressed && styles.pressed]}>
                <Text style={styles.rowLabel}>Image</Text>
                <Text style={styles.chooseLink}>Click to choose a new image</Text>
              </Pressable>
            )}
            <ToggleRow
              label="Tile"
              value={Boolean(state.tile)}
              onValueChange={applyTile}
            />
            <SegmentRow
              label="Color Mode"
              options={COLOR_MODES}
              selected={colorMode}
              onSelect={(val) => patch({ colorMode: val })}
            />
            {colorMode !== 'Original' ? (
              <View style={styles.thresholdBlock}>
                <View style={styles.thresholdHeader}>
                  <Text style={styles.rowLabel}>Gray Threshold</Text>
                  <Text style={styles.thresholdValue}>{threshold}</Text>
                </View>
                <GrayThresholdSlider
                  value={threshold}
                  onChange={(grayThreshold) => patch({ grayThreshold })}
                />
              </View>
            ) : null}
            <SegmentRow
              label="Rotation Angle"
              options={['0°', '90°', '180°', '270°'] as const}
              selected={`${currentRotation}°`}
              onSelect={(value) => patch({ rotation: normalizeRotation(parseInt(value, 10)) })}
            />
            <StepperRow
              label="Left"
              value={formatMm(state.left)}
              onMinus={() => patch({ left: Math.max(0, state.left - 0.1) })}
              onPlus={() => patch({ left: state.left + 0.1 })}
            />
            <StepperRow
              label="Top"
              value={formatMm(state.top)}
              onMinus={() => patch({ top: Math.max(0, state.top - 0.1) })}
              onPlus={() => patch({ top: state.top + 0.1 })}
            />
            <StepperRow
              label="Width"
              value={formatMm(state.width)}
              onMinus={() => handleWidthChange(-0.5)}
              onPlus={() => handleWidthChange(0.5)}
            />
            <StepperRow
              label="Height"
              value={formatMm(state.height)}
              onMinus={() => handleHeightChange(-0.5)}
              onPlus={() => handleHeightChange(0.5)}
            />
            <ToggleRow
              label="Lock Movement"
              value={state.lockMovement}
              onValueChange={(lockMovement) => patch({ lockMovement })}
            />
            <ToggleRow
              label="Need Printing"
              value={state.needPrinting}
              onValueChange={(needPrinting) => patch({ needPrinting })}
            />
          </>
        )}

        {activeTab === 'Position' && (
          <PositionControls
            left={state.left}
            top={state.top}
            width={state.width}
            height={elementHeightMm}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            onPatch={patch}
          />
        )}

        {activeTab === 'Image' && (
          <>
            <GraySection>
              <View style={styles.previewRow}>
                {state.uri ? (
                  <View style={styles.thumbWrapper}>
                    <Image
                      source={{ uri: state.uri }}
                      style={[
                        styles.thumb,
                        {
                          transform: [
                            { rotate: `${currentRotation}deg` },
                            { scaleX: state.flipH ? -1 : 1 },
                            { scaleY: state.flipV ? -1 : 1 },
                          ],
                        },
                      ]}
                      contentFit={state.contentFit ?? 'contain'}
                    />
                  </View>
                ) : null}
                <View style={styles.quickActionCol}>
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={handleCropImage}
                      style={({ pressed }) => [styles.actionButton, styles.cropButton, pressed && styles.pressed]}>
                      <AppIcon name="crop" tintColor={C.onAccent} size={15} />
                      <Text style={styles.cropButtonText}>Crop</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleReplaceImage}
                      style={({ pressed }) => [styles.actionButton, styles.replaceButton, pressed && styles.pressed]}>
                      <AppIcon name="photo" tintColor={C.textSecondary} size={15} />
                      <Text style={styles.replaceButtonText}>Replace</Text>
                    </Pressable>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={handleRotate90}
                      style={({ pressed }) => [styles.actionButton, styles.rotateButton, pressed && styles.pressed]}>
                      <AppIcon name="arrow.clockwise" tintColor={C.textSecondary} size={15} />
                      <Text style={styles.rotateButtonText}>Rotate 90°</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCenter}
                      style={({ pressed }) => [styles.actionButton, styles.centerButton, pressed && styles.pressed]}>
                      <AppIcon name="target" tintColor={C.textSecondary} size={15} />
                      <Text style={styles.centerButtonText}>Center</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              <Divider />
              <Text style={styles.rowLabel}>Mirror & Orientation</Text>
              <View style={[styles.segmentRow, { marginTop: 6 }]}>
                <Pressable
                  onPress={handleFlipH}
                  style={[styles.segmentChip, state.flipH && styles.segmentChipActive]}>
                  <Text style={[styles.segmentText, state.flipH && styles.segmentTextActive]}>
                    Flip Horizontal
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleFlipV}
                  style={[styles.segmentChip, state.flipV && styles.segmentChipActive]}>
                  <Text style={[styles.segmentText, state.flipV && styles.segmentTextActive]}>
                    Flip Vertical
                  </Text>
                </Pressable>
              </View>
              <Divider />
              <SegmentRow
                label="Content Fit"
                options={['fill', 'contain', 'cover'] as const}
                selected={state.contentFit ?? 'contain'}
                onSelect={(val) => patch({ contentFit: val })}
              />
              <Divider />
              <View style={styles.quickFitRow}>
                <Pressable
                  onPress={handleFitToCanvasPad}
                  style={({ pressed }) => [styles.toolChip, styles.toolChipPrimary, pressed && styles.pressed]}>
                  <AppIcon name="aspectratio" tintColor={C.onAccent} size={15} />
                  <Text style={styles.toolChipTextPrimary}>Fit Label</Text>
                </Pressable>
                <Pressable
                  onPress={handleFitToWidth}
                  style={({ pressed }) => [styles.toolChip, pressed && styles.pressed]}>
                  <AppIcon name="arrow.left.and.right" tintColor={C.accent} size={15} />
                  <Text style={styles.toolChipText}>Fit Width</Text>
                </Pressable>
              </View>
              <Divider />
              <ToggleRow
                label="Lock Aspect Ratio"
                value={isAspectLocked}
                onValueChange={(locked) => patch({ aspectRatioLocked: locked })}
              />
            </GraySection>
          </>
        )}

        {activeTab === 'Effect' && (
          <GraySection>
            <SegmentRow
              label="Color Mode"
              options={COLOR_MODES}
              selected={colorMode}
              onSelect={(val) => patch({ colorMode: val })}
            />
            {colorMode !== 'Original' ? (
              <>
                <Divider />
                <View style={styles.thresholdBlock}>
                  <View style={styles.thresholdHeader}>
                    <Text style={styles.rowLabel}>Gray Threshold</Text>
                    <Text style={styles.thresholdValue}>{threshold}</Text>
                  </View>
                  <GrayThresholdSlider
                    value={threshold}
                    onChange={(grayThreshold) => patch({ grayThreshold })}
                  />
                </View>
              </>
            ) : null}
            <Divider />
            <ToggleRow
              label="Invert Colors (Anti-Color)"
              value={state.antiColor}
              onValueChange={(antiColor) => patch({ antiColor })}
            />
          </GraySection>
        )}
      </ScrollView>
      {imageSourceSheet}
    </View>
  );
}

const styles = themedStyles((c) => ({
  panel: {
    backgroundColor: c.surface,
    flex: 1,
  },
  tabScroll: {
    borderBottomWidth: 1,
    borderBottomColor: c.hairline,
    maxHeight: 44,
  },
  tabContent: {
    paddingHorizontal: 16,
    gap: 20,
    alignItems: 'center',
  },
  tabItem: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: c.accent,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: c.accent,
    borderRadius: 1.5,
  },
  tabSpacer: {
    height: 2.5,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  graySection: {
    backgroundColor: c.fill,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  sectionGap: {
    height: 12,
  },
  divider: {
    height: 1,
    backgroundColor: c.hairline,
    marginVertical: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbWrapper: {
    width: 68,
    height: 68,
    borderRadius: 8,
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (thumbWrapper)
    borderWidth: 1,
    borderColor: '#E5E7EB', // theme-fixed: light preview (thumbWrapper)
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 58,
    height: 58,
  },
  quickActionCol: {
    flex: 1,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cropButton: {
    backgroundColor: c.accent,
  },
  cropButtonText: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '600',
  },
  rotateButton: {
    backgroundColor: c.fillStrong,
  },
  rotateButtonText: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  replaceButton: {
    backgroundColor: c.fillStrong,
  },
  replaceButtonText: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  centerButton: {
    backgroundColor: c.fillStrong,
  },
  centerButtonText: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  block: {
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: c.textSecondary,
    flexShrink: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentChipActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: c.textSecondary,
  },
  segmentTextActive: {
    color: c.onAccent,
    fontWeight: '700',
  },
  quickFitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: c.fill,
    borderWidth: 1,
    borderColor: c.border,
  },
  toolChipPrimary: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  toolChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.accent,
  },
  toolChipTextPrimary: {
    fontSize: 12,
    fontWeight: '600',
    color: c.onAccent,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  stepperRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleActive: {
    backgroundColor: c.accent,
  },
  stepperSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: c.textSecondary,
  },
  stepperSymbolActive: {
    color: c.onAccent,
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
    minWidth: 48,
    textAlign: 'center',
    flexShrink: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  pressed: {
    opacity: 0.75,
  },
  chooseRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chooseLink: {
    fontSize: 14,
    fontWeight: '600',
    color: c.accent,
    flexShrink: 1,
    textAlign: 'right',
  },
  thresholdBlock: {
    paddingVertical: 8,
  },
  thresholdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  thresholdValue: {
    fontSize: 15,
    fontWeight: '600',
    color: c.textSecondary,
    flexShrink: 1,
  },
  sliderBlock: {
    position: 'relative',
    height: 20,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: c.fillStrong,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: c.accent,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.accent,
  },
  sliderTicks: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  sliderTickHit: {
    flex: 1,
  },
}));
