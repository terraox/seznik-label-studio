import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LabelDimensionModal } from '@/components/label-dimension-modal';
import { SegmentedControl } from '@/components/new-label/new-label-parts';

import { fromMm, type LabelUnit } from '@/lib/label-geometry';
import { themedStyles, useThemeRefresh } from '@/theme';

export const LABEL_SETUP_PRESETS = [
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

export type LabelSizePreset = {
  /** Chip title. Without it the chip shows the size in millimetres. */
  name?: string;
  width: number;
  height: number;
  /** Nominal inch size, shown as it is in inches (so 100 × 150 mm reads 4 × 6 in, not 3.94 × 5.91). */
  inch?: [number, number];
  label?: string;
};

const UNIT_OPTIONS: { id: LabelUnit; label: string }[] = [
  { id: 'mm', label: 'mm' },
  { id: 'cm', label: 'cm' },
  { id: 'in', label: 'in' },
];

function unitSuffix(unit: LabelUnit): string {
  return unit === 'in' ? 'in' : unit;
}

type LabelSizeSetupSectionProps = {
  widthMm: number;
  heightMm: number;
  unit: LabelUnit;
  onWidthChange: (mm: number) => void;
  onHeightChange: (mm: number) => void;
  /** When set, size presets update width and height in one call (avoids stale half-updates). */
  onSizeChange?: (widthMm: number, heightMm: number) => void;
  onUnitChange: (unit: LabelUnit) => void;
  /** Replaces the default small-label presets, e.g. with shipping label sizes. */
  presets?: LabelSizePreset[];
  /** Shows a mm / cm / in switch, and writes the preset hint, chips and size line in that unit. */
  unitSwitch?: boolean;
  /** Replaces the empty proportion box. The frame keeps the label aspect ratio. */
  preview?: ReactNode;
};

function previewFrameWidth(widthMm: number, heightMm: number): number {
  const max = 220;
  const aspect = widthMm / Math.max(heightMm, 1);
  if (aspect >= 1) return max;
  return Math.max(72, Math.round(max * aspect));
}

export function LabelSizeSetupSection({
  widthMm,
  heightMm,
  unit,
  onWidthChange,
  onHeightChange,
  onSizeChange,
  onUnitChange,
  presets = LABEL_SETUP_PRESETS,
  unitSwitch = false,
  preview,
}: LabelSizeSetupSectionProps) {
  useThemeRefresh();
  const [widthModalVisible, setWidthModalVisible] = useState(false);
  const [heightModalVisible, setHeightModalVisible] = useState(false);

  const applyPreset = (width: number, height: number) => {
    if (onSizeChange) {
      onSizeChange(width, height);
      return;
    }
    onWidthChange(width);
    onHeightChange(height);
  };

  return (
    <>
      <View style={styles.previewPad}>
        <View style={[styles.previewRow, preview ? styles.previewRowLive : null]}>
          <View
            style={[
              styles.previewCell,
              { aspectRatio: widthMm / Math.max(heightMm, 1) },
              preview
                ? {
                    width: previewFrameWidth(widthMm, heightMm),
                    maxWidth: '100%',
                    flex: 0,
                    minHeight: 0,
                    overflow: 'hidden',
                  }
                : null,
            ]}>
            {preview}
          </View>
        </View>
        <Text style={styles.previewHint}>
          {unitSwitch
            ? `${formatDimension(widthMm, unit)} × ${formatDimension(heightMm, unit)} ${unitSuffix(unit)}`
            : `${widthMm} × ${heightMm} mm`}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Size presets</Text>
        {unitSwitch ? (
          <SegmentedControl<LabelUnit> value={unit} onChange={onUnitChange} options={UNIT_OPTIONS} />
        ) : (
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
        )}
        <View style={styles.presetGrid}>
          {presets.map((p) => {
            const active =
              Math.abs(widthMm - p.width) < 0.1 && Math.abs(heightMm - p.height) < 0.1;
            const title = p.name ?? p.label ?? '';
            const sizeLine =
              unit === 'in' && p.inch
                ? `${p.inch[0]} × ${p.inch[1]} in`
                : `${formatDimension(p.width, unit)} × ${formatDimension(p.height, unit)} ${unitSuffix(unit)}`;
            return (
              <Pressable
                key={title}
                onPress={() => applyPreset(p.width, p.height)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.presetChip, active && styles.presetChipActive]}>
                <Text
                  style={[styles.presetChipText, active && styles.presetChipTextActive]}
                  numberOfLines={1}>
                  {title}
                </Text>
                {unitSwitch && p.name ? (
                  <Text style={styles.presetChipSub} numberOfLines={1}>
                    {sizeLine}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Custom size</Text>
        <View style={styles.groupCard}>
          <Pressable
            onPress={() => setWidthModalVisible(true)}
            style={({ pressed }) => [styles.groupRow, pressed && styles.cardPressed]}>
            <Text style={styles.fieldLabel}>Width</Text>
            <View style={styles.fieldValueWrap}>
              <Text style={styles.fieldValueText}>
                {formatDimension(widthMm, unit)} {unitSuffix(unit)}
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
                {formatDimension(heightMm, unit)} {unitSuffix(unit)}
              </Text>
              <Text style={styles.chevronRight}>›</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <LabelDimensionModal
        visible={widthModalVisible}
        title="Set width"
        axis="width"
        valueMm={widthMm}
        otherMm={heightMm}
        unit={unit}
        onUnitChange={onUnitChange}
        onClose={() => setWidthModalVisible(false)}
        onConfirm={onWidthChange}
      />

      <LabelDimensionModal
        visible={heightModalVisible}
        title="Set height"
        axis="height"
        valueMm={heightMm}
        otherMm={widthMm}
        unit={unit}
        onUnitChange={onUnitChange}
        onClose={() => setHeightModalVisible(false)}
        onConfirm={onHeightChange}
      />
    </>
  );
}

const styles = themedStyles((c, scheme) => ({
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
  previewRowLive: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  previewCell: {
    flex: 1,
    maxWidth: 120,
    minHeight: 48,
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (previewCell)
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C8D0D8', // theme-fixed: light preview (previewCell)
  },
  previewHint: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  section: { gap: 8 },
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
  presetChipSub: {
    fontSize: 10,
    color: c.textMuted,
    lineHeight: 13,
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
}));
