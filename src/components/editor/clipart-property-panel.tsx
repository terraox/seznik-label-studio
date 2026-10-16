import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PositionControls } from '@/components/editor/position-controls';
import { DRAWING_COLORS, formatMm, normalizeRotation } from '@/components/editor/types';
import { GrayThresholdSlider } from '@/components/editor/gray-threshold-slider';
import { getClipartById } from '@/constants/clipart-library';
import { clipartSvgSource } from '@/lib/clipart/types';
import {
  clampStrokeScale,
  STROKE_SCALE_MAX,
  STROKE_SCALE_MIN,
  STROKE_SCALE_STEP,
} from '@/lib/clipart/stroke-scale';
import type { ClipartElementState } from '@/lib/label-document';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const TABS = ['Regular', 'Position', 'Clipart', 'Effect'] as const;
export type ClipartPropertyTab = (typeof TABS)[number];

const COLOR_MODES = ['Original', 'B & W', 'Halftone'] as const;
type ColorMode = (typeof COLOR_MODES)[number];

function Divider() {
  useThemeRefresh();
  return <View style={styles.divider} />;
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
  onMinus?: () => void;
  onPlus?: () => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepperControls}>
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

function ColorRow({
  selectedIndex,
  onSelect,
}: {
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.colorRow}>
      <Text style={styles.rowLabel}>Drawing Color</Text>
      <View style={styles.colorGroup}>
        {DRAWING_COLORS.map((color, index) => {
          if (color === '#FFFFFF') return null; // white is not offered as a drawing colour // theme-fixed: ink value, not UI
          const active = index === selectedIndex;
          return (
            <Pressable
              key={`${color}-${index}`}
              onPress={() => onSelect(index)}
              style={[styles.colorOuter, active && styles.colorOuterActive]}>
              <View
                style={[
                  styles.colorDot,
                  { backgroundColor: color },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PanelNote({ children }: { children: string }) {
  useThemeRefresh();
  return <Text style={styles.note}>{children}</Text>;
}

function ChooseClipartRow({ onPress }: { onPress: () => void }) {
  useThemeRefresh();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chooseRow, pressed && styles.pressed]}>
      <Text style={styles.rowLabel}>Clipart</Text>
      <View style={styles.chooseRight}>
        <Text style={styles.chooseLink} numberOfLines={1}>
          Click to choose a new logo
        </Text>
        <AppIcon name="chevron.right" tintColor={C.textDisabled} size={14} weight="semibold" />
      </View>
    </Pressable>
  );
}

function InlineSegmentRow<T extends string>({
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
    <View style={styles.inlineRow}>
      <Text style={styles.inlineLabel}>{label}</Text>
      <View style={styles.inlineSegments}>
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={[styles.inlineChip, active && styles.segmentChipActive]}>
              <Text style={[styles.inlineChipText, active && styles.segmentTextActive]} numberOfLines={1}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DimensionSteppers({
  state,
  patch,
}: {
  state: ClipartElementState;
  patch: (updates: Partial<ClipartElementState>) => void;
}) {
  useThemeRefresh();
  return (
    <>
      <StepperRow
        label="Left"
        value={formatMm(state.left)}
        onMinus={() => patch({ left: Math.max(0, state.left - 0.1) })}
        onPlus={() => patch({ left: state.left + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Top"
        value={formatMm(state.top)}
        onMinus={() => patch({ top: Math.max(0, state.top - 0.1) })}
        onPlus={() => patch({ top: state.top + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Width"
        value={formatMm(state.width)}
        onMinus={() => patch({ width: Math.max(0.1, state.width - 0.1) })}
        onPlus={() => patch({ width: state.width + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Height"
        value={formatMm(state.height)}
        onMinus={() => patch({ height: Math.max(0.1, state.height - 0.1) })}
        onPlus={() => patch({ height: state.height + 0.1 })}
      />
    </>
  );
}

function useColorMode(state: ClipartElementState): ColorMode {
  return state.colorMode === 'B & W' || state.colorMode === 'Halftone' ? state.colorMode : 'Original';
}

function applyTilePatch(
  tile: boolean,
  patch: (updates: Partial<ClipartElementState>) => void,
  labelWidthMm: number,
  labelHeightMm: number,
) {
  if (tile) {
    patch({
      tile: true,
      left: 0,
      top: 0,
      width: labelWidthMm,
      height: labelHeightMm,
    });
  } else {
    patch({ tile: false });
  }
}

function EffectTabBody({
  state,
  patch,
  labelWidthMm,
  labelHeightMm,
}: {
  state: ClipartElementState;
  patch: (updates: Partial<ClipartElementState>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
}) {
  useThemeRefresh();
  const colorMode = useColorMode(state);
  const threshold = state.grayThreshold ?? 128;

  return (
    <>
      <ToggleRow
        label="Tile"
        value={Boolean(state.tile)}
        onValueChange={(tile) => applyTilePatch(tile, patch, labelWidthMm, labelHeightMm)}
      />
      <Divider />
      <InlineSegmentRow
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
    </>
  );
}

export type ClipartPropertyPanelProps = {
  activeTab: ClipartPropertyTab;
  onTabChange: (tab: ClipartPropertyTab) => void;
  state: ClipartElementState;
  patch: (updates: Partial<ClipartElementState>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
  onChooseClipart: () => void;
};

export function ClipartPropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
  onChooseClipart,
}: ClipartPropertyPanelProps) {
  useThemeRefresh();
  const colorMode = useColorMode(state);
  const isLineArt = Boolean(clipartSvgSource(getClipartById(state.clipartId)));
  const thickness = clampStrokeScale(state.strokeScale);
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

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
        {activeTab === 'Regular' && (
          <>
            <ChooseClipartRow onPress={onChooseClipart} />
            <Divider />
            <ToggleRow
              label="Tile"
              value={Boolean(state.tile)}
              onValueChange={(tile) => applyTilePatch(tile, patch, labelWidthMm, labelHeightMm)}
            />
            {isLineArt ? (
              <>
                <Divider />
                <View style={styles.thresholdBlock}>
                  <View style={styles.thresholdHeader}>
                    <Text style={styles.rowLabel}>Line Thickness</Text>
                  </View>
                  <GrayThresholdSlider
                    value={thickness}
                    min={STROKE_SCALE_MIN}
                    max={STROKE_SCALE_MAX}
                    step={STROKE_SCALE_STEP}
                    onChange={(strokeScale) => patch({ strokeScale })}
                  />
                </View>
              </>
            ) : null}
            <Divider />
            <SegmentRow
              label="Color Mode"
              options={COLOR_MODES}
              selected={colorMode}
              onSelect={(val) => patch({ colorMode: val })}
            />
            <Divider />
            <SegmentRow
              label="Rotation Angle"
              options={['0°', '90°', '180°', '270°'] as const}
              selected={`${normalizeRotation(state.rotation)}°`}
              onSelect={(value) => patch({ rotation: normalizeRotation(parseInt(value, 10)) })}
            />
            <Divider />
            <DimensionSteppers state={state} patch={patch} />
            <Divider />
            <ToggleRow
              label="Lock Movement"
              value={state.lockMovement}
              onValueChange={(lockMovement) => patch({ lockMovement })}
            />
            <Divider />
            <ToggleRow
              label="Need Printing"
              value={state.needPrinting}
              onValueChange={(needPrinting) => patch({ needPrinting })}
            />
            <Divider />
            <ColorRow
              selectedIndex={state.drawingColorIndex}
              onSelect={(drawingColorIndex) => patch({ drawingColorIndex })}
            />
            <PanelNote>
              This color only acts on the preview effect, does not affect the printing effect.
            </PanelNote>
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

        {activeTab === 'Clipart' && <ChooseClipartRow onPress={onChooseClipart} />}

        {activeTab === 'Effect' && (
          <EffectTabBody
            state={state}
            patch={patch}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles((c) => ({
  panel: { flex: 1, backgroundColor: c.surface },
  tabScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
  tabContent: { paddingHorizontal: 8 },
  tabItem: { paddingHorizontal: 22, paddingTop: 10, alignItems: 'center' },
  tabText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  tabTextActive: { color: c.accent, fontWeight: '600' },
  tabIndicator: {
    marginTop: 8,
    width: '100%',
    minWidth: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.accent,
  },
  tabSpacer: { marginTop: 8, height: 3 },
  body: { flex: 1, backgroundColor: c.surface },
  bodyContent: { paddingBottom: 24 },
  block: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: c.textSecondary,
    lineHeight: 20,
    includeFontPadding: false,
    ...Platform.select({ android: { textAlignVertical: 'center' as const }, default: {} }),
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: 16 },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  segmentChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
  },
  segmentChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  segmentText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, textAlign: 'center' },
  segmentTextActive: { color: c.onAccent },
  stepperRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleActive: { borderColor: c.accent, backgroundColor: c.accent },
  stepperSymbol: { fontSize: 18, lineHeight: 20, color: c.accent, fontWeight: '500' },
  stepperSymbolActive: { color: c.onAccent },
  stepperValue: { minWidth: 72, textAlign: 'center', fontSize: 14, fontWeight: '600', color: c.accent },
  toggleRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chooseRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chooseRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  chooseLink: {
    fontSize: 14,
    fontWeight: '600',
    color: c.accent,
    flexShrink: 1,
  },
  colorRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  colorOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOuterActive: { borderColor: c.accent },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorDotWhite: { borderWidth: 1, borderColor: c.border },
  note: {
    fontSize: 12,
    color: c.textMuted,
    paddingHorizontal: 16,
    paddingBottom: 12,
    lineHeight: 16,
  },
  thresholdBlock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
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
  pressed: { opacity: 0.72 },
  inlineRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: c.textSecondary,
    flexShrink: 0,
  },
  inlineSegments: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  inlineChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
  },
  inlineChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: c.textSecondary,
    textAlign: 'center',
  },
}));
