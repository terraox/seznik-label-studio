import { trackPrinterConnected } from '@/lib/telemetry/events';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  consumerIdFromLegacy,
  migrateLastDeviceForModel,
  toDriverModel,
  type ConsumerPrinterId,
  type SeznikPrinterModelId,
} from '@/constants/printer-models';
import type { LastBridgeDevice } from '@/lib/printer/printer-bridge';
import { migrateLastDeviceForBridge } from '@/lib/printer/printer-bridge';
import type { PrintHistoryEntry } from '@/lib/print-history/types';
import { usePrintHistoryStore } from '@/stores/print-history-store';

export type PrinterConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'printing';

export type PrinterTransport = 'bluetooth-spp' | 'bluetooth-ble' | 'wifi' | 'josh-lpapi' | 'tez-spp' | 'dev-spp' | 'labelx-spp';

export type { PrintHistoryEntry } from '@/lib/print-history/types';

export type PrintCalibrationEntry = {
  hOffsetMm: number;
  vOffsetMm: number;
  /** DENSITY and SPEED the offsets were dialled in at (TD-404 only). */
  density?: number;
  speed?: number;
};

type PrinterStoreState = {
  status: PrinterConnectionStatus;
  selectedPrinterModel: ConsumerPrinterId;
  deviceId: string | null;
  deviceName: string | null;
  transport: PrinterTransport | null;
  sdkId: 'td404' | 'josh' | 'generic' | 'tez' | 'dev' | 'labelx' | null;
  /** Backend Wi‑Fi session id when transport === 'wifi' */
  backendPrinterId: string | null;
  lastDeviceId: string | null;
  lastDeviceName: string | null;
  lastDeviceForModel: Partial<Record<ConsumerPrinterId, { id: string; name: string }>>;
  /** Last successful connection per native bridge (Josh LPAPI, TD-404 SPP, Tez, …). */
  lastDeviceForBridge: Partial<Record<PrinterTransport, LastBridgeDevice>>;
  /** MAC → model pin. Overrides name heuristics on reconnect (addendum §5). */
  pinnedDriverByMac: Partial<Record<string, SeznikPrinterModelId>>;
  /** @deprecated Legacy field — migrated to print-history store. Kept for rehydrate migration only. */
  history: PrintHistoryEntry[];
  devCommandSet: 'tspl' | 'escpos';
  /**
   * Horizontal/vertical print offset calibration, per physical printer unit
   * (keyed by deviceId, falling back to sdkId for printers that don't expose
   * one). A fixed mechanical offset — a print head or media guide that isn't
   * perfectly centered — is a real per-unit hardware trait, not a bug the
   * geometry math can "solve"; without persisting it, the H/V offset controls
   * reset to 0 every time the print screen reopens, so a real physical bias
   * looks like a random unfixed shift instead of a one-time calibration.
   */
  printCalibration: Record<string, PrintCalibrationEntry>;
  /** Printer battery 0–100 while connected. Null when the printer does not report it. Not persisted. */
  batteryPercent: number | null;
  setStatus: (status: PrinterConnectionStatus) => void;
  setBatteryPercent: (batteryPercent: number | null) => void;
  setSelectedPrinterModel: (model: ConsumerPrinterId) => void;
  setDevCommandSet: (cmd: 'tspl' | 'escpos') => void;
  setPrintCalibration: (key: string, entry: PrintCalibrationEntry) => void;
  setConnectedDevice: (
    deviceId: string,
    deviceName: string,
    meta?: {
      transport?: PrinterTransport;
      sdkId?: 'td404' | 'josh' | 'generic' | 'tez' | 'dev' | 'labelx';
      backendPrinterId?: string | null;
      /** Driver used to pin this MAC. Defaults from sdkId. */
      model?: SeznikPrinterModelId;
      /** Connect-screen choice remembered for this device. */
      consumer?: ConsumerPrinterId;
    },
  ) => void;
  clearConnection: () => void;
  pinDriverForMac: (mac: string, model: SeznikPrinterModelId, userPinned?: boolean) => void;
  addHistoryEntry: (entry: Omit<PrintHistoryEntry, 'id' | 'printedAt'>) => void;
  clearHistory: () => void;
};

function resolvePinnedDriver(
  model: SeznikPrinterModelId | undefined,
  sdkId: string | null | undefined,
  selected: ConsumerPrinterId,
): SeznikPrinterModelId {
  if (model === 'td404' || model === 'josh' || model === 'dev' || model === 'tez' || model === 'labelx') {
    return model;
  }
  if (sdkId === 'td404' || sdkId === 'josh' || sdkId === 'dev' || sdkId === 'tez' || sdkId === 'labelx') {
    return sdkId;
  }
  return toDriverModel(selected);
}

