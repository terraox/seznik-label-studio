import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { C, themedStyles, useThemeRefresh } from '@/theme';

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
  useThemeRefresh();
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
          <ActivityIndicator color={C.onAccent} />
        ) : (
          <AppIcon name="antenna.radiowaves.left.and.right" tintColor={C.onAccent} size={18} />
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

const styles = themedStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: Spacing.three,
    gap: 10,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  title: { fontSize: 17, fontWeight: '700', color: c.text },
  body: { fontSize: 14, lineHeight: 20, color: c.textMuted },
  button: {
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: c.accent, fontSize: 14, fontWeight: '700' },
  warn: { color: c.warning, fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
}));
