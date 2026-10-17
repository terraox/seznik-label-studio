import type { SeznikPrinterModelId } from '@/constants/printer-models';

/** Debug builds only — one-line native logcat probes per bridge (Josh logs via native connect hook). */
export async function debugLogPrinterBatteries(
  model: SeznikPrinterModelId,
  deviceId: string | null,
): Promise<void> {
  if (!__DEV__) return;

  // Josh: native `scheduleDebugBatteryLogAfterConnect` runs after connect (tag JoshBattery).
  switch (model) {
    case 'josh':
      return;
    case 'td404': {
      if (!deviceId) return;
      const { debugLogTd404RemoteBattery } = await import('@/lib/printer/td404-bridge');
      await debugLogTd404RemoteBattery(deviceId);
      break;
    }
    case 'dev': {
      const { debugLogDevBattery } = await import('dev-printer');
      await debugLogDevBattery();
      break;
    }
    default:
      break;
  }
}
