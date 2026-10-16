import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { PositionControls } from '@/components/editor/position-controls';
import {
  DRAWING_COLORS,
  formatMm,
  type LineElementState,
  type LinePropertyTab,
  type LineStyle,
  normalizeRotation,
} from '@/components/editor/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const TABS: LinePropertyTab[] = ['Regular', 'Position', 'Style'];

const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'slash', 'backslash'];

function Divider() {
  useThemeRefresh();
  return <View style={styles.divider} />;
}

function SectionGap() {
  useThemeRefresh();
  return <View style={styles.sectionGap} />;
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

function LineStylePreview({ style, active }: { style: LineStyle; active?: boolean }) {
  useThemeRefresh();
  const color = active ? C.onAccent : C.textSecondary;
  if (style === 'slash') {
    return <View style={[styles.slashLine, { backgroundColor: color, transform: [{ rotate: '-35deg' }] }]} />;
  }
  if (style === 'backslash') {
    return <View style={[styles.slashLine, { backgroundColor: color, transform: [{ rotate: '35deg' }] }]} />;
  }
  if (style === 'dashed') {
    return (
      <View style={styles.dashedWrap}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.dashSegment, { backgroundColor: color }]} />
        ))}
      </View>
    );
  }
  return <View style={[styles.solidLine, { backgroundColor: color }]} />;
}

function LineStyleRow({
  selected,
  onSelect,
}: {
  selected: LineStyle;
  onSelect: (style: LineStyle) => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.lineStyleBlock}>
      <Text style={styles.rowLabel}>Line Style</Text>
      <View style={styles.lineStyleRow}>
        {LINE_STYLES.map((style) => {
          const active = style === selected;
          return (
            <Pressable
              key={style}
              onPress={() => onSelect(style)}
              style={[styles.lineStyleBtn, active && styles.lineStyleBtnActive]}>
              <LineStylePreview style={style} active={active} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function GraySection({ children }: { children: ReactNode }) {
  useThemeRefresh();
  return <View style={styles.graySection}>{children}</View>;
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

function DimensionSteppers({
  state,
  patch,
}: {
  state: LineElementState;
  patch: (updates: Partial<LineElementState>) => void;
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

type LinePropertyPanelProps = {
  activeTab: LinePropertyTab;
  onTabChange: (tab: LinePropertyTab) => void;
  state: LineElementState;
  patch: (updates: Partial<LineElementState>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
};

export function LinePropertyPanel({
  activeTab, onTabChange, state, patch,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
}: LinePropertyPanelProps) {
  useThemeRefresh();
  const showVirtualInterval = state.lineStyle === 'dashed';

  const styleSection = (
    <>
      <LineStyleRow selected={state.lineStyle} onSelect={(lineStyle) => patch({ lineStyle })} />
      {showVirtualInterval && (
        <>
          <Divider />
          <StepperRow
            label="Virtual Interval"
            value={formatMm(state.virtualInterval)}
            onMinus={() => patch({ virtualInterval: Math.max(0.1, state.virtualInterval - 0.1) })}
            onPlus={() => patch({ virtualInterval: state.virtualInterval + 0.1 })}
          />
        </>
      )}
    </>
  );

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
            {styleSection}
            <SectionGap />
            <GraySection>
              <SegmentRow
                label={`Rotation Angle (${normalizeRotation(state.rotation)}°)`}
                options={['0°', '90°', '180°', '270°'] as const}
                selected={`${normalizeRotation(state.rotation)}°`}
                onSelect={(value) => patch({ rotation: normalizeRotation(parseInt(value, 10)) })}
              />
              <Divider />
              <DimensionSteppers state={state} patch={patch} />
            </GraySection>
            <SectionGap />
            <GraySection>
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
            </GraySection>
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

        {activeTab === 'Style' && styleSection}
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
  sectionGap: { height: 8, backgroundColor: c.fillStrong },
  graySection: { backgroundColor: c.fillStrong },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  segmentChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentChipActive: { backgroundColor: c.accent },
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
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleActive: { borderColor: c.accent, backgroundColor: c.accent },
  stepperSymbol: { fontSize: 18, lineHeight: 20, color: c.textSecondary, fontWeight: '500' },
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
  lineStyleBlock: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lineStyleRow: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  lineStyleBtn: {
    width: 44,
    height: 36,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  lineStyleBtnActive: { backgroundColor: c.accent },
  solidLine: { width: '70%', height: 2, backgroundColor: c.textSecondary, borderRadius: 1 },
  dashedWrap: { width: '70%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dashSegment: { width: 6, height: 2, backgroundColor: c.textSecondary, borderRadius: 1 },
  slashLine: { width: '55%', height: 2, backgroundColor: c.textSecondary, borderRadius: 1 },
  colorRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  colorGroup: { flexDirection: 'row', gap: 8 },
  colorOuter: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  colorOuterActive: { borderWidth: 2, borderColor: c.accent },
  colorDot: { width: 20, height: 20, borderRadius: 10 },
  colorDotWhite: { borderWidth: 1, borderColor: c.border },
  note: { marginTop: 8, marginHorizontal: 16, fontSize: 13, lineHeight: 20, color: c.textMuted },
  positionWrap: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 16 },
  padColumn: { alignItems: 'center', gap: 6 },
  padMiddleRow: { flexDirection: 'row', gap: 6 },
  padBtn: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: { backgroundColor: c.fillStrong },
  alignGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridBtn: {
    width: '22%',
    minWidth: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionActions: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  positionActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 6,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65 },
}));
