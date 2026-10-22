import { Pressable, Text, View } from 'react-native';

import type { AcrossMode } from '@/lib/across';
import { themedStyles, useThemeRefresh } from '@/theme';

const OPTIONS: { mode: AcrossMode; title: string; note: string }[] = [
  { mode: 'separate', title: 'Edit each label separately', note: 'Design one label at a time, swapping between them. Each can be different.' },
  { mode: 'together', title: 'Edit all together', note: 'One wide canvas with every label on it, like a template. Place things across the whole sheet.' },
];

/** Labels across: work on each label on its own, or on all of them on one canvas. */
export function AcrossModePicker({ value, onChange }: { value: AcrossMode; onChange: (mode: AcrossMode) => void }) {
  useThemeRefresh();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const on = value === o.mode;
        return (
          <Pressable
            key={o.mode}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.mode)}
            style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && styles.pressed]}>
            <View style={[styles.dot, on && styles.dotOn]}>{on ? <View style={styles.dotInner} /> : null}</View>
            <View style={styles.text}>
              <Text style={[styles.title, on && styles.titleOn]}>{o.title}</Text>
              <Text style={styles.note}>{o.note}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { gap: 8, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  cardOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  pressed: { opacity: 0.8 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  dotOn: { borderColor: c.accent },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', color: c.text },
  titleOn: { color: c.accent },
  note: { fontSize: 12, color: c.textSecondary },
}));
