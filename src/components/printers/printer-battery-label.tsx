import { Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BatteryLevelIcon } from '@/components/printers/battery-level-icon';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type PrinterBatteryLabelProps = {
  percent: number | null;
  /** Josh: bars out of 4. When defined (even null) the label shows bars and never a percentage. */
  bars?: number | null;
  /** Josh: charger plugged in. Shows a bolt and "Charging". */
  charging?: boolean;
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
  charging = false,
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
    // Battery shape: outlined body with a nub on the right and 4 segments inside.
    const bodyH = Math.round(size * 0.72);
    const bodyW = Math.round(size * 1.8);
    const gap = 2;
    // Inside: 1.5 border each side + 2 padding each side; four solid bars share the rest.
    const seg = Math.max(3, Math.floor((bodyW - 3 - 4 - gap * 3) / 4));
    return (
      <View
        style={styles.row}
        accessibilityLabel={bars != null ? `Battery ${lit} of 4 bars${charging ? ', charging' : ''}` : 'Battery not reported'}>
        <View style={styles.batteryShape}>
          <View
            style={[
              styles.batteryBody,
              { width: bodyW, height: bodyH, borderColor: bars != null || charging ? fill : muted },
              charging && { backgroundColor: fill },
            ]}>
            {charging ? (
              <AppIcon
                name="bolt.fill"
                tintColor={onDark ? C.success : '#FFFFFF' /* theme-fixed: white bolt on the filled battery */}
                size={bodyH - 4}
              />
            ) : (
              [1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={{
                    width: seg,
                    height: bodyH - 3 - 4,
                    borderRadius: 0,
                    backgroundColor: i <= lit ? fill : 'transparent',
                  }}
                />
              ))
            )}
          </View>
          <View
            style={{
              width: 2,
              height: Math.round(bodyH * 0.4),
              backgroundColor: bars != null || charging ? fill : muted,
            }}
          />
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
  batteryShape: { flexDirection: 'row', alignItems: 'center' },
  batteryBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderRadius: 2,
    paddingHorizontal: 2,
  },
  text: { fontSize: 14, fontWeight: '700', color: c.text },
  onDark: { color: c.onAccent },
}));
