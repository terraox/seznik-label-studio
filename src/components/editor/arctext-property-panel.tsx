import { router } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';

import { ContentTypeRow, SerialBlock } from '@/components/editor/serial-section';
import { FontSlider } from '@/components/editor/font-slider';
import { PositionControls } from '@/components/editor/position-controls';
import {
  DRAWING_COLORS,
  formatInt,
  formatMm,
  formatPt,
  type ArcTextElementState,
  type ArcTextPropertyTab,
  type ContentType,
  normalizeRotation,
} from '@/components/editor/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const TABS: ArcTextPropertyTab[] = ['Regular', 'Position', 'Content', 'Style', 'Font'];
type IconName = AppIconName;

function Divider() {
  useThemeRefresh();
  return <View style={styles.divider} />;
}

function SectionGap() {
  useThemeRefresh();
  return <View style={styles.sectionGap} />;
}

function GraySection({ children }: { children: ReactNode }) {
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

function NavRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  useThemeRefresh();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.navRight}>
        <Text style={styles.navValue} numberOfLines={1}>
          {value || ' '}
        </Text>
        <AppIcon name="chevron.right" tintColor={C.textDisabled} size={14} weight="semibold" />
      </View>
    </Pressable>
  );
}

function StyleButtons({
  state,
  patch,
}: {
  state: ArcTextElementState;
  patch: (updates: Partial<ArcTextElementState>) => void;
}) {
  useThemeRefresh();
  const items = [
    { key: 'bold', label: 'B', style: styles.boldGlyph, active: state.bold, field: 'bold' as const },
    { key: 'italic', label: 'I', style: styles.italicGlyph, active: state.italic, field: 'italic' as const },
    {
      key: 'underline',
      label: 'U',
      style: styles.underlineGlyph,
      active: state.underline,
      field: 'underline' as const,
    },
    {
      key: 'strike',
      label: 'S',
      style: styles.strikeGlyph,
      active: state.strikethrough,
      field: 'strikethrough' as const,
    },
  ];
  return (
    <View style={styles.styleRow}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => patch({ [item.field]: !item.active })}
          style={[styles.styleBtn, item.active && styles.styleBtnActive]}>
          <Text style={[styles.styleBtnText, item.style, item.active && styles.styleBtnTextActive]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
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

function ContentSection({
  state,
  patch,
  onColumnNamePress,
}: {
  state: ArcTextElementState;
  patch: (updates: Partial<ArcTextElementState>) => void;
  onColumnNamePress?: () => void;
}) {
  useThemeRefresh();
  return (
    <>
      <ContentTypeRow Row={SegmentRow} state={state} patch={patch} seedText={state.text} />
      <SerialBlock
        state={state}
        patch={patch}
        legacyContent={state.text}
        legacyOffset={state.degreesOffset}
        legacyStepper={
          <>
            <Divider />
            <StepperRow
              label="Degrees Offset"
              value={formatInt(state.degreesOffset)}
              onMinus={() => patch({ degreesOffset: Math.max(0, state.degreesOffset - 1) })}
              onPlus={() => patch({ degreesOffset: state.degreesOffset + 1 })}
            />
          </>
        }
      />
      <Divider />
      {state.contentType === 'Data Source' ? (
        <NavRow label="Content" value={state.columnNameContent} onPress={onColumnNamePress} />
      ) : state.contentType === 'Degrees' && state.serial ? null : (
        <>
          <View style={styles.contentRow}>
            <Text style={styles.rowLabel}>Content</Text>
          </View>
          <TextInput
            style={styles.contentInput}
            value={state.text}
            onChangeText={(text) => patch({ text })}
            placeholder="Enter arc text"
            placeholderTextColor={C.textMuted}
          />
        </>
      )}
    </>
  );
}

function FontSection({
  state,
  patch,
}: {
  state: ArcTextElementState;
  patch: (updates: Partial<ArcTextElementState>) => void;
}) {
  useThemeRefresh();
  return (
    <>
      <NavRow label="Font" value={state.fontFamily} onPress={() => router.push({ pathname: '/font-library', params: { from: 'edit' } })} />
      <Divider />
      <StepperRow
        label="Font Size"
        value={formatPt(state.fontSize)}
        onMinus={() => patch({ fontSize: Math.max(4, state.fontSize - 0.5) })}
        onPlus={() => patch({ fontSize: Math.min(24, state.fontSize + 0.5) })}
      />
      <Divider />
      <View style={styles.block}>
        <Text style={styles.rowLabel}>Font Size</Text>
        <FontSlider value={state.fontSize} onChange={(fontSize) => patch({ fontSize })} />
      </View>
      <Divider />
      <View style={styles.block}>
        <Text style={styles.rowLabel}>Font Style</Text>
        <StyleButtons state={state} patch={patch} />
      </View>
    </>
  );
}

type ArcTextPropertyPanelProps = {
  activeTab: ArcTextPropertyTab;
  onTabChange: (tab: ArcTextPropertyTab) => void;
  state: ArcTextElementState;
  patch: (updates: Partial<ArcTextElementState>) => void;
  onColumnNamePress?: () => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
};

export function ArcTextPropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  onColumnNamePress,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
}: ArcTextPropertyPanelProps) {
  useThemeRefresh();
  const contentSection = (
    <ContentSection state={state} patch={patch} onColumnNamePress={onColumnNamePress} />
  );

  const lineWidthRow = (
    <StepperRow
      label="Line Width"
      value={formatMm(state.lineWidth)}
      onMinus={() => patch({ lineWidth: Math.max(0.1, state.lineWidth - 0.05) })}
      onPlus={() => patch({ lineWidth: state.lineWidth + 0.05 })}
    />
  );

  const fontSection = <FontSection state={state} patch={patch} />;

  const dimensionSteppers = (
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
        onMinus={() => patch({ width: Math.max(0.5, state.width - 0.1) })}
        onPlus={() => patch({ width: state.width + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Height"
        value={formatMm(state.height)}
        onMinus={() => patch({ height: Math.max(0.5, state.height - 0.1) })}
        onPlus={() => patch({ height: state.height + 0.1 })}
      />
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

      <FormScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
        {activeTab === 'Regular' && (
          <>
            {contentSection}
            <SectionGap />
            {lineWidthRow}
            <SectionGap />
            {fontSection}
            <SectionGap />
            <GraySection>
              <SegmentRow
                label={`Rotation Angle (${normalizeRotation(state.rotation)}°)`}
                options={['0°', '90°', '180°', '270°'] as const}
                selected={`${normalizeRotation(state.rotation)}°`}
                onSelect={(value) => patch({ rotation: normalizeRotation(parseInt(value, 10)) })}
              />
              <Divider />
              {dimensionSteppers}
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
              <ToggleRow
                label="Anti-Color"
                value={state.antiColor}
                onValueChange={(antiColor) => patch({ antiColor })}
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

        {activeTab === 'Content' && contentSection}

        {activeTab === 'Style' && lineWidthRow}

        {activeTab === 'Font' && fontSection}
      </FormScrollView>
    </View>
  );
}

const styles = themedStyles((c) => ({
  panel: { flex: 1, backgroundColor: c.surface },
  tabScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
  tabContent: { paddingHorizontal: 2 },
  tabItem: { paddingHorizontal: 12, paddingTop: 10, alignItems: 'center' },
  tabText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  tabTextActive: { color: c.accent, fontWeight: '600' },
  tabIndicator: {
    marginTop: 8,
    width: '100%',
    minWidth: 24,
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
  navRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: '55%' },
  navValue: { fontSize: 14, color: c.textMuted, flexShrink: 1, textAlign: 'right' },
  contentRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentInput: {
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 48,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.fill,
  },
  styleRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  styleBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleBtnActive: { backgroundColor: c.accent },
  styleBtnText: { fontSize: 16, fontWeight: '600', color: c.textSecondary },
  styleBtnTextActive: { color: c.onAccent },
  boldGlyph: { fontWeight: '700' },
  italicGlyph: { fontStyle: 'italic' },
  underlineGlyph: { textDecorationLine: 'underline' },
  strikeGlyph: { textDecorationLine: 'line-through' },
  sliderBlock: { marginTop: 10, paddingBottom: 4 },
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
  sliderTickHit: { flex: 1 },
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
