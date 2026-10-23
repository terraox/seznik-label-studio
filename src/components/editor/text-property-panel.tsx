import { router } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';

import { ContentTypeRow, SerialBlock } from '@/components/editor/serial-section';
import { FontSlider } from '@/components/editor/font-slider';
import { PositionControls } from '@/components/editor/position-controls';
import { formatDataSourceColumn } from '@/lib/editor/data-source-display';
import { fitFontSizeToLabel } from '@/lib/editor/label-bounds';
import { useSettingsStore } from '@/stores/settings-store';

import {
  DRAWING_COLORS,
  formatMm,
  formatPt,
  formatInt,
  type AutoWrapping,
  type ContentType,
  type EditorElementState,
  type LineSpacing,
  type PropertyTab,
  normalizeRotation,
  type TextAlign,
} from '@/components/editor/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const TABS: PropertyTab[] = ['Regular', 'Position', 'Content', 'Paragraph', 'Font'];
type IconName = AppIconName;

function Divider({ inset = 16 }: { inset?: number }) {
  useThemeRefresh();
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

function SectionGap() {
  useThemeRefresh();
  return <View style={styles.sectionGap} />;
}

const PRESS_HIT_SLOP = 10;

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
              hitSlop={PRESS_HIT_SLOP}
              style={({ pressed }) => [styles.segmentChip, active && styles.segmentChipActive, pressed && styles.pressed]}>
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
          hitSlop={PRESS_HIT_SLOP}
          style={({ pressed }) => [
            styles.stepperCircle,
            minusDisabled && styles.stepperCircleDisabled,
            pressed && !minusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          onPress={onPlus}
          hitSlop={PRESS_HIT_SLOP}
          style={({ pressed }) => [
            styles.stepperCircle,
            styles.stepperCircleActive,
            pressed && styles.pressed,
          ]}>
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
    <Pressable
      onPress={onPress}
      hitSlop={PRESS_HIT_SLOP}
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}>
      <Text style={[styles.rowLabel, styles.navRowLabel]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.navRight}>
        <Text style={styles.navValue} numberOfLines={1}>
          {value}
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
  state: EditorElementState;
  patch: (updates: Partial<EditorElementState & { degreesOffset?: number }>) => void;
}) {
  useThemeRefresh();
  const items = [
    { key: 'bold', label: 'B', style: styles.boldGlyph, active: state.bold, field: 'bold' as const },
    { key: 'italic', label: 'I', style: styles.italicGlyph, active: state.italic, field: 'italic' as const },
    { key: 'underline', label: 'U', style: styles.underlineGlyph, active: state.underline, field: 'underline' as const },
    { key: 'strike', label: 'S', style: styles.strikeGlyph, active: state.strikethrough, field: 'strikethrough' as const },
  ];
  return (
    <View style={styles.styleRow}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => patch({ [item.field]: !item.active })}
          hitSlop={PRESS_HIT_SLOP}
          style={({ pressed }) => [styles.styleBtn, item.active && styles.styleBtnActive, pressed && styles.pressed]}>
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
  state: EditorElementState;
  patch: (updates: Partial<EditorElementState & { degreesOffset?: number }>) => void;
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
          hitSlop={PRESS_HIT_SLOP}
          style={({ pressed }) => [styles.alignBtn, state.align === align && styles.alignBtnActive, pressed && styles.pressed]}>
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
              hitSlop={PRESS_HIT_SLOP}
              style={({ pressed }) => [styles.colorOuter, active && styles.colorOuterActive, pressed && styles.pressed]}>
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

type TextPropertyPanelProps = {
  activeTab: PropertyTab;
  onTabChange: (tab: PropertyTab) => void;
  state: EditorElementState;
  patch: (updates: Partial<EditorElementState & { degreesOffset?: number }>) => void;
  onColumnNamePress?: () => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
  contentFocusRequest?: number;
  /** Table cell editor: hide table/element chrome, keep text + scan controls. */
  panelScope?: 'element' | 'tableCell';
};

export function TextPropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  onColumnNamePress,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
  contentFocusRequest = 0,
  panelScope = 'element',
}: TextPropertyPanelProps) {
  useThemeRefresh();
  const isTableCell = panelScope === 'tableCell';
  const contentInputRef = useRef<TextInput>(null);
  const degreesOffset =
    'degreesOffset' in state && typeof state.degreesOffset === 'number' ? state.degreesOffset : 1;

  const openScan = useCallback(() => {
    router.push({ pathname: '/scan', params: { from: 'edit' } });
  }, []);

  useEffect(() => {
    if (contentFocusRequest > 0 && activeTab === 'Content') {
      requestAnimationFrame(() => contentInputRef.current?.focus());
    }
  }, [activeTab, contentFocusRequest]);

  const handleFitToLabel = useCallback(() => {
    const showColumnName = useSettingsStore.getState().editor.showColumnName;
    const rawText =
      state.contentType === 'Data Source' && state.columnNameContent
        ? formatDataSourceColumn(state.columnNameContent, showColumnName)
        : state.text;
    const targetMaxH = Math.max(2, labelHeightMm - Math.max(0, state.top));
    const fittedFs = fitFontSizeToLabel({
      text: rawText,
      widthMm: state.width,
      maxHeightMm: targetMaxH,
      initialFontSize: state.fontSize,
      autoWrapping: state.autoWrapping,
      lineSpacing: state.lineSpacing,
      charSpacing: state.charSpacing,
      bold: state.bold,
      verticalDisplay: state.verticalDisplay,
    });
    patch({ fontSize: fittedFs });
  }, [state, labelHeightMm, patch]);
  const positionSteppers = (
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
        value={formatMm(elementHeightMm)}
        onMinus={() =>
          patch({
            height: Math.max(0.5, elementHeightMm - 0.1),
            autoTextHeight: false,
          })
        }
        onPlus={() =>
          patch({
            height: elementHeightMm + 0.1,
            autoTextHeight: false,
          })
        }
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
            <Pressable key={tab} onPress={() => onTabChange(tab)} hitSlop={PRESS_HIT_SLOP} style={styles.tabItem}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
              {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabSpacer} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <FormScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
        {activeTab === 'Regular' && (
          <>
            <ContentTypeRow Row={SegmentRow} state={state} patch={patch} seedText={state.text} contentKey="text" />
            <SerialBlock
              state={state}
              patch={patch}
              contentKey="text"
              legacyContent={state.text}
              legacyOffset={degreesOffset}
              legacyStepper={
                <>
                  <Divider />
                  <StepperRow
                    label="Degrees Offset"
                    value={formatInt(degreesOffset)}
                    onMinus={() => patch({ degreesOffset: Math.max(0, degreesOffset - 1) })}
                    onPlus={() => patch({ degreesOffset: degreesOffset + 1 })}
                  />
                </>
              }
            />
            <Divider />
            {state.contentType === 'Data Source' ? (
              <NavRow
                label="Content"
                value={state.columnNameContent || 'Select column'}
                onPress={onColumnNamePress}
              />
            ) : state.contentType === 'Degrees' && state.serial ? null : (
              <View style={styles.contentRow}>
                <Text style={styles.rowLabel}>Content</Text>
                <Pressable
                  onPress={openScan}
                  hitSlop={PRESS_HIT_SLOP}
                  style={({ pressed }) => [pressed && styles.pressed]}>
                  <AppIcon name="viewfinder" tintColor={C.accent} size={22} />
                </Pressable>
              </View>
            )}
            <SectionGap />
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
            {!isTableCell ? (
              <>
                <ToggleRow
                  label="Auto Text Height"
                  value={state.autoTextHeight}
                  onValueChange={(autoTextHeight) => patch({ autoTextHeight })}
                />
                <PanelNote>
                  The frame stays tall enough for every line. Changing the font or the width
                  reflows the text, and nothing is hidden.
                </PanelNote>
                <SectionGap />
              </>
            ) : (
              <SectionGap />
            )}
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
              <View style={styles.rowHeaderWithAction}>
                <Text style={styles.rowLabel}>Font Size</Text>
                <Pressable onPress={handleFitToLabel} hitSlop={PRESS_HIT_SLOP} style={styles.fitChip}>
                  <Text style={styles.fitChipText}>Fit to Label</Text>
                </Pressable>
              </View>
              <FontSlider value={state.fontSize} onChange={(fontSize) => patch({ fontSize })} />
            </View>
            <Divider />
            <View style={styles.block}>
              <Text style={styles.rowLabel}>Font Style</Text>
              <StyleButtons state={state} patch={patch} />
            </View>
            <Divider />
            <View style={styles.block}>
              <Text style={styles.rowLabel}>Hor Alignment</Text>
              <AlignButtons state={state} patch={patch} />
            </View>
            <Divider />
            {!isTableCell ? (
              <>
                <SegmentRow
                  label={`Rotation Angle (${normalizeRotation(state.rotation)}°)`}
                  options={['0°', '90°', '180°', '270°'] as const}
                  selected={`${normalizeRotation(state.rotation)}°`}
                  onSelect={(value) => patch({ rotation: normalizeRotation(parseInt(value, 10)) })}
                />
                <Divider />
                {positionSteppers}
                <SectionGap />
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
              </>
            ) : null}
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
          </>
        )}

        {activeTab === 'Position' && (
          <>
            {!isTableCell ? positionSteppers : null}
            {!isTableCell ? <SectionGap /> : null}
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
          </>
        )}

        {activeTab === 'Content' && (
          <>
            <ContentTypeRow Row={SegmentRow} state={state} patch={patch} seedText={state.text} contentKey="text" />
            <SerialBlock
              state={state}
              patch={patch}
              contentKey="text"
              legacyContent={state.text}
              legacyOffset={degreesOffset}
              legacyStepper={
                <>
                  <Divider />
                  <StepperRow
                    label="Degrees Offset"
                    value={formatInt(degreesOffset)}
                    onMinus={() => patch({ degreesOffset: Math.max(0, degreesOffset - 1) })}
                    onPlus={() => patch({ degreesOffset: degreesOffset + 1 })}
                  />
                </>
              }
            />
            <Divider />
            {state.contentType === 'Data Source' ? (
              <NavRow
                label="Content"
                value={state.columnNameContent || 'Select column'}
                onPress={onColumnNamePress}
              />
            ) : state.contentType === 'Degrees' && state.serial ? null : (
              <>
                <View style={styles.contentRow}>
                  <Text style={styles.rowLabel}>Content</Text>
                  <Pressable
                    onPress={openScan}
                    hitSlop={PRESS_HIT_SLOP}
                    style={({ pressed }) => [pressed && styles.pressed]}>
                    <AppIcon name="viewfinder" tintColor={C.accent} size={22} />
                  </Pressable>
                </View>
                <TextInput
                  ref={contentInputRef}
                  style={styles.contentInput}
                  value={state.text}
                  onChangeText={(text) => patch({ text })}
                  multiline
                  placeholder="Enter label text"
                  placeholderTextColor={C.textMuted}
                />
              </>
            )}
          </>
        )}

        {activeTab === 'Paragraph' && (
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
            {!isTableCell ? (
              <>
                <Divider />
                <ToggleRow
                  label="Auto Text Height"
                  value={state.autoTextHeight}
                  onValueChange={(autoTextHeight) => patch({ autoTextHeight })}
                />
                <View style={styles.noteWrap}>
                  <PanelNote>
                    The frame stays tall enough for every line. Changing the font or the width
                    reflows the text, and nothing is hidden.
                  </PanelNote>
                </View>
              </>
            ) : null}
          </>
        )}

        {activeTab === 'Font' && (
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
            <Divider />
            <View style={styles.block}>
              <Text style={styles.rowLabel}>Hor Alignment</Text>
              <AlignButtons state={state} patch={patch} />
            </View>
          </>
        )}
      </FormScrollView>
    </View>
  );
}

