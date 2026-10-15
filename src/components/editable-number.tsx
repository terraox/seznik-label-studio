import { useEffect, useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

/**
 * A number shown as text that opens the numeric keyboard when tapped.
 * The draft is only committed on blur / submit, clamped to [min, max]; an empty or
 * invalid draft falls back to the current value.
 */
export function EditableNumber({
  value,
  min = 1,
  max = 999,
  onCommit,
  style,
}: {
  value: number;
  min?: number;
  max?: number;
  onCommit: (next: number) => void;
  style?: StyleProp<TextStyle>;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  // A stepper press while not typing shows the new value straight away.
  useEffect(() => setDraft(null), [value]);

  const commit = () => {
    if (draft == null) return;
    const parsed = parseInt(draft, 10);
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(max, Math.max(min, parsed));
    if (next !== value) onCommit(next);
  };

  return (
    <TextInput
      value={draft ?? String(value)}
      onChangeText={(text) => setDraft(text.replace(/\D/g, '').slice(0, String(max).length))}
      onFocus={() => setDraft('')}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="number-pad"
      returnKeyType="done"
      selectTextOnFocus
      maxLength={String(max).length}
      accessibilityLabel="Number"
      style={[{ padding: 0 }, style]}
    />
  );
}
