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
    case 'tez': {
      const { debugLogTezBattery } = await import('tez-printer');
      debugLogTezBattery();
      break;
    }
    case 'labelx': {
      const { debugLogLabelXBattery } = await import('labelx-printer');
      await debugLogLabelXBattery();
      break;
    }
    case 'td404': {
      if (!deviceId) return;
      const { debugLogTd404RemoteBattery } = await import('td404-printer');
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
