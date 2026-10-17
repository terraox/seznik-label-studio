import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MAX_COPIES_PER_ROW } from '@/lib/bulk-row-copies';
import { themedStyles, useThemeRefresh } from '@/theme';

export const BULK_COPIES_BAR_HEIGHT_PX = 44;

type BulkCopiesBarProps = {
  value: number;
  rowKey: number;
  onCommit: (copies: number) => void;
};

export function BulkCopiesBar({ value, rowKey, onCommit }: BulkCopiesBarProps) {
  useThemeRefresh();
  const [draft, setDraft] = useState(String(value));
  const startedAt = useRef(value);

  useEffect(() => {
    startedAt.current = value;
    setDraft(String(value));
  }, [rowKey, value]);

  const revert = () => setDraft(String(startedAt.current));

  const commitDraft = () => {
    const text = draft.trim();
    if (!/^\d+$/.test(text)) {
      revert();
      return;
    }
    const next = Number(text);
    if (next < 1 || next > MAX_COPIES_PER_ROW) {
      revert();
      return;
    }
    if (next !== value) onCommit(next);
    else setDraft(String(next));
  };

  return (
    <View style={styles.bar}>
      <Text style={styles.label}>Copies</Text>
      <Pressable
        onPress={() => onCommit(Math.max(1, value - 1))}
        disabled={value <= 1}
        hitSlop={6}
        style={({ pressed }) => [styles.step, pressed && value > 1 && styles.pressed]}>
        <Text style={[styles.stepText, value <= 1 && styles.stepTextOff]}>−</Text>
      </Pressable>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commitDraft}
        onSubmitEditing={commitDraft}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxLength={3}
        style={styles.field}
        accessibilityLabel="Copies for this label"
      />
      <Pressable
        onPress={() => onCommit(Math.min(MAX_COPIES_PER_ROW, value + 1))}
        disabled={value >= MAX_COPIES_PER_ROW}
        hitSlop={6}
        style={({ pressed }) => [styles.step, pressed && value < MAX_COPIES_PER_ROW && styles.pressed]}>
        <Text style={[styles.stepText, value >= MAX_COPIES_PER_ROW && styles.stepTextOff]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c) => ({
  bar: {
    width: '100%',
    minHeight: BULK_COPIES_BAR_HEIGHT_PX,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.fillStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    paddingHorizontal: 12,
  },
  label: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  step: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: c.surface,
  },
  stepText: {
    color: c.text,
    fontSize: 20,
    lineHeight: 22,
  },
  stepTextOff: {
    color: c.textDisabled,
  },
  field: {
    minWidth: 48,
    height: 32,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.surface,
    color: c.accent,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
}));
