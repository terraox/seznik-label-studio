import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConsumerPrinterId } from '@/constants/printer-models';
import { Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';

import { PRINTER_PHOTOS } from './printer-family-cards';

type ConnectedActionsProps = {
  modelId: ConsumerPrinterId;
  modelName: string;
  deviceName: string | null;
  testing: boolean;
  onTest: () => void;
  onDisconnect: () => void;
  onDiagnostics: () => void;
};

export function ConnectedActions({
  modelId,
  modelName,
  deviceName,
  testing,
  onTest,
  onDisconnect,
  onDiagnostics,
}: ConnectedActionsProps) {
  return (
    <View style={styles.card}>
      <View style={styles.stage}>
        <Image source={PRINTER_PHOTOS[modelId]} style={styles.photo} resizeMode="contain" />
      </View>
      <Text style={styles.kicker}>Connected</Text>
      <Text style={styles.name}>{deviceName || modelName}</Text>
      <Text style={styles.detail}>{modelName} is ready to print.</Text>
      <Pressable
        onPress={onTest}
        disabled={testing}
        style={({ pressed }) => [styles.primary, testing && styles.disabled, pressed && styles.pressed]}>
        {testing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Print a test label</Text>}
      </Pressable>
      <View style={styles.row}>
        <Pressable onPress={onDisconnect} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
          <Text style={styles.disconnect}>Disconnect</Text>
        </Pressable>
        <Pressable onPress={onDiagnostics} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
          <Text style={styles.link}>Diagnostics</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBE5CD',
    padding: Spacing.three,
    gap: 8,
    alignItems: 'center',
    ...cardShadow,
  },
  stage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    backgroundColor: '#050505',
    overflow: 'hidden',
    marginBottom: 4,
  },
  photo: { width: '100%', height: '100%' },
  kicker: { fontSize: 13, fontWeight: '700', color: '#18794A', letterSpacing: 0.3 },
  name: { fontSize: 20, fontWeight: '700', color: Palette.ink, textAlign: 'center' },
  detail: { fontSize: 14, lineHeight: 20, color: Palette.muted, textAlign: 'center', marginBottom: 4 },
  primary: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#18794A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  row: { alignSelf: 'stretch', flexDirection: 'row', gap: 8 },
  ghost: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  disconnect: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  link: { color: Palette.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.75 },
});
