import { Platform } from 'react-native';

import { normalizeBatteryPercent, printerReportsBattery } from '@/lib/printer/battery-percent';

export { normalizeBatteryPercent, printerReportsBattery } from '@/lib/printer/battery-percent';

export type BatteryFetchContext = {
  transport: string | null;
  sdkId: string | null;
  deviceId: string | null;
};

/**
 * Battery of the connected printer (not the phone).
 * Josh uses its vendor SDK; other bridges fall back to Android 13+ OS battery for that MAC.
 */
export async function fetchPrinterBatteryPercent(ctx: BatteryFetchContext): Promise<number | null> {
  if (!printerReportsBattery(ctx)) return null;
  if (Platform.OS !== 'android') return null;

  if (ctx.sdkId === 'josh' || ctx.transport === 'josh-lpapi') {
    try {
      const { getJoshBatteryLevel } = await import('josh-printer');
      const level = normalizeBatteryPercent(await getJoshBatteryLevel());
      if (level != null) return level;
    } catch {
      // Fall through to the OS reading when the SDK query fails.
    }
  }

  if (!ctx.deviceId) return null;
  try {
    const { readSystemBluetoothBatteryPercent } = await import('@/lib/printer/td404-bridge');
    return normalizeBatteryPercent(await readSystemBluetoothBatteryPercent(ctx.deviceId));
  } catch {
    return null;
  }
}
