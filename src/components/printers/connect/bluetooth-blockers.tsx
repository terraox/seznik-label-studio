import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';

type BluetoothBlockersProps = {
  canScan: boolean;
  reason: string | null;
  bluetoothOn: boolean;
  settingsLabel: string;
  onOpenSettings: () => void;
};

export function BluetoothBlockers({
  canScan,
  reason,
  bluetoothOn,
  settingsLabel,
  onOpenSettings,
}: BluetoothBlockersProps) {
  if (canScan && bluetoothOn) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{canScan ? 'Bluetooth is off' : 'Bluetooth scan unavailable'}</Text>
      <Text style={styles.body}>
        {canScan
          ? 'Turn Bluetooth on to find your printer. You can still connect over Wi‑Fi from More options.'
          : reason || 'This app build cannot scan for Bluetooth printers.'}
      </Text>
      {!canScan ? (
        <Text style={styles.body}>
          Install the development build with{' '}
          <Text style={styles.code}>npx expo run:android</Text>, then reopen this screen.
        </Text>
      ) : null}
      <Pressable
        onPress={onOpenSettings}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <AppIcon name="link" tintColor={Palette.accent} size={16} />
        <Text style={styles.buttonText}>{settingsLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDBA74',
    padding: Spacing.three,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#9A3412' },
  body: { fontSize: 14, lineHeight: 20, color: '#9A3412' },
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontWeight: '700',
  },
  button: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { color: Palette.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
