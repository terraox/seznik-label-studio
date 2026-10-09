import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Palette, accentStrong, cardShadow } from '@/constants/ui';

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

  const off = canScan && !bluetoothOn;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={off ? 'bluetooth' : 'alert-circle-outline'} size={28} color={accentStrong} />
        {off ? <View style={styles.slash} /> : null}
      </View>
      <Text style={styles.title}>{off ? 'Bluetooth is off' : 'Bluetooth scan unavailable'}</Text>
      <Text style={styles.body}>
        {off
          ? 'Turn Bluetooth on to search for printers nearby.'
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
        <Text style={styles.buttonText}>{settingsLabel}</Text>
      </Pressable>
    </View>
  );
}

type BluetoothOffDialogProps = {
  visible: boolean;
  settingsLabel: string;
  onOpenSettings: () => void;
  onClose: () => void;
};

export function BluetoothOffDialog({
  visible,
  settingsLabel,
  onOpenSettings,
  onClose,
}: BluetoothOffDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.dialog}>
          <View style={styles.iconWrap}>
            <Ionicons name="bluetooth" size={28} color={accentStrong} />
            <View style={styles.slash} />
          </View>
          <Text style={styles.title}>Bluetooth is off</Text>
          <Text style={styles.body}>Turn Bluetooth on to search for printers nearby.</Text>
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>{settingsLabel}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    alignItems: 'center',
    gap: 8,
    ...cardShadow,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Palette.card,
    borderRadius: 20,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    alignItems: 'center',
    gap: 8,
    ...cardShadow,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E6F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  slash: {
    position: 'absolute',
    width: 2,
    height: 34,
    borderRadius: 1,
    backgroundColor: accentStrong,
    transform: [{ rotate: '42deg' }],
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.ink,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: Palette.muted,
    textAlign: 'center',
  },
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontWeight: '700',
    color: Palette.ink,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  dismiss: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  dismissText: { color: Palette.muted, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
