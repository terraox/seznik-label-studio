import type { ConsumerPrinterId, LastModelDevice } from '@/constants/printer-models';
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

/**
 * Last printer connected for this family. Tejas and Rudra share the TD-404 bridge, so the bridge
 * entry alone would show a Tejas on Rudra. Falls back to the bridge entry only when it is this family's.
 */
export function lastDeviceForConsumer(
  state: {
    lastDeviceForModel: Partial<Record<ConsumerPrinterId, LastModelDevice>>;
    lastDeviceForBridge: Partial<Record<PrinterTransport, LastBridgeDevice>>;
  },
  consumer: ConsumerPrinterId,
): LastBridgeDevice | null {
  const bridgeEntry = state.lastDeviceForBridge[defaultBridgeForConsumer(consumer)];
  const own = state.lastDeviceForModel[consumer];
  if (own?.id) {
    const sameAsBridge = bridgeEntry?.id === own.id && bridgeEntry.consumer === consumer;
    return {
      id: own.id,
      name: own.name,
      consumer,
      connectedAt: own.connectedAt ?? (sameAsBridge ? bridgeEntry.connectedAt : undefined),
    };
  }
  return bridgeEntry?.consumer === consumer ? bridgeEntry : null;
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
