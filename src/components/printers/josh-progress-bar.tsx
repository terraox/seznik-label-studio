import { Text, View } from 'react-native';

import { joshCurrentLabel, joshProgressFraction, joshProgressText } from '@/lib/printer/josh-status';
import { useJoshProgressStore } from '@/stores/josh-progress-store';
import { themedStyles, useThemeRefresh } from '@/theme';

/** Josh print progress: step text, a "2 / 3" count and a bar that moves as each label comes out. */
export function JoshProgressBar() {
  useThemeRefresh();
  const state = useJoshProgressStore();
  const text = joshProgressText(state);
  const fraction = joshProgressFraction(state);
  if (text == null || fraction == null) return null;
  const failed = state.phase === 'failed';
  const copies = state.copies ?? 1;
  const count = copies > 1 && !failed ? `${state.phase === 'done' ? copies : joshCurrentLabel(state)} / ${copies}` : null;
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={text}>
      <View style={styles.row}>
        <Text style={[styles.text, failed && styles.failed]} numberOfLines={2}>
          {text}
        </Text>
        {count ? <Text style={styles.count}>{count}</Text> : null}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, failed && styles.fillFailed, { width: `${Math.round(fraction * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 92, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  text: { flexShrink: 1, color: c.text, fontSize: 13, fontWeight: '600' },
  failed: { color: c.danger },
  count: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: c.fill, borderWidth: 1, borderColor: c.hairline },
  fill: { height: '100%', borderRadius: 5, backgroundColor: c.success },
  fillFailed: { backgroundColor: c.danger },
}));