const styles = themedStyles((c) => ({
  panel: {
    flex: 1,
    backgroundColor: c.surface,
  },
  tabScroll: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  tabContent: {
    paddingHorizontal: 2,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingTop: 10,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    color: c.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: c.accent,
    fontWeight: '600',
  },
  tabIndicator: {
    marginTop: 8,
    width: '100%',
    minWidth: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.accent,
  },
  tabSpacer: {
    marginTop: 8,
    height: 3,
  },
  body: {
    flex: 1,
    backgroundColor: c.surface,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  block: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: c.textSecondary,
    lineHeight: 20,
    includeFontPadding: false,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      default: {},
    }),
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
  },
  sectionGap: {
    height: 8,
    backgroundColor: c.fillStrong,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  segmentChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentChipActive: {
    backgroundColor: c.accent,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    textAlign: 'center',
  },
  segmentTextActive: {
    color: c.onAccent,
  },
  stepperRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleActive: {
    borderColor: c.accent,
    backgroundColor: c.accent,
  },
  stepperCircleDisabled: {
    borderColor: c.hairline,
    backgroundColor: c.fill,
  },
  stepperSymbol: {
    fontSize: 18,
    lineHeight: 20,
    color: c.textSecondary,
    fontWeight: '500',
  },
  stepperSymbolActive: {
    color: c.onAccent,
  },
  stepperSymbolDisabled: {
    color: c.textDisabled,
  },
  stepperValue: {
    minWidth: 72,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: c.accent,
    flexShrink: 1,
  },
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
  pressed: {
    opacity: 0.75,
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
  navRowLabel: {
    flexShrink: 0,
    maxWidth: '42%',
  },
  navRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    minWidth: 0,
  },
  navValue: {
    flexShrink: 1,
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'right',
  },
  styleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  styleBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleBtnActive: {
    backgroundColor: c.accent,
  },
  styleBtnText: {
    fontSize: 16,
    color: c.textSecondary,
    fontWeight: '600',
  },
  styleBtnTextActive: {
    color: c.onAccent,
  },
  boldGlyph: {
    fontWeight: '800',
  },
  italicGlyph: {
    fontStyle: 'italic',
  },
  underlineGlyph: {
    textDecorationLine: 'underline',
  },
  strikeGlyph: {
    textDecorationLine: 'line-through',
  },
  alignRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  alignBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alignBtnActive: {
    backgroundColor: c.accent,
  },
  colorRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  colorGroup: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    flexShrink: 1,
    marginLeft: 'auto',
  },
  colorOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOuterActive: {
    borderWidth: 2,
    borderColor: c.accent,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  colorDotWhite: {
    borderWidth: 1,
    borderColor: c.border,
  },
  note: {
    marginTop: 8,
    marginHorizontal: 16,
    fontSize: 13,
    lineHeight: 20,
    color: c.textMuted,
  },
  noteWrap: {
    backgroundColor: c.fillStrong,
    paddingBottom: 16,
    marginTop: 8,
  },
  positionWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  padColumn: {
    alignItems: 'center',
    gap: 6,
  },
  padMiddleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  padBtn: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: {
    backgroundColor: c.fillStrong,
  },
  alignGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridBtn: {
    width: '22%',
    minWidth: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  positionActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 6,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowHeaderWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fitChip: {
    backgroundColor: c.fillStrong,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fitChipText: {
    color: c.link,
    fontSize: 11,
    fontWeight: '700',
  },
}));
