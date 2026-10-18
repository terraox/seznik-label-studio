import type { ConsumerPrinterId } from '@/constants/printer-models';
import { consumerIdFromLegacy } from '@/constants/printer-models';
import type { PrinterTransport } from '@/stores/printer-store';

export type LastBridgeDevice = {
  id: string;
  name: string;
  consumer: ConsumerPrinterId;
  /** Epoch ms of the last successful connection. Missing on entries saved before this existed. */
  connectedAt?: number;
};

/** Default native transport when the user picks a family card on Connect. */
export function defaultBridgeForConsumer(consumer: ConsumerPrinterId): PrinterTransport {
  return consumer === 'josh' ? 'josh-lpapi' : 'bluetooth-spp';
}

export function bridgeDisplayLabel(transport: PrinterTransport): string {
  switch (transport) {
    case 'josh-lpapi':
      return 'Josh LPAPI';
    case 'bluetooth-spp':
      return 'TD-404 TSPL';
    case 'tez-spp':
      return 'Tez / Shakti';
    case 'dev-spp':
      return 'Dev AutoReply';
    case 'labelx-spp':
      return 'Label X';
    case 'bluetooth-ble':
      return 'Bluetooth LE';
    case 'wifi':
      return 'Wi‑Fi';
    default:
      return transport;
  }
}

export function consumerFromSdkId(sdkId: string | null | undefined): ConsumerPrinterId {
  if (sdkId === 'josh') return 'josh';
  return consumerIdFromLegacy('tejas', sdkId);
}

export function migrateLastDeviceForBridge(
  saved: Partial<Record<PrinterTransport, LastBridgeDevice>> | undefined,
  legacy: {
    lastDeviceForModel?: Partial<Record<ConsumerPrinterId, { id: string; name: string }>>;
    lastDeviceId?: string | null;
    lastDeviceName?: string | null;
    transport?: PrinterTransport | null;
    sdkId?: string | null;
  },
): Partial<Record<PrinterTransport, LastBridgeDevice>> {
  const next: Partial<Record<PrinterTransport, LastBridgeDevice>> = { ...(saved ?? {}) };
  for (const [consumer, device] of Object.entries(legacy.lastDeviceForModel ?? {})) {
    if (!device?.id) continue;
    const bridge = defaultBridgeForConsumer(consumer as ConsumerPrinterId);
    if (!next[bridge]) {
      next[bridge] = {
        id: device.id,
        name: device.name,
        consumer: consumer as ConsumerPrinterId,
      };
    }
  }
  if (legacy.lastDeviceId && legacy.transport && !next[legacy.transport]) {
    next[legacy.transport] = {
      id: legacy.lastDeviceId,
      name: legacy.lastDeviceName ?? legacy.lastDeviceId,
      consumer: consumerFromSdkId(legacy.sdkId),
    };
  }
  return next;
}
