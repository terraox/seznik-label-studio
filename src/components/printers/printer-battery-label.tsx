import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BatteryLevelIcon } from '@/components/printers/battery-level-icon';
import { Palette } from '@/constants/ui';

type PrinterBatteryLabelProps = {
  percent: number | null;
  size?: number;
  /** White text/icon for green status chip. */
  onDark?: boolean;
  /** When connected but the printer did not report a level yet. */
  showWhenUnknown?: boolean;
  unknownText?: string;
};

export function PrinterBatteryLabel({
  percent,
  size = 18,
  onDark = false,
  showWhenUnknown = false,
  unknownText = '—',
}: PrinterBatteryLabelProps) {
  if (percent == null && !showWhenUnknown) return null;

  const muted = onDark ? 'rgba(255,255,255,0.75)' : Palette.muted;

  return (
    <View style={styles.row} accessibilityLabel={percent != null ? `Battery ${percent} percent` : 'Battery unknown'}>
      {percent != null ? (
        <>
          <BatteryLevelIcon percent={percent} size={size} tintColor={onDark ? '#FFFFFF' : undefined} />
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 14, fontWeight: '700', color: Palette.ink },
  onDark: { color: '#FFFFFF' },
});
