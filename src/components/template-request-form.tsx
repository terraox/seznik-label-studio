import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import type { TemplateRequestShape } from '@/lib/telemetry/events';
import { makeStyles } from '@/theme';

export type TemplateRequestDraft = {
  description: string;
  widthMm: number | null;
  heightMm: number | null;
  shape: TemplateRequestShape | null;
};

const SHAPES: { id: TemplateRequestShape; label: string }[] = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'circle', label: 'Circle' },
  { id: 'other', label: 'Other' },
];

/** A label size in mm, or null when empty or not a real size (5 to 300 mm). */
function sizeOrNull(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n >= 5 && n <= 300 ? Math.round(n * 10) / 10 : null;
}

/**
 * "Can't find your template?" popup: what the label is for, and optionally its size and shape.
 * `onSubmit` receives what the user entered; sending is the caller's job.
 */
export function TemplateRequestModal({
  visible,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (draft: TemplateRequestDraft) => void;
}) {
  const styles = useStyles();
  const [description, setDescription] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [shape, setShape] = useState<TemplateRequestShape | null>(null);

  // A fresh form every time it opens.
  useEffect(() => {
    if (visible) {
      setDescription('');
      setWidth('');
      setHeight('');
      setShape(null);
    }
  }, [visible]);

  const badSize = (width.trim() !== '' && sizeOrNull(width) == null) || (height.trim() !== '' && sizeOrNull(height) == null);
  const ready = description.trim().length >= 3 && !badSize;

  return (
    <IosAlertModal
      visible={visible}
      onClose={onCancel}
      plainScroll
      cardMaxWidth={340}
      title="Request a template"
      message="Tell us what label you need. We will add it to the templates."
      buttons={[
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
        {
          text: 'Send',
          bold: true,
          disabled: !ready,
          onPress: () =>
            onSubmit({ description: description.trim(), widthMm: sizeOrNull(width), heightMm: sizeOrNull(height), shape }),
        },
      ]}>
      <IosAlertInput
        value={description}
        onChangeText={setDescription}
        placeholder="What is the label for? e.g. Jewellery tag with a tail"
        multiline
        scrollEnabled
        numberOfLines={3}
        maxLength={500}
        style={styles.description}
      />
      <Text style={styles.groupLabel}>Size in mm (optional)</Text>
      <View style={styles.sizeRow}>
        <IosAlertInput
          value={width}
          onChangeText={setWidth}
          placeholder="Width"
          keyboardType="decimal-pad"
          maxLength={5}
          style={styles.sizeInput}
        />
        <Text style={styles.times}>×</Text>
        <IosAlertInput
          value={height}
          onChangeText={setHeight}
          placeholder="Height"
          keyboardType="decimal-pad"
          maxLength={5}
          style={styles.sizeInput}
        />
      </View>
      {badSize ? <Text style={styles.error}>Sizes go from 5 to 300 mm.</Text> : null}
      <Text style={styles.groupLabel}>Shape (optional)</Text>
      <View style={styles.shapes}>
        {SHAPES.map((s) => {
          const on = shape === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setShape(on ? null : s.id)}
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </IosAlertModal>
  );
}

const useStyles = makeStyles((c) => ({
  // Fixed height: the box scrolls inside instead of growing as the text gets longer.
  description: { height: 80, maxHeight: 80, paddingVertical: 8, textAlignVertical: 'top' },
  groupLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sizeInput: { flex: 1, minWidth: 0 },
  times: { color: c.textMuted, fontSize: 15 },
  error: { color: c.danger, fontSize: 12, marginTop: 4 },
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { color: c.text, fontSize: 13 },
  chipTextOn: { color: c.onAccent, fontWeight: '600' },
}));
