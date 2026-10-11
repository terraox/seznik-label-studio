import { Platform } from 'react-native';

import { normalizeBatteryPercent } from '@/lib/printer/battery-percent';

export { normalizeBatteryPercent } from '@/lib/printer/battery-percent';

export type BatteryFetchContext = {
  transport: string | null;
  sdkId: string | null;
  deviceId: string | null;
};

/**
 * Battery of the connected printer (not the phone).
 * Tez and Label X use vendor SDKs; other bridges fall back to Android 13+ OS battery for that MAC.
 */
export async function fetchPrinterBatteryPercent(ctx: BatteryFetchContext): Promise<number | null> {
  if (Platform.OS !== 'android') return null;

  if (ctx.sdkId === 'tez' || ctx.transport === 'tez-spp') {
    try {
      const { getTezBatteryLevel } = await import('tez-printer');
      const level = normalizeBatteryPercent(await getTezBatteryLevel());
      if (level != null) return level;
    } catch {
      // Fall through to the OS reading when the SDK query fails.
    }
  }

  if (ctx.sdkId === 'labelx' || ctx.transport === 'labelx-spp') {
    try {
      const { getLabelXBatteryLevel } = await import('labelx-printer');
      const level = normalizeBatteryPercent(await getLabelXBatteryLevel());
      if (level != null) return level;
    } catch {
      // Fall through to the OS reading when the SDK query fails.
    }
  }

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
    const { readSystemBluetoothBatteryPercent } = await import('td404-printer');
    return normalizeBatteryPercent(await readSystemBluetoothBatteryPercent(ctx.deviceId));
  } catch {
    return null;
  }
}
