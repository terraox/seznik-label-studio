import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PrinterBatteryLabel } from '@/components/printers/printer-battery-label';
import { CONSUMER_PRINTERS } from '@/constants/printer-models';
import { androidRipple, HomeLayout, HomeStatusColors } from '@/constants/ui';
import { printerReportsBattery } from '@/lib/printer/printer-battery';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore, type PrinterConnectionStatus } from '@/stores/printer-store';

const CHIP_FILL: Record<PrinterConnectionStatus, string> = {
  disconnected: HomeStatusColors.idle,
  scanning: HomeStatusColors.idle,
  connecting: HomeStatusColors.idle,
  connected: HomeStatusColors.ok,
  printing: HomeStatusColors.ok,
};

export function StatusChip() {
  const router = useRouter();
  const status = usePrinterStore((s) => s.status);
  const batteryPercent = usePrinterStore((s) => s.batteryPercent);
  const sdkId = usePrinterStore((s) => s.sdkId);
  const transport = usePrinterStore((s) => s.transport);
  const showBattery = printerReportsBattery({ sdkId, transport });

  useEffect(() => {
    const sync = () => {
      const mgr = getPrinterManager();
      mgr.reconcileConnectionState();
      mgr.maybeAutoReconnect();
      const liveNow =
        usePrinterStore.getState().status === 'connected' ||
        usePrinterStore.getState().status === 'printing';
      if (liveNow) void mgr.refreshBattery();
    };
    sync();
    const id = setInterval(sync, 2500);
    return () => clearInterval(id);
  }, []);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const modelName = (CONSUMER_PRINTERS[selectedModel] ?? CONSUMER_PRINTERS.tejas).shortName;

  const live = status === 'connected' || status === 'printing';
  const text = live ? deviceName || modelName : 'Not connected';
  const batteryLabel =
    showBattery && batteryPercent != null
      ? `${batteryPercent}%`
      : showBattery && live
        ? 'battery not reported'
        : '';

  return (
    <Pressable
      onPress={() => router.push('/printer-connect')}
      android_ripple={androidRipple}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={
        live && batteryLabel
          ? `Printer ${modelName}: ${text}. Battery ${batteryLabel}`
          : `Printer ${modelName}: ${text}`
      }
      accessibilityHint="Opens printer connection"
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: CHIP_FILL[status] },
        pressed && styles.pressed,
      ]}>
      {live && showBattery ? (
        <PrinterBatteryLabel
          percent={batteryPercent}
          size={15}
          onDark
          showWhenUnknown
          unknownText="—"
        />
      ) : live ? (
        <AppIcon name="printer" tintColor="#FFFFFF" size={15} pointerEvents="none" />
      ) : (
        <AppIcon name="link" tintColor="#FFFFFF" size={15} pointerEvents="none" />
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
    maxWidth: 280,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    overflow: 'hidden',
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
