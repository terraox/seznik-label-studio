import { Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BatteryLevelIcon } from '@/components/printers/battery-level-icon';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type PrinterBatteryLabelProps = {
  percent: number | null;
  /** Josh: bars out of 4. When defined (even null) the label shows bars and never a percentage. */
  bars?: number | null;
  size?: number;
  /** White text/icon for green status chip. */
  onDark?: boolean;
  /** When connected but the printer did not report a level yet. */
  showWhenUnknown?: boolean;
  unknownText?: string;
};

export function PrinterBatteryLabel({
  percent,
  bars,
  size = 18,
  onDark = false,
  showWhenUnknown = false,
  unknownText = '—',
}: PrinterBatteryLabelProps) {
  useThemeRefresh();
  const barsMode = bars !== undefined;
  if (barsMode ? bars == null && !showWhenUnknown : percent == null && !showWhenUnknown) return null;

  const muted = onDark ? 'rgba(255,255,255,0.75)' : C.textMuted; // theme-fixed: white on dark hero

  if (barsMode) {
    const lit = bars == null ? 0 : Math.max(1, Math.min(4, Math.round(bars)));
    const fill = onDark ? C.onAccent : bars != null && bars <= 1 ? C.danger : C.success;
    return (
      <View
        style={styles.row}
        accessibilityLabel={bars != null ? `Battery ${lit} of 4 bars` : 'Battery not reported'}>
        <View style={[styles.bars, { height: size }]}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={{
                width: Math.max(3, Math.round(size / 4)),
                height: Math.round((size * (i + 1)) / 5),
                borderRadius: 1,
                backgroundColor: i <= lit ? fill : muted,
                opacity: i <= lit ? 1 : 0.35,
              }}
            />
          ))}
        </View>
        {bars == null ? <Text style={[styles.text, { color: muted }]}>{unknownText}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel={percent != null ? `Battery ${percent} percent` : 'Battery unknown'}>
      {percent != null ? (
        <>
          <BatteryLevelIcon percent={percent} size={size} tintColor={onDark ? C.onAccent : undefined} />
          <Text style={[styles.text, onDark && styles.onDark]}>{percent}%</Text>
        </>
      ) : (
        <>
          <AppIcon name="battery.100" tintColor={muted} size={size} />
          <Text style={[styles.text, { color: muted }]}>{unknownText}</Text>
        </>
      )}
    </View>
  );
}

const styles = themedStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  text: { fontSize: 14, fontWeight: '700', color: c.text },
  onDark: { color: c.onAccent },
}));
