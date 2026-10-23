import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { AppIcon } from '@/components/app-icon';
import { joshCurrentLabel, joshProgressFraction, joshProgressText } from '@/lib/printer/josh-status';
import { useJoshProgressStore } from '@/stores/josh-progress-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/**
 * Josh print progress as a popup card: step text, a "2 / 3" count and a bar that moves as each
 * label comes out. On success it says "Print completed"; on failure it shows the reason.
 */
export function JoshProgressCard() {
  useThemeRefresh();
  // Only the fields the card draws, so unrelated store updates (the live status watcher) do not re-render it.
  const state = useJoshProgressStore(
    useShallow((s) => ({
      phase: s.phase,
      copy: s.copy,
      copies: s.copies,
      copiesDone: s.copiesDone,
      failure: s.failure,
      bulkIndex: s.bulkIndex,
      bulkTotal: s.bulkTotal,
    })),
  );
  const text = joshProgressText(state);
  const fraction = joshProgressFraction(state);
  if (text == null || fraction == null) return null;

  // In an Excel batch, one finished label is not the end: keep showing progress until the last.
  const lastOfBulk = state.bulkIndex == null || state.bulkTotal == null || state.bulkIndex >= state.bulkTotal;
  const done = state.phase === 'done' && lastOfBulk;
  const failed = state.phase === 'failed';
  const copies = state.copies ?? 1;
  const count = copies > 1 && !failed ? `${done ? copies : joshCurrentLabel(state)} / ${copies}` : null;
  const bulk =
    state.bulkIndex != null && state.bulkTotal != null ? `Label ${state.bulkIndex} of ${state.bulkTotal}` : null;
  const close = () => useJoshProgressStore.getState().reset();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={done || failed ? close : undefined}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>Printer</Text>
          <View style={styles.divider} />
          {failed ? (
            <View style={styles.result}>
              <AppIcon name="exclamationmark.triangle.fill" tintColor={C.danger} size={28} />
              <Text style={[styles.resultText, styles.failedText]}>
                {state.failure ?? 'The printer reported a problem'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <View style={styles.statusRow}>
                  {done ? <AppIcon name="checkmark" tintColor={C.success} size={16} /> : null}
                  <Text style={styles.status}>
                    {done ? 'Print completed' : bulk ? `${bulk} · Printing` : 'Printing'}
                  </Text>
                </View>
                {count ? <Text style={styles.count} /* layout-ok: short page count */>{count}</Text> : null}
              </View>
              {/* A finished print always shows a full bar, so nothing is left unfilled at the end. */}
              <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={text}>
                <ProgressFill percent={done ? 100 : fraction * 100} runKey={done ? 'done' : 'run'} />
              </View>
            </>
          )}
          {done || failed ? (
            <Pressable onPress={close} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{done ? 'OK' : 'Close'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** The bar fill: eases to each new value and never moves backwards within one print. */
function ProgressFill({ percent, runKey }: { percent: number; runKey: string }) {
  useThemeRefresh();
  const peak = useRef({ key: runKey, value: percent });
  if (peak.current.key !== runKey) peak.current = { key: runKey, value: percent };
  peak.current.value = Math.max(peak.current.value, percent);
  const target = peak.current.value;
  const width = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: target,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [target, width]);
  return (
    <Animated.View
      style={[styles.fill, { width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}
    />
  );
}

const styles = themedStyles((c) => ({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.scrim },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: c.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 14,
  },
  title: { textAlign: 'center', color: c.text, fontSize: 17, fontWeight: '700' },
  divider: { height: 1, backgroundColor: c.hairline, marginHorizontal: -20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  status: { color: c.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  count: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
  track: { height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.fill, borderWidth: 1, borderColor: c.hairline },
  fill: { height: '100%', borderRadius: 6, backgroundColor: c.success },
  result: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  resultText: { color: c.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  failedText: { color: c.danger, fontSize: 14, fontWeight: '600' },
  button: { alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 8 },
  buttonText: { color: c.accent, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
}));
