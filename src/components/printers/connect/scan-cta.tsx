import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';

type ScanCtaProps = {
  modelName: string;
  howToConnect: string;
  accent: string;
  scanning: boolean;
  disabled: boolean;
  hint: string | null;
  scanErrors: string[];
  showSettings: boolean;
  settingsLabel: string;
  onScan: () => void;
  onOpenSettings: () => void;
};

export function ScanCta({
  modelName,
  howToConnect,
  accent,
  scanning,
  disabled,
  hint,
  scanErrors,
  showSettings,
  settingsLabel,
  onScan,
  onOpenSettings,
}: ScanCtaProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Find {modelName}</Text>
      <Text style={styles.body}>{howToConnect}</Text>
      <Pressable
        onPress={onScan}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: accent },
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}>
        {scanning ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <AppIcon name="antenna.radiowaves.left.and.right" tintColor="#FFFFFF" size={18} />
        )}
        <Text style={styles.buttonText}>{scanning ? `Scanning for ${modelName}…` : 'Scan for printers'}</Text>
      </Pressable>
      {showSettings ? (
        <Pressable
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{settingsLabel}</Text>
        </Pressable>
      ) : null}
      {hint ? <Text style={styles.warn}>{hint}</Text> : null}
      {scanErrors.length > 0 ? <Text style={styles.warn}>{scanErrors.join(' · ')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.three,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: { fontSize: 17, fontWeight: '700', color: Palette.ink },
  body: { fontSize: 14, lineHeight: 20, color: Palette.muted },
  button: {
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: Palette.accent, fontSize: 14, fontWeight: '700' },
  warn: { color: '#B45309', fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
});
