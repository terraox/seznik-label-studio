import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { CONSUMER_PRINTERS } from '@/constants/printer-models';
import { androidRipple, HomeLayout, HomeStatusColors } from '@/constants/ui';
import { usePrinterStore, type PrinterConnectionStatus } from '@/stores/printer-store';

const CHIP_FILL: Record<PrinterConnectionStatus, string> = {
  disconnected: HomeStatusColors.idle,
  scanning: HomeStatusColors.busy,
  connecting: HomeStatusColors.busy,
  connected: HomeStatusColors.ok,
  printing: HomeStatusColors.ok,
};

export function StatusChip() {
  const router = useRouter();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const modelName = (CONSUMER_PRINTERS[selectedModel] ?? CONSUMER_PRINTERS.tejas).shortName;

  const live = status === 'connected' || status === 'printing';
  const busy = status === 'scanning' || status === 'connecting';
  const text = live ? deviceName || modelName : busy ? 'Connecting…' : 'Not connected';

  return (
    <Pressable
      onPress={() => router.push('/printer-connect')}
      android_ripple={androidRipple}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Printer ${modelName}: ${text}`}
      accessibilityHint="Opens printer connection"
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: CHIP_FILL[status] },
        pressed && styles.pressed,
      ]}>
      {status === 'disconnected' ? (
        <AppIcon name="link" tintColor="#FFFFFF" size={15} pointerEvents="none" />
      ) : (
        <View style={styles.dot} />
      )}
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
        style={styles.text}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: HomeLayout.chipHeight,
    maxWidth: 240,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
