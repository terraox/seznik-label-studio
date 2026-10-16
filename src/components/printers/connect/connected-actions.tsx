import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';

import { PrinterBatteryLabel } from '@/components/printers/printer-battery-label';
import type { ConsumerPrinterId } from '@/constants/printer-models';
import { Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';

import { PRINTER_PHOTOS } from './printer-family-cards';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

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
  useThemeRefresh();
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
        {testing ? <ActivityIndicator color={C.onAccent} /> : <Text style={styles.primaryText}>Print a test label</Text>}
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
            <ActivityIndicator color={C.accent} />
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

const styles = themedStyles((c, scheme) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.three,
    gap: 8,
    alignItems: 'center',
    ...cardElevation(c, scheme),
  },
  stage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    backgroundColor: '#050505', // theme-fixed: black backdrop for the printer photo
    overflow: 'hidden',
    marginBottom: 4,
  },
  photo: { width: '100%', height: '100%' },
  kicker: { fontSize: 13, fontWeight: '700', color: c.success, letterSpacing: 0.3 },
  name: { fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center' },
  detail: { fontSize: 14, lineHeight: 20, color: c.textMuted, textAlign: 'center', marginBottom: 4 },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  batteryPrefix: { fontSize: 14, fontWeight: '600', color: c.textMuted },
  primary: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: c.successFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
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
    backgroundColor: c.accentSoft,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectBtn: {
    backgroundColor: c.dangerSoft,
    borderColor: c.dangerSoft,
  },
  diagnosticsBtn: {
    backgroundColor: c.accentSoft,
    borderColor: c.border,
  },
  disconnect: { color: c.danger, fontSize: 14, fontWeight: '700' },
  link: { color: c.accent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.75 },
}));
