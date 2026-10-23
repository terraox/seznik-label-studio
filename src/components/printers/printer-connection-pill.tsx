import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { CONSUMER_PRINTERS } from '@/constants/printer-models';
import { Type } from '@/constants/ui';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { themedStyles, useThemeRefresh } from '@/theme';

/** Header pill: red when no printer is connected, green with its name when connected. Same as the Print screen. */
export function PrinterConnectionPill() {
  useThemeRefresh();
  const router = useRouter();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const model = (CONSUMER_PRINTERS[selectedModel] ?? CONSUMER_PRINTERS.tejas).shortName;
  const live = status === 'connected' || status === 'printing';

  // One sync on mount. The home chip already polls while the app is open.
  useEffect(() => {
    const mgr = getPrinterManager();
    mgr.reconcileConnectionState();
    mgr.maybeAutoReconnect();
  }, []);

  return (
    <Pressable
      onPress={() => router.push('/printer-connect')}
      accessibilityRole="button"
      accessibilityLabel={live ? `Printer connected: ${deviceName ?? model}` : 'Printer not connected'}
      style={({ pressed }) => [styles.pill, live && styles.pillOn, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={styles.text}>
        {live ? `${model}: ${deviceName ?? 'Connected'}` : `${model} · Unconnected`}
      </Text>
      <AppIcon name="link" tintColor="#FFFFFF" size={14} /* theme-fixed: white icon on status fill */ />
    </Pressable>
  );
}

const styles = themedStyles((c) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.dangerFill,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    maxWidth: 220,
  },
  pillOn: { backgroundColor: c.successFill },
  text: { color: c.onAccent, ...Type.badge, flexShrink: 1 },
  pressed: { opacity: 0.65 },
}));
