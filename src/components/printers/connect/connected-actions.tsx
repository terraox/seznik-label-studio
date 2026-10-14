import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrinterBatteryLabel } from '@/components/printers/printer-battery-label';
import type { ConsumerPrinterId } from '@/constants/printer-models';
import { Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette } from '@/constants/ui';

import { PRINTER_PHOTOS } from './printer-family-cards';

type ConnectedActionsProps = {
  modelId: ConsumerPrinterId;
  modelName: string;
  deviceName: string | null;
  batteryPercent?: number | null;
  showBattery?: boolean;
  testing: boolean;
  onTest: () => void;
  /** Shown only for printers that can report their label size. */
  onMeasure?: () => void;
  measuring?: boolean;
  onDisconnect: () => void;
  onDiagnostics: () => void;
};

export function ConnectedActions({
  modelId,
  modelName,
  deviceName,
  batteryPercent = null,
  showBattery = true,
  testing,
  onTest,
  onMeasure,
  measuring = false,
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
      {showBattery ? (
        <View style={styles.batteryRow}>
          <Text style={styles.batteryPrefix}>Battery</Text>
          <PrinterBatteryLabel percent={batteryPercent} size={18} showWhenUnknown unknownText="Not reported" />
        </View>
      ) : null}
      <Pressable
        onPress={onTest}
        disabled={testing}
        style={({ pressed }) => [styles.primary, testing && styles.disabled, pressed && styles.pressed]}>
        {testing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Print a test label</Text>}
      </Pressable>
      {onMeasure ? (
        <Pressable
          onPress={onMeasure}
          disabled={measuring || testing}
          android_ripple={androidRipple}
          style={({ pressed }) => [
            styles.measureBtn,
            (measuring || testing) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          {measuring ? (
            <ActivityIndicator color={Palette.accent} />
          ) : (
            <Text style={styles.link}>Print label size</Text>
          )}
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <Pressable
          onPress={onDisconnect}
          android_ripple={androidRipple}
          style={({ pressed }) => [styles.secondaryBtn, styles.disconnectBtn, pressed && styles.pressed]}>
          <Text style={styles.disconnect}>Disconnect</Text>
        </Pressable>
        <Pressable
          onPress={onDiagnostics}
          android_ripple={androidRipple}
          style={({ pressed }) => [styles.secondaryBtn, styles.diagnosticsBtn, pressed && styles.pressed]}>
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
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  batteryPrefix: { fontSize: 14, fontWeight: '600', color: Palette.muted },
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
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  measureBtn: {
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#E8F6F8',
    borderColor: '#B8E4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  diagnosticsBtn: {
    backgroundColor: '#E8F6F8',
    borderColor: '#B8E4EA',
  },
  disconnect: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  link: { color: Palette.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.75 },
});
