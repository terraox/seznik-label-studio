import { router } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { FontSlider } from '@/components/editor/font-slider';
import { PositionControls } from '@/components/editor/position-controls';
import {
  DRAWING_COLORS,
  formatInt,
  formatMm,
  formatPt,
  type AutoWrapping,
  type ContentType,
  type DegreesElementState,
  type LineSpacing,
  type PropertyTab,
  normalizeRotation,
  type TextAlign,
} from '@/components/editor/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const TABS: PropertyTab[] = ['Regular', 'Position', 'Content', 'Paragraph', 'Font'];
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
  minusDisabled,
}: {
  label: string;
  value: string;
  onMinus?: () => void;
  onPlus?: () => void;
  minusDisabled?: boolean;
}) {
  useThemeRefresh();
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          disabled={minusDisabled}
          onPress={onMinus}
          style={[styles.stepperCircle, minusDisabled && styles.stepperCircleDisabled]}>
          <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
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

function ContentValueRow({ value }: { value: string }) {
  useThemeRefresh();
  return (
    <View style={styles.contentRow}>
      <Text style={styles.rowLabel}>Content</Text>
      <View style={styles.contentRight}>
        <Text style={styles.contentValue}>{value}</Text>
        <AppIcon name="viewfinder" tintColor={C.accent} size={22} />
      </View>
    </View>
  );
}

function StyleButtons({
  state,
  patch,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
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

function AlignButtons({
  state,
  patch,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
}) {
  useThemeRefresh();
  const icons: { icon: IconName; align: TextAlign }[] = [
    { icon: 'text.alignleft', align: 'left' },
    { icon: 'text.aligncenter', align: 'center' },
    { icon: 'text.alignright', align: 'right' },
    { icon: 'text.justify', align: 'justify' },
    { icon: 'arrow.left.and.right', align: 'spacing' },
  ];
  return (
    <View style={styles.alignRow}>
      {icons.map(({ icon, align }) => (
        <Pressable
          key={align}
          onPress={() => patch({ align })}
          style={[styles.alignBtn, state.align === align && styles.alignBtnActive]}>
          <AppIcon name={icon} tintColor={state.align === align ? C.onAccent : C.textSecondary} size={16} />
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
  contentInputRef,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  onColumnNamePress?: () => void;
  contentInputRef?: React.RefObject<TextInput | null>;
}) {
  useThemeRefresh();
  return (
    <>
      <SegmentRow
        label="Content Type"
        options={['Manual', 'Degrees', 'Data Source'] as const}
        selected={state.contentType}
        onSelect={(contentType: ContentType) => patch({ contentType })}
      />
      {state.contentType === 'Degrees' && (
        <>
          <Divider />
          <StepperRow
            label="Degrees Offset"
            value={formatInt(state.degreesOffset)}
            onMinus={() => patch({ degreesOffset: Math.max(0, state.degreesOffset - 1) })}
            onPlus={() => patch({ degreesOffset: state.degreesOffset + 1 })}
          />
        </>
      )}
      <Divider />
      {state.contentType === 'Data Source' ? (
        <NavRow label="Content" value={state.columnNameContent} onPress={onColumnNamePress} />
      ) : (
        <>
          <View style={styles.contentRow}>
            <Text style={styles.rowLabel}>Content</Text>
            <Pressable onPress={() => router.push('/scan')} hitSlop={8}>
              <AppIcon name="viewfinder" tintColor={C.accent} size={22} />
            </Pressable>
          </View>
          <TextInput
            ref={contentInputRef}
            style={styles.contentInput}
            value={state.content}
            onChangeText={(content) => patch({ content })}
            multiline
            placeholder="Enter serial / degrees content"
            placeholderTextColor={C.textMuted}
          />
        </>
      )}
    </>
  );
}

function ParagraphSection({
  state,
  patch,
  showNote = true,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  showNote?: boolean;
}) {
  useThemeRefresh();
  return (
    <>
      <StepperRow
        label="Char Spacing"
        value={formatMm(state.charSpacing)}
        onMinus={() => patch({ charSpacing: Math.max(0, state.charSpacing - 0.05) })}
        onPlus={() => patch({ charSpacing: state.charSpacing + 0.05 })}
        minusDisabled={state.charSpacing <= 0}
      />
      <Divider />
      <SegmentRow
        label="Line Spacing"
        options={['1.0', '1.5', '2.0', 'Custom'] as const}
        selected={state.lineSpacing}
        onSelect={(lineSpacing: LineSpacing) => patch({ lineSpacing })}
      />
      <Divider />
      <SegmentRow
        label="Auto Wrapping"
        options={['Close', 'Char', 'Word'] as const}
        selected={state.autoWrapping}
        onSelect={(autoWrapping: AutoWrapping) => patch({ autoWrapping })}
      />
      <Divider />
      <ToggleRow
        label="Vertical Display"
        value={state.verticalDisplay}
        onValueChange={(verticalDisplay) => patch({ verticalDisplay })}
      />
      <Divider />
      <ToggleRow
        label="Auto Text Height"
        value={state.autoTextHeight}
        onValueChange={(autoTextHeight) => patch({ autoTextHeight })}
      />
      {showNote && (
        <PanelNote>
          After &apos;Auto Calculate Height&apos; turn off, if the height is too low, the text will be reduced to
          fit the height.
        </PanelNote>
      )}
    </>
  );
}

function FontSection({
  state,
  patch,
  includeAlignment = true,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  includeAlignment?: boolean;
}) {
  useThemeRefresh();
  return (
    <>
      <NavRow label="Font" value={state.fontFamily} onPress={() => router.push({ pathname: '/font-library', params: { from: 'edit' } })} />
      <Divider />
      <StepperRow
        label="Font Size"
        value={formatPt(state.fontSize)}
        onMinus={() => patch({ fontSize: Math.max(6, state.fontSize - 0.5) })}
        onPlus={() => patch({ fontSize: Math.min(72, state.fontSize + 0.5) })}
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
      {includeAlignment && (
        <>
          <Divider />
          <View style={styles.block}>
            <Text style={styles.rowLabel}>Hor Alignment</Text>
            <AlignButtons state={state} patch={patch} />
          </View>
        </>
      )}
    </>
  );
}

type DegreesPropertyPanelProps = {
  activeTab: PropertyTab;
  onTabChange: (tab: PropertyTab) => void;
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  onColumnNamePress?: () => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
  contentFocusRequest?: number;
};

export function DegreesPropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  onColumnNamePress,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
  contentFocusRequest = 0,
}: DegreesPropertyPanelProps) {
  useThemeRefresh();
  const contentInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (contentFocusRequest > 0 && activeTab === 'Content') {
      requestAnimationFrame(() => contentInputRef.current?.focus());
    }
  }, [activeTab, contentFocusRequest]);

  const contentSection = (
    <ContentSection
      state={state}
      patch={patch}
      onColumnNamePress={onColumnNamePress}
      contentInputRef={contentInputRef}
    />
  );
  const paragraphSection = <ParagraphSection state={state} patch={patch} />;
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
            {contentSection}
            <SectionGap />
            {paragraphSection}
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
            textAlign={state.align}
            onPatch={patch}
          />
        )}

        {activeTab === 'Content' && contentSection}

        {activeTab === 'Paragraph' && (
          <>
            <ParagraphSection state={state} patch={patch} showNote={false} />
            <View style={styles.noteWrap}>
              <PanelNote>
                After &apos;Auto Calculate Height&apos; turn off, if the height is too low, the text will be reduced
                to fit the height.
              </PanelNote>
            </View>
          </>
        )}

        {activeTab === 'Font' && fontSection}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles((c) => ({
  panel: { flex: 1, backgroundColor: c.surface },
  tabScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
  tabContent: { paddingHorizontal: 2 },
  tabItem: { paddingHorizontal: 14, paddingTop: 10, alignItems: 'center' },
  tabText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  tabTextActive: { color: c.accent, fontWeight: '600' },
  tabIndicator: {
    marginTop: 8,
    width: '100%',
    minWidth: 32,
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
  stepperCircleDisabled: { borderColor: c.hairline, backgroundColor: c.fill },
  stepperSymbol: { fontSize: 18, lineHeight: 20, color: c.textSecondary, fontWeight: '500' },
  stepperSymbolActive: { color: c.onAccent },
  stepperSymbolDisabled: { color: c.textDisabled },
  stepperValue: { minWidth: 72, textAlign: 'center', fontSize: 14, fontWeight: '600', color: c.accent },
  toggleRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contentValue: { fontSize: 14, color: c.textSecondary, fontWeight: '500' },
  contentInput: {
    marginHorizontal: 16,
    marginBottom: 16,
    minHeight: 88,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.fill,
    textAlignVertical: 'top',
  },
  navRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '55%' },
  navValue: { fontSize: 14, color: c.textSecondary },
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
  styleBtnText: { fontSize: 16, color: c.textSecondary, fontWeight: '600' },
  styleBtnTextActive: { color: c.onAccent },
  boldGlyph: { fontWeight: '800' },
  italicGlyph: { fontStyle: 'italic' },
  underlineGlyph: { textDecorationLine: 'underline' },
  strikeGlyph: { textDecorationLine: 'line-through' },
  alignRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  alignBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alignBtnActive: { backgroundColor: c.accent },
  sliderBlock: { marginTop: 10, position: 'relative' },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: c.fillStrong,
    overflow: 'visible',
    position: 'relative',
  },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: c.accent, borderRadius: 2 },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  sliderTicks: { flexDirection: 'row', marginTop: 4 },
  sliderTickHit: { flex: 1, height: 24 },
  colorRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorGroup: { flexDirection: 'row', gap: 8 },
  colorOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOuterActive: { borderWidth: 2, borderColor: c.accent },
  colorDot: { width: 22, height: 22, borderRadius: 11 },
  colorDotWhite: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  note: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 17,
    color: c.textMuted,
  },
  noteWrap: { backgroundColor: c.fillStrong },
  positionWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
    backgroundColor: c.fillStrong,
  },
  padColumn: { alignItems: 'center', gap: 6 },
  padMiddleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  padBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: { backgroundColor: c.surface },
  alignGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridBtn: {
    width: '22%',
    aspectRatio: 1,
    minWidth: 44,
    maxWidth: 52,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    backgroundColor: c.fillStrong,
  },
  positionActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
}));