/** Normalize Bluetooth MAC for stable pin keys (AA:BB:CC:DD:EE:FF). */
export function normalizePrinterMac(mac: string): string {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return mac.trim().toUpperCase();
  return `${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}:${hex.slice(6, 8)}:${hex.slice(8, 10)}:${hex.slice(10, 12)}`;
}

export const usePrinterStore = create<PrinterStoreState>()(
  persist(
    (set) => ({
      status: 'disconnected',
      selectedPrinterModel: 'tejas',
      deviceId: null,
      deviceName: null,
      transport: null,
      sdkId: null,
      backendPrinterId: null,
      lastDeviceId: null,
      lastDeviceName: null,
      lastDeviceForModel: {},
      lastDeviceForBridge: {},
      pinnedDriverByMac: {},
      history: [],
      devCommandSet: 'tspl',
      printCalibration: {},
      batteryPercent: null,

      setStatus: (status) => set({ status }),
      setBatteryPercent: (batteryPercent) => set({ batteryPercent }),
      setSelectedPrinterModel: (selectedPrinterModel) => set({ selectedPrinterModel }),
      setDevCommandSet: (devCommandSet) => set({ devCommandSet }),
      setPrintCalibration: (key, entry) =>
        set((state) => ({
          printCalibration: { ...state.printCalibration, [key]: entry },
        })),

      setConnectedDevice: (deviceId, deviceName, meta) => {
        trackPrinterConnected(deviceName, meta?.transport ?? null, meta?.sdkId ?? null);
        set((state) => {
          const driver = resolvePinnedDriver(meta?.model, meta?.sdkId, state.selectedPrinterModel);
          const consumer =
            meta?.consumer ??
            (toDriverModel(state.selectedPrinterModel) === toDriverModel(consumerIdFromLegacy(driver, meta?.sdkId))
              ? state.selectedPrinterModel
              : consumerIdFromLegacy(driver, meta?.sdkId));
          const macKey = normalizePrinterMac(deviceId);
          const transport = meta?.transport ?? null;
          const bridgeEntry: LastBridgeDevice = {
            id: deviceId,
            name: deviceName,
            consumer,
            connectedAt: Date.now(),
          };
          return {
            status: 'connected',
            deviceId,
            deviceName,
            transport,
            sdkId: meta?.sdkId ?? null,
            backendPrinterId: meta?.backendPrinterId ?? null,
            lastDeviceId: deviceId,
            lastDeviceName: deviceName,
            selectedPrinterModel:
              consumer === state.selectedPrinterModel ? consumer : state.selectedPrinterModel,
            lastDeviceForModel: {
              ...state.lastDeviceForModel,
              [consumer]: { id: deviceId, name: deviceName },
            },
            lastDeviceForBridge: transport
              ? {
                  ...state.lastDeviceForBridge,
                  [transport]: bridgeEntry,
                }
              : state.lastDeviceForBridge,
            pinnedDriverByMac: {
              ...state.pinnedDriverByMac,
              [macKey]: driver,
            },
          };
        });
      },

      pinDriverForMac: (mac, model, userPinned = true) =>
        set((state) => ({
          pinnedDriverByMac: {
            ...state.pinnedDriverByMac,
            [normalizePrinterMac(mac)]: model,
          },
        })),

      clearConnection: () =>
        set({
          status: 'disconnected',
          deviceId: null,
          deviceName: null,
          transport: null,
          sdkId: null,
          backendPrinterId: null,
          batteryPercent: null,
        }),

      addHistoryEntry: (entry) => {
        usePrintHistoryStore.getState().addEntry(entry);
      },

      clearHistory: () => {
        usePrintHistoryStore.getState().clearAll();
      },
    }),
    {
      name: 'sez-print/printer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedPrinterModel: state.selectedPrinterModel,
        lastDeviceId: state.lastDeviceId,
        lastDeviceName: state.lastDeviceName,
        lastDeviceForModel: state.lastDeviceForModel,
        lastDeviceForBridge: state.lastDeviceForBridge,
        pinnedDriverByMac: state.pinnedDriverByMac,
        printCalibration: state.printCalibration,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PrinterStoreState> & {
          selectedPrinterModel?: string;
          sdkId?: PrinterStoreState['sdkId'];
        };
        return {
          ...current,
          ...saved,
          selectedPrinterModel: consumerIdFromLegacy(saved.selectedPrinterModel, saved.sdkId),
          lastDeviceForModel: migrateLastDeviceForModel(saved.lastDeviceForModel),
          lastDeviceForBridge: migrateLastDeviceForBridge(
            (saved as Partial<PrinterStoreState>).lastDeviceForBridge,
            {
              lastDeviceForModel: migrateLastDeviceForModel(saved.lastDeviceForModel),
              lastDeviceId: saved.lastDeviceId,
              lastDeviceName: saved.lastDeviceName,
              transport: saved.transport ?? null,
              sdkId: saved.sdkId ?? null,
            },
          ),
        };
      },
    },
  ),
);
