import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { TextInput } from '@/components/ui/text-input';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export const SERIAL_BAR_HEIGHT_PX = 100;

type SerialBarProps = {
  /** 0-based label being previewed. */
  index: number;
  total: number;
  onGo: (index: number) => void;
  /** Continue-from-last-printed (kept per label in serial-continue-store, never in the document). */
  continueEnabled: boolean;
  continueOffset: number;
  onContinueChange: (enabled: boolean) => void;
  onResetContinue: () => void;
};

function Jump({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  useThemeRefresh();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4} style={styles.jump}>
      <Text style={[styles.jumpText, disabled && styles.off]}>{label}</Text>
    </Pressable>
  );
}

/** Label-level bar: preview stepper (first, previous, "12 / 50", next, last, jump) and continue-from-last. */
export function SerialBar({ index, total, onGo, continueEnabled, continueOffset, onContinueChange, onResetContinue }: SerialBarProps) {
  useThemeRefresh();
  const [jump, setJump] = useState('');
  const last = Math.max(0, total - 1);
  const submitJump = () => {
    const n = parseInt(jump.replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) onGo(Math.min(last, Math.max(0, n - 1)));
    setJump('');
  };
  return (
    <View style={styles.strip}>
      <View style={styles.pagerRow}>
        <Jump label="«" disabled={index <= 0} onPress={() => onGo(0)} />
        <Pressable onPress={() => onGo(index - 1)} disabled={index <= 0} hitSlop={4} style={styles.arrow}>
          <AppIcon name="chevron.left" size={20} tintColor={index <= 0 ? C.textDisabled : C.text} />
        </Pressable>
        <View style={styles.counterBox}>
          <Text style={styles.counter}>{index + 1} / {total}</Text>
        </View>
        <Pressable onPress={() => onGo(index + 1)} disabled={index >= last} hitSlop={4} style={styles.arrow}>
          <AppIcon name="chevron.right" size={20} tintColor={index >= last ? C.textDisabled : C.text} />
        </Pressable>
        <Jump label="»" disabled={index >= last} onPress={() => onGo(last)} />
        <TextInput
          style={styles.jumpInput}
          value={jump}
          onChangeText={setJump}
          onSubmitEditing={submitJump}
          onBlur={submitJump}
          placeholder="Go to"
          placeholderTextColor={C.textMuted}
          keyboardType="number-pad"
          returnKeyType="go"
        />
      </View>
      <View style={styles.continueRow}>
        <Switch value={continueEnabled} onValueChange={onContinueChange} trackColor={{ false: C.border, true: C.accent }} />
        <View style={styles.continueText}>
          <Text style={styles.continueTitle}>Continue from last printed</Text>
          <Text style={styles.continueHint}>
            {continueEnabled
              ? continueOffset > 0
                ? `Next batch starts after ${continueOffset} printed.`
                : 'Nothing printed yet. The first batch starts at the start value.'
              : 'Off: every batch starts at the start value.'}
          </Text>
        </View>
        {continueEnabled && continueOffset > 0 ? (
          <Pressable onPress={onResetContinue} hitSlop={8}>
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  strip: {
    width: '100%',
    height: SERIAL_BAR_HEIGHT_PX,
    backgroundColor: c.fillStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 2,
  },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 36 },
  jump: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  jumpText: { fontSize: 18, fontWeight: '600', color: c.text },
  off: { color: c.textDisabled },
  arrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  counterBox: {
    minWidth: 76,
    marginHorizontal: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    alignItems: 'center',
  },
  counter: { fontSize: 15, fontWeight: '600', color: c.text },
  jumpInput: {
    marginLeft: 8,
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    fontSize: 13,
    color: c.text,
    textAlign: 'center',
  },
  continueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  continueText: { flex: 1 },
  continueTitle: { fontSize: 13, fontWeight: '700', color: c.text },
  continueHint: { fontSize: 11, color: c.textSecondary },
  reset: { fontSize: 13, fontWeight: '700', color: c.link },
}));
