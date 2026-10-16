import { Image } from 'expo-image';
import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { TextInput } from '@/components/ui/text-input';
import { fmtMm, sanitizeNumberText, type Shape } from '@/lib/new-label-form';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const PREVIEW_MAX_W = 280;
const PREVIEW_MAX_H = 150;

/** Live outline of the label: its real shape and proportions, N cells with the gap, and the mm on its edges. */
export function LabelPreview({
  shape,
  columns,
  cellW,
  cellH,
  gap,
  imageUri,
}: {
  shape: Shape;
  columns: number;
  /** Null while the field is empty or invalid: a placeholder size is drawn. */
  cellW: number | null;
  cellH: number | null;
  gap: number;
  imageUri?: string | null;
}) {
  useThemeRefresh();
  const w = cellW ?? 50;
  const h = cellH ?? 30;
  const n = Math.max(1, columns);
  const g = Math.max(0, gap);
  const totalMm = w * n + g * (n - 1);
  const scale = Math.min(PREVIEW_MAX_W / Math.max(totalMm, 1), PREVIEW_MAX_H / Math.max(h, 1));
  const cw = Math.max(6, w * scale);
  const ch = Math.max(6, h * scale);
  const gp = g * scale;
  const round = shape === 'circle';
  const valid = cellW != null && cellH != null;

  return (
    <View style={styles.previewPad} accessibilityRole="image" accessibilityLabel={`Label preview, ${fmtMm(w)} by ${fmtMm(h)} millimetres`}>
      <View style={styles.previewBody}>
        <View>
          <View style={styles.previewRow}>
            {Array.from({ length: n }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.previewCell,
                  { width: cw, height: ch, marginRight: i < n - 1 ? gp : 0, opacity: valid ? 1 : 0.5 },
                  round && { borderRadius: Math.min(cw, ch) / 2 },
                ]}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFillObject} contentFit="contain" />
                ) : n > 1 ? (
                  <Text style={styles.previewCellLabel}>{i + 1}</Text>
                ) : null}
              </View>
            ))}
          </View>
          <Text style={styles.dimBottom}>{valid ? `${fmtMm(n > 1 ? totalMm : w)} mm` : '- mm'}</Text>
        </View>
      </View>
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            disabled={o.disabled}
            onPress={() => onChange(o.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: o.disabled }}
            style={({ pressed }) => [styles.segmentItem, on && styles.segmentOn, o.disabled && styles.dim, pressed && styles.pressed]}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const NumberField = forwardRef<
  import('react-native').TextInput,
  {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    error?: string;
    suffix?: string;
    returnKeyType?: 'next' | 'done';
    onSubmitEditing?: () => void;
    editable?: boolean;
  }
>(function NumberField(
  { label, value, onChangeText, error, suffix = 'mm', returnKeyType = 'next', onSubmitEditing, editable = true },
  ref,
) {
  useThemeRefresh();
  const [touched, setTouched] = useState(false);
  const showError = touched && Boolean(error);
  return (
    <View style={styles.fieldWrap}>
      <View style={[styles.fieldRow, showError && styles.fieldRowError]}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldInputWrap}>
          <TextInput
            ref={ref}
            value={value}
            editable={editable}
            onChangeText={(t) => onChangeText(sanitizeNumberText(t))}
            onBlur={() => setTouched(true)}
            keyboardType="decimal-pad"
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            blurOnSubmit={returnKeyType === 'done'}
            accessibilityLabel={`${label} in millimetres`}
            placeholder="0"
            placeholderTextColor={C.textMuted}
            style={styles.fieldInput}
          />
          <Text style={styles.fieldSuffix}>{suffix}</Text>
        </View>
      </View>
      {showError ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
});

export function StepperRow({
  label,
  valueText,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  chips,
  disabled,
}: {
  label: string;
  valueText: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  chips?: { text: string; active: boolean; onPress: () => void }[];
  disabled?: boolean;
}) {
  useThemeRefresh();
  return (
    <View style={[styles.stepWrap, disabled && styles.dim]}>
      <View style={styles.stepRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.stepper}>
          <Pressable
            disabled={disabled || minusDisabled}
            onPress={onMinus}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${label}`}
            style={({ pressed }) => [styles.stepBtn, (disabled || minusDisabled) && styles.dim, pressed && styles.pressed]}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepValue}>{valueText}</Text>
          <Pressable
            disabled={disabled || plusDisabled}
            onPress={onPlus}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${label}`}
            style={({ pressed }) => [styles.stepBtn, (disabled || plusDisabled) && styles.dim, pressed && styles.pressed]}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      </View>
      {chips ? (
        <View style={styles.chipRow}>
          {chips.map((c) => (
            <Pressable
              key={c.text}
              disabled={disabled}
              onPress={c.onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: c.active }}
              style={({ pressed }) => [styles.chip, c.active && styles.chipOn, pressed && styles.pressed]}>
              <Text style={[styles.chipText, c.active && styles.chipTextOn]}>{c.text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function CollapsibleBar({
  title,
  value,
  open,
  onToggle,
  children,
}: {
  title: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  useThemeRefresh();
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={value ? `${title}, ${value}` : title}
        style={({ pressed }) => [styles.barHead, pressed && styles.pressed]}>
        <Text style={styles.fieldLabel}>{title}</Text>
        <View style={styles.barRight}>
          {value ? (
            <Text style={styles.barValue} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
            <AppIcon name="chevron.right" size={16} tintColor={C.textSecondary} />
          </View>
        </View>
      </Pressable>
      {open ? <View style={styles.barBody}>{children}</View> : null}
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  previewPad: {
    backgroundColor: scheme === 'light' ? '#D5DCE4' : c.canvasArea, // theme-fixed: light keeps its grey stage around the white label
    borderRadius: 10,
    minHeight: 150,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  previewRow: { flexDirection: 'row' },
  previewCell: {
    backgroundColor: '#FFFFFF', // theme-fixed: label paper is white in both themes
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C8D0D8', // theme-fixed: label edge on the light stage
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewCellLabel: {
    color: '#94A3B8', // theme-fixed: cell number on white paper
    fontSize: 13,
    fontWeight: '600',
  },
  dimBottom: { marginTop: 6, textAlign: 'center', fontSize: 12, fontWeight: '600', color: c.textSecondary },
  segment: {
    flexDirection: 'row',
    backgroundColor: c.fill,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  segmentItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentOn: { backgroundColor: c.accentFill },
  segmentText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  segmentTextOn: { color: c.onAccent },
  fieldWrap: { gap: 4 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  fieldRowError: { borderColor: c.danger },
  fieldLabel: { color: c.text, fontSize: 15, fontWeight: '500', flexShrink: 1 },
  fieldInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldInput: {
    minWidth: 80,
    minHeight: 44,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '600',
    color: c.text,
    paddingVertical: 6,
  },
  fieldSuffix: { fontSize: 14, color: c.textMuted, width: 26 },
  fieldError: { fontSize: 12, color: c.danger, marginLeft: 4 },
  stepWrap: { gap: 8 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: c.text, lineHeight: 22 },
  stepValue: { minWidth: 40, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.text },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    minWidth: 52,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
  chipText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  chipTextOn: { color: c.accent },
  card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.hairline, overflow: 'hidden' },
  barHead: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  barValue: { fontSize: 14, color: c.textSecondary, flexShrink: 1 },
  barBody: { paddingHorizontal: 12, paddingBottom: 12 },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
}));
