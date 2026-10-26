import { type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { cardElevation, makeStyles, useColors, useScheme } from '@/theme';

const SETTINGS_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;
const SETTINGS_CHIP_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

export function SettingsScreenShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);

  return (
    <View style={styles.root}>
      <SettingsStackHeader title={title} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingTop: Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}>
        <View style={{ width: contentWidth, maxWidth: MaxContentWidth, gap: Spacing.three }}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.card}>{children}</View>;
}

export function SettingsDivider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

export function SettingsNavRow({ label, onPress }: { label: string; onPress?: () => void }) {
  const c = useColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={SETTINGS_HIT_SLOP}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.navRow, pressed && onPress && styles.pressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <AppIcon name="chevron.right" tintColor={c.textDisabled} size={14} weight="semibold" />
    </Pressable>
  );
}

export function SettingsToggleRow({
  label,
  value,
  onValueChange,
  showDivider,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  showDivider?: boolean;
}) {
  const c = useColors();
  const styles = useStyles();
  return (
    <>
      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => onValueChange(!value)}
          hitSlop={SETTINGS_HIT_SLOP}
          style={styles.toggleLabelPress}
          android_ripple={androidRipple}>
          <Text style={styles.toggleLabel} numberOfLines={2}>
            {label}
          </Text>
        </Pressable>
        <View style={styles.switchWrap}>
          <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: c.border, true: c.accent }}
            thumbColor="#FFFFFF" // theme-fixed: white thumb in both themes
            ios_backgroundColor={c.border}
          />
        </View>
      </View>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsValueRow({
  label,
  value,
  onPress,
  showDivider,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  const c = useColors();
  const styles = useStyles();
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.valueRow, pressed && onPress && styles.pressed]}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.valueRight}>
          <Text style={styles.valueText}>{value}</Text>
          <AppIcon name="chevron.right" tintColor={c.textDisabled} size={14} weight="semibold" />
        </View>
      </Pressable>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsStatusRow({
  label,
  enabled,
  onPress,
  showDivider,
}: {
  label: string;
  enabled: boolean;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  const c = useColors();
  const styles = useStyles();
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.valueRow, pressed && onPress && styles.pressed]}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.valueRight}>
          <Text style={[styles.statusText, enabled ? styles.statusEnabled : styles.statusDisabled]}>
            {enabled ? 'Enabled' : 'Not Enabled'}
          </Text>
          <AppIcon name="chevron.right" tintColor={c.textDisabled} size={14} weight="semibold" />
        </View>
      </Pressable>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsRadioRow({
  label,
  value,
  selected,
  onPress,
  showDivider,
}: {
  label: string;
  value: string;
  selected: boolean;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const c = useColors();
  const styles = useStyles();
  return (
    <>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.radioRow, pressed && styles.pressed]}>
        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected ? <View style={styles.radioInner} /> : null}
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.cacheValue}>{value}</Text>
        <AppIcon name="chevron.right" tintColor={c.textDisabled} size={14} weight="semibold" />
      </Pressable>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsToggleGroup({
  label,
  value,
  onValueChange,
  description,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  description?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.toggleGroup}>
      <SettingsCard>
        <SettingsToggleRow label={label} value={value} onValueChange={onValueChange} />
      </SettingsCard>
      {description ? <SettingsNote>{description}</SettingsNote> : null}
    </View>
  );
}

export function SettingsNote({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.note}>{children}</Text>;
}

