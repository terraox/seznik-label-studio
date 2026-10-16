import { Pressable, Switch, Text, View } from 'react-native';

import { normalizeRotation } from '@/components/editor/types';
import type { LabelReferenceImage } from '@/lib/label-document';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const ROTATIONS = [0, 90, 180, 270] as const;

type ReferenceImagePanelProps = {
  image: LabelReferenceImage;
  onChange: (updates: Partial<LabelReferenceImage>) => void;
};

export function ReferenceImagePanel({ image, onChange }: ReferenceImagePanelProps) {
  useThemeRefresh();
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
          trackColor={{ false: C.border, true: C.accent }}
          thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
          ios_backgroundColor={C.border}
        />
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  panel: {
    backgroundColor: c.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  title: { fontSize: 15, fontWeight: '700', color: c.text },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textSecondary, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.fill,
  },
  chipActive: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  chipTextActive: { color: c.onAccent },
  printRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  printText: { flex: 1, gap: 2 },
}));
