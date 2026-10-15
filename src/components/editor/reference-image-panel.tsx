import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { normalizeRotation } from '@/components/editor/types';
import type { LabelReferenceImage } from '@/lib/label-document';

const ACCENT = '#48C3C7';
const ROTATIONS = [0, 90, 180, 270] as const;

type ReferenceImagePanelProps = {
  image: LabelReferenceImage;
  onChange: (updates: Partial<LabelReferenceImage>) => void;
};

export function ReferenceImagePanel({ image, onChange }: ReferenceImagePanelProps) {
  const rotation = normalizeRotation(image.rotation ?? 0);
  const cardinal = ROTATIONS.find((angle) => angle === rotation);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Uploaded label</Text>
      <Text style={styles.label}>Rotation</Text>
      <View style={styles.row}>
        {ROTATIONS.map((angle) => {
          const active = angle === cardinal;
          return (
            <Pressable
              key={angle}
              onPress={() => onChange({ rotation: angle })}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{angle}°</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.printRow}>
        <View style={styles.printText}>
          <Text style={styles.label}>Need Printing</Text>
          <Text style={styles.hint}>Turn this on when the photo should print.</Text>
        </View>
        <Switch
          value={image.needPrinting === true}
          onValueChange={(needPrinting) => onChange({ needPrinting })}
          trackColor={{ false: '#D1D5DB', true: ACCENT }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D5DB"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#FFFFFF' },
  printRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  printText: { flex: 1, gap: 2 },
});
