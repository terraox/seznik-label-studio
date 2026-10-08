import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';

type BulkLabelNavProps = {
  index: number;
  total: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  applyAll: boolean;
  onApplyAllChange: (applyAll: boolean) => void;
};

function JumpBtn({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.jumpBtn, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.jumpText, disabled && styles.jumpTextOff]}>{label}</Text>
    </Pressable>
  );
}

export function BulkLabelNav({
  index,
  total,
  onFirst,
  onPrev,
  onNext,
  onLast,
  applyAll,
  onApplyAllChange,
}: BulkLabelNavProps) {
  const n = total < 1 ? 0 : index + 1;

  return (
    <View style={styles.strip}>
      <View style={styles.pagerRow}>
        <JumpBtn label="«" disabled={index <= 0} onPress={onFirst} />
        <Pressable
          onPress={onPrev}
          disabled={index <= 0}
          hitSlop={4}
          style={({ pressed }) => [styles.arrowBtn, pressed && index > 0 && styles.pressed]}>
          <AppIcon name="chevron.left" size={20} tintColor={index <= 0 ? Palette.disabled : Palette.ink} />
        </Pressable>
        <View style={styles.counterBox}>
          <Text style={styles.counter}>{n} / {total}</Text>
        </View>
        <Pressable
          onPress={onNext}
          disabled={index >= total - 1}
          hitSlop={4}
          style={({ pressed }) => [
            styles.arrowBtn,
            pressed && index < total - 1 && styles.pressed,
          ]}>
          <AppIcon
            name="chevron.right"
            size={20}
            tintColor={index >= total - 1 ? Palette.disabled : Palette.ink}
          />
        </Pressable>
        <JumpBtn label="»" disabled={index >= total - 1} onPress={onLast} />
      </View>

      <View style={styles.scopeRow}>
        <Pressable
          onPress={() => onApplyAllChange(false)}
          accessibilityRole="button"
          accessibilityState={{ selected: !applyAll }}
          style={({ pressed }) => [styles.scopeSeg, !applyAll && styles.scopeSegOn, pressed && styles.pressed]}>
          <Text style={[styles.scopeText, !applyAll && styles.scopeTextOn]}>This</Text>
        </Pressable>
        <Pressable
          onPress={() => onApplyAllChange(true)}
          accessibilityRole="button"
          accessibilityState={{ selected: applyAll }}
          style={({ pressed }) => [styles.scopeSeg, applyAll && styles.scopeSegOn, pressed && styles.pressed]}>
          <Text style={[styles.scopeText, applyAll && styles.scopeTextOn]}>All labels</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: '100%',
    backgroundColor: '#E4E9EE',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D0D8E0',
    paddingTop: 4,
    paddingBottom: 6,
    gap: 4,
  },
  pagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 34,
  },
  jumpBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpText: {
    fontSize: 18,
    fontWeight: '600',
    color: Palette.ink,
    lineHeight: 20,
  },
  jumpTextOff: {
    color: Palette.disabled,
  },
  arrowBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBox: {
    minWidth: 68,
    marginHorizontal: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D8E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
    letterSpacing: 0.2,
  },
  scopeRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#D8DEE6',
    borderRadius: 14,
    padding: 3,
  },
  scopeSeg: {
    minWidth: 84,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 11,
    alignItems: 'center',
  },
  scopeSegOn: {
    backgroundColor: Palette.header,
  },
  scopeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.ink,
  },
  scopeTextOn: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.75,
  },
});
