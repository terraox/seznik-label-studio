import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LabelDimensionModal } from '@/components/label-dimension-modal';
import { LABEL_SETUP_PRESETS } from '@/components/label-size-setup-section';

import { fromMm, MAX_LABEL_MM, MIN_LABEL_MM, type LabelUnit } from '@/lib/label-geometry';
import { themedStyles, useThemeRefresh } from '@/theme';

function formatDimension(mm: number, unit: LabelUnit): string {
  const v = fromMm(mm, unit);
  if (unit === 'cm') return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

type LabelSizeEditorProps = {
  widthMm: number;
  heightMm: number;
  onChange: (widthMm: number, heightMm: number) => void;
};

/**
 * Common sizes in a fixed grid, then Width and Height rows that open the same dimension popup
 * as New label (the unit is chosen inside that popup).
 */
export function LabelSizeEditor({ widthMm, heightMm, onChange }: LabelSizeEditorProps) {
  useThemeRefresh();
  const [unit, setUnit] = useState<LabelUnit>('mm');
  const [widthModalVisible, setWidthModalVisible] = useState(false);
  const [heightModalVisible, setHeightModalVisible] = useState(false);

  return (
    <View style={styles.root}>
      <View style={styles.presetGrid}>
        {LABEL_SETUP_PRESETS.map((preset) => {
          const on = Math.abs(widthMm - preset.width) < 0.1 && Math.abs(heightMm - preset.height) < 0.1;
          return (
            <Pressable
              key={preset.label}
              onPress={() => onChange(preset.width, preset.height)}
              style={[styles.presetChip, on && styles.presetChipOn]}>
              <Text style={[styles.presetText, on && styles.presetTextOn]} numberOfLines={1}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.groupCard}>
        <Pressable
          onPress={() => setWidthModalVisible(true)}
          style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}>
          <Text style={styles.fieldLabel}>Width</Text>
          <View style={styles.valueWrap}>
            <Text style={styles.valueText}>
              {formatDimension(widthMm, unit)} {unit}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          onPress={() => setHeightModalVisible(true)}
          style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}>
          <Text style={styles.fieldLabel}>Height</Text>
          <View style={styles.valueWrap}>
            <Text style={styles.valueText}>
              {formatDimension(heightMm, unit)} {unit}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.bounds}>
        Allowed range: {MIN_LABEL_MM}–{MAX_LABEL_MM} mm
      </Text>

      <LabelDimensionModal
        visible={widthModalVisible}
        title="Set width"
        axis="width"
        valueMm={widthMm}
        otherMm={heightMm}
        unit={unit}
        onUnitChange={setUnit}
        onClose={() => setWidthModalVisible(false)}
        onConfirm={(mm) => onChange(mm, heightMm)}
      />
      <LabelDimensionModal
        visible={heightModalVisible}
        title="Set height"
        axis="height"
        valueMm={heightMm}
        otherMm={widthMm}
        unit={unit}
        onUnitChange={setUnit}
        onClose={() => setHeightModalVisible(false)}
        onConfirm={(mm) => onChange(widthMm, mm)}
      />
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { gap: 12 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    width: '31.5%',
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: c.fill,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
  presetText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, textAlign: 'center' },
  presetTextOn: { color: c.accent },
  groupCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.hairline,
  },
  groupRow: {
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: 14 },
  fieldLabel: { color: c.text, fontSize: 15, fontWeight: '500' },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valueText: { color: c.textSecondary, fontSize: 14 },
  chevron: { color: c.textMuted, fontSize: 22, fontWeight: '300' },
  bounds: { fontSize: 12, color: c.textMuted },
  pressed: { opacity: 0.7 },
}));