export function SettingsSectionLabel({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function SettingsSegmentGroup<T extends string>({
  options,
  selected,
  onSelect,
  badgeFor,
  labelFor,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  badgeFor?: (value: T) => string | null;
  labelFor?: (value: T) => string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.segmentWrap}>
      <View style={styles.segmentRow}>
        {options.map((option) => {
          const active = option === selected;
          const badge = badgeFor?.(option) ?? null;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              hitSlop={SETTINGS_CHIP_HIT_SLOP}
              style={[styles.segmentChip, active && styles.segmentChipActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {labelFor ? labelFor(option) : option}
              </Text>
              {badge ? (
                <Text style={[styles.segmentBadge, active && styles.segmentBadgeActive]} numberOfLines={1}>
                  {badge}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsSegmentRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
  showDivider,
  badgeFor,
  labelFor,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  showDivider?: boolean;
  badgeFor?: (value: T) => string | null;
  labelFor?: (value: T) => string;
}) {
  const styles = useStyles();
  return (
    <>
      <View style={styles.segmentBlock}>
        <Text style={styles.rowLabel}>{label}</Text>
        <SettingsSegmentGroup
          options={options}
          selected={selected}
          onSelect={onSelect}
          badgeFor={badgeFor}
          labelFor={labelFor}
        />
      </View>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsColorRow({
  label,
  colors,
  selectedIndex,
  onSelect,
  showDivider,
}: {
  label: string;
  colors: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  showDivider?: boolean;
}) {
  const styles = useStyles();
  const scheme = useScheme();
  return (
    <>
      <View style={styles.colorRow}>
        <Text style={[styles.rowLabel, styles.colorLabel]}>{label}</Text>
        <View style={styles.colorGroup}>
          {colors.map((color, index) => {
            const active = index === selectedIndex;
            return (
              <Pressable
                key={`${color}-${index}`}
                onPress={() => onSelect(index)}
                hitSlop={SETTINGS_HIT_SLOP}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.colorOuter, active && styles.colorOuterActive]}>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    // A ring keeps white swatches visible in light and dark ones visible in dark.
                    (scheme === 'dark' || color === '#FFFFFF') && styles.colorDotWhite, // theme-fixed: swatch value
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsStepperRow({
  label,
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  showDivider,
}: {
  label: string;
  value: string;
  onMinus?: () => void;
  onPlus?: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  showDivider?: boolean;
}) {
  const styles = useStyles();
  return (
    <>
      <View style={styles.stepperRow}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.stepperControls}>
          <Pressable
            disabled={minusDisabled}
            onPress={onMinus}
            hitSlop={SETTINGS_HIT_SLOP}
            style={[styles.stepperCircle, minusDisabled && styles.stepperCircleDisabled]}>
            <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue} /* layout-ok: stepper value in a minWidth slot */>{value}</Text>
          <Pressable
            disabled={plusDisabled}
            onPress={onPlus}
            hitSlop={SETTINGS_HIT_SLOP}
            style={[styles.stepperCircle, plusDisabled && styles.stepperCircleDisabled]}>
            <Text style={[styles.stepperSymbol, plusDisabled && styles.stepperSymbolDisabled]}>+</Text>
          </Pressable>
        </View>
      </View>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsCacheRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.cacheRow}>
      <Text style={styles.cacheLabel}>{label}</Text>
      <Text style={styles.cacheValue}>{value}</Text>
    </View>
  );
}

export function SettingsActionCard({
  label,
  onPress,
  danger,
  accent,
}: {
  label: string;
  onPress?: () => void;
  danger?: boolean;
  accent?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={SETTINGS_HIT_SLOP}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
      <Text
        style={[
          styles.actionText,
          danger && styles.actionTextDanger,
          accent && styles.actionTextAccent,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 10,
    ...cardElevation(c, scheme),
  },
  navRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  toggleRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabelPress: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: 8,
  },
  toggleLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    color: c.text,
    lineHeight: 20,
    paddingRight: 8,
    includeFontPadding: false,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  switchWrap: {
    width: 52,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  valueRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  radioRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    color: c.text,
    lineHeight: 20,
    paddingRight: 12,
    includeFontPadding: false,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  valueRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '500',
    color: c.accent,
    flexShrink: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusEnabled: {
    color: c.success,
  },
  statusDisabled: {
    color: c.danger,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: c.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.accent,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    marginLeft: 16,
  },
  note: {
    marginTop: 8,
    marginBottom: 0,
    paddingHorizontal: 4,
    fontSize: 13,
    lineHeight: 20,
    color: c.textMuted,
  },
  toggleGroup: {
    gap: 8,
  },
  sectionLabel: {
    marginTop: Spacing.one,
    marginBottom: -4,
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '600',
    color: c.textMuted,
    letterSpacing: 0.4,
  },
  segmentWrap: {
    paddingBottom: 0,
  },
  segmentBlock: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingBottom: 14,
  },
  segmentChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentChipActive: {
    backgroundColor: c.accentFill,
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
  segmentBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: c.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  segmentBadgeActive: {
    color: c.onAccent,
  },
  // Label and swatches share one line when they fit. When they do not (narrow phone, long label,
  // large font) the swatches move to their own line instead of squeezing the label.
  colorRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  colorLabel: {
    // Sized by its text (not flex: 1's zero basis) so the row knows when to wrap; still takes the
    // leftover width when everything fits.
    flex: 0,
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 8,
  },
  colorGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 10,
    // Stays right-aligned when it moves to its own line.
    marginLeft: 'auto',
  },
  colorOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOuterActive: {
    borderWidth: 2,
    borderColor: c.accent,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorDotWhite: {
    borderWidth: 1,
    borderColor: c.border,
  },
  stepperRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDisabled: {
    borderColor: c.border,
  },
  stepperSymbol: {
    fontSize: 18,
    color: c.accent,
    lineHeight: 20,
  },
  stepperSymbolDisabled: {
    color: c.border,
  },
  stepperValue: {
    minWidth: 42,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: c.accent,
  },
  actionCard: {
    backgroundColor: c.surface,
    borderRadius: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    ...cardElevation(c, scheme),
  },
  actionText: {
    fontSize: 15,
    fontWeight: '500',
    color: c.text,
  },
  actionTextDanger: {
    color: c.danger,
    fontWeight: '600',
  },
  actionTextAccent: {
    color: c.success,
    fontWeight: '600',
  },
  cacheRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cacheLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: c.textMuted,
    paddingRight: 8,
  },
  cacheValue: {
    fontSize: 15,
    fontWeight: '500',
    color: c.danger,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
}));
