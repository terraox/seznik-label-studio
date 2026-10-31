import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type JoshDevice = {
  id: string;
  name: string | null;
  macAddress: string;
  transport: 'josh-lpapi';
  sdkId: 'josh';
  bonded?: boolean;
};

export type JoshPrinterState = {
  state: string;
  isConnected: boolean;
  isPrinting: boolean;
  isDiscovering: boolean;
  printerName: string | null;
  macAddress: string | null;
  lastError: string | null;
  lastConnectedAt: number;
  density: number;
  speed: number;
  gapType: number;
  gapLength: number;
};

export type JoshPrintResult = {
  jobId: string;
  copies: number;
  widthMm: number;
  heightMm: number;
  targetW: number;
  targetH: number;
  density: number;
  speed: number;
  decodeMs: number;
  fitMs: number;
  submitMs: number;
  waitMs: number;
  totalMs: number;
  /** true only for a genuine PrintProgress.Success hardware ACK; false when the
   *  DataEnded 200ms no-ACK fallback completed the job instead. */
  confirmedByDevice: boolean;
};

export type JoshMonoLabelOptions = {
  monoBytes: Uint8Array;
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  widthMm: number;
  heightMm: number;
  dpi?: number;
  copies?: number;
  density?: number;
  speed?: number;
  direction?: number;
  orientation?: number;
  gapType?: number;
  gapLength?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
  alignment?: 'left' | 'center';
};

export type JoshPngLabelOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  dpi?: number;
  copies?: number;
  density?: number;
  speed?: number;
  direction?: number;
  orientation?: number;
  gapType?: number;
  /** Millimetres (fractional allowed); native converts to LPAPI's 0.01 mm unit. */
  gapLength?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
  alignment?: 'left' | 'center';
};

/** Raw PrinterParam snapshot from native readPrinterStatus (older APKs lack the method). */
export type JoshPrinterStatusRaw = {
  available: boolean;
  busy?: boolean;
  refreshAccepted?: boolean;
  changedAfterRefresh?: boolean;
  waitedMs?: number;
  printerHeadTem?: number;
  batteryVoltage?: number;
  batteryCount?: number;
  batteryVoltageCount?: string | null;
  chargeStatus?: number;
  isConnectedAdapter?: boolean;
  printerStatus?: number;
  printPages?: number;
  printLines?: number;
  workLines?: number;
  nullLines?: number;
  gapType?: number;
  supportedGapTypes?: number[];
};

type NativeJoshPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled?(): boolean;
  isDeviceNameSupported(name: string | null): boolean;
  startDiscovery(): Promise<{ discoveryStarted?: boolean }>;
  stopDiscovery(): Promise<void>;
  connect(macAddress: string, name: string | null): Promise<JoshDevice>;
  disconnect(): Promise<void>;
  reconnect(): Promise<boolean>;
  getState(): JoshPrinterState;
  isConnected(): boolean;
  configureParams(params: {
    density?: number;
    speed?: number;
    gapType?: number;
    gapLength?: number;
  }): Promise<void>;
  printPngLabel(options: Record<string, unknown>): Promise<JoshPrintResult>;
  printMonoLabel?(monoBytes: Uint8Array, options: Record<string, unknown>): Promise<JoshPrintResult>;
  getBondedDevices?(): Promise<JoshDevice[]>;
  pairDevice?(mac: string, timeoutMs: number): Promise<boolean>;
  getBatteryLevel(): Promise<number>;
  readPrinterGapReport(): Promise<{
    available?: boolean;
    gapType?: number;
    gapLength?: number;
    supportedGapTypes?: number[];
    line?: string;
  }>;
  readPrinterStatus?(timeoutMs: number): Promise<JoshPrinterStatusRaw>;
  debugLogBattery?(): Promise<void>;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeJoshPrinter | null | undefined;

function getNative(): NativeJoshPrinter | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeJoshPrinter>('JoshPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getJoshNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { isLinked: false, isAvailable: false, reason: 'JOSH LPAPI requires Android or iOS' };
  }
  let mod: NativeJoshPrinter | null = null;
  try {
    mod = requireNativeModule<NativeJoshPrinter>('JoshPrinter');
  } catch (err: any) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'JoshPrinter' is not compiled into this app build (${err?.message ?? 'not found'}). Reinstall a dev client after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('JoshPrinter') returned null — native code not present in this build",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    return {
      isLinked: true,
      isAvailable: available,
      reason: available ? undefined : 'Native module is linked, but manager initialization failed',
    };
  } catch (err: any) {
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${err?.message}` };
  }
}

export function isJoshNativeAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

/** Adapter power only. Returns null when the helper is missing (older APK). */
export function isJoshBluetoothEnabled(): boolean | null {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return null;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return null;
  }
}

export async function getJoshBondedDevices(): Promise<JoshDevice[]> {
  const mod = getNative();
  if (!mod || typeof mod.getBondedDevices !== 'function') return [];
  try {
    const list = await mod.getBondedDevices();
    return list ?? [];
  } catch {
    return [];
  }
}

/** Opens the system pairing dialog for an unpaired printer. True once it is bonded. */
export async function pairJoshDevice(mac: string, timeoutMs = 30000): Promise<boolean> {
  const mod = getNative();
  if (!mod || typeof mod.pairDevice !== 'function') {
    throw new Error('This app build cannot pair printers yet. Install the latest build.');
  }
  try {
    return Boolean(await mod.pairDevice(mac, timeoutMs));
  } catch {
    return false;
  }
}

export function isDeviceNameSupported(name: string | null | undefined): boolean {
  const mod = getNative();
  if (!mod || !name) return false;
  try {
    return Boolean(mod.isDeviceNameSupported(name));
  } catch {
    return false;
  }
}

export function startJoshDiscovery(
  onDevice: (device: JoshDevice) => void,
  onFinished?: (error?: Error) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'JOSH Bluetooth module requires a development build (`npx expo run:ios` / `run:android`). Not available in Expo Go.',
    );
  }

  const foundSub = mod.addListener('onJoshPrinterDiscovered', (payload) => {
    onDevice(payload as JoshDevice);
  });
  const finishSub = onFinished
    ? mod.addListener('onJoshScanFinished', () => onFinished())
    : null;

  void mod
    .startDiscovery()
    .then((result) => {
      if (result && result.discoveryStarted === false) {
        onFinished?.();
      }
    })
    .catch((error) => {
      foundSub.remove();
      finishSub?.remove();
      const err = error instanceof Error ? error : new Error(String(error));
      onFinished?.(err);
    });

  return {
    stop: async () => {
      foundSub.remove();
      finishSub?.remove();
      await mod.stopDiscovery().catch(() => {});
    },
  };
}

export async function getJoshBatteryLevel(): Promise<number> {
  const mod = getNative();
  if (!mod || typeof mod.getBatteryLevel !== 'function') return -1;
  try {
    return await mod.getBatteryLevel();
  } catch {
    return -1;
  }
}

/** Debug builds: full JoshBattery logcat probe (also runs automatically after connect). */
export async function debugLogJoshBattery(): Promise<void> {
  if (!__DEV__) return;
  const mod = getNative();
  if (!mod?.debugLogBattery) return;
  await mod.debugLogBattery();
}

export async function connectJosh(
  macAddress: string,
  name: string | null = null,
): Promise<JoshDevice> {
  const mod = getNative();
  if (!mod) throw new Error('JOSH Bluetooth module is not available.');
  await mod.stopDiscovery().catch(() => {});
  return mod.connect(macAddress, name);
}

export async function disconnectJosh(): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.disconnect();
}

export async function reconnectJosh(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.reconnect();
}

export function isJoshConnected(): boolean {
  const mod = getNative();
  return Boolean(mod?.isConnected());
}

export function getJoshState(): JoshPrinterState | null {
  const mod = getNative();
  if (!mod) return null;
  try {
    return mod.getState();
  } catch {
    return null;
  }
}

export async function configureJoshParams(params: {
  density?: number;
  speed?: number;
  gapType?: number;
  gapLength?: number;
}): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.configureParams(params);
}

export async function printJoshMonoLabel(
  options: JoshMonoLabelOptions,
): Promise<JoshPrintResult | null> {
  const mod = getNative();
  if (!mod || typeof mod.printMonoLabel !== 'function') return null;
  if (!mod.isConnected()) {
    throw new Error('No JOSH printer connected.');
  }
  return mod.printMonoLabel(options.monoBytes, {
    widthDots: options.widthDots,
    heightDots: options.heightDots,
    bytesPerRow: options.bytesPerRow,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    dpi: options.dpi ?? 203,
    copies: options.copies ?? 1,
    density: options.density ?? -1,
    speed: options.speed ?? -1,
    direction: options.direction ?? options.orientation ?? 0,
    gapType: options.gapType ?? 2,
    gapLength: options.gapLength ?? 3,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    alignment: options.alignment ?? 'left',
  });
}

export async function printJoshPngLabel(
  options: JoshPngLabelOptions,
): Promise<JoshPrintResult> {
  const mod = getNative();
  if (!mod || typeof mod.printPngLabel !== 'function') {
    throw new Error('JOSH printPngLabel is not available on this platform.');
  }
  if (!mod.isConnected()) {
    throw new Error('No JOSH printer connected.');
  }

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    dpi: options.dpi ?? 203,
    copies: options.copies ?? 1,
    density: options.density ?? -1,
    speed: options.speed ?? -1,
    direction: options.direction ?? options.orientation ?? 0,
    gapType: options.gapType ?? 2,
    gapLength: options.gapLength ?? 3,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    alignment: options.alignment ?? 'left',
  });
}

export type JoshGapReport = {
  available: boolean;
  gapType: number;
  gapLength: number;
  supportedGapTypes: number[];
  /** `printer gapType=… gapLength=… supportedGapTypes=…` */
  line: string;
};

export async function readJoshGapReport(): Promise<JoshGapReport | null> {
  const mod = getNative();
  if (!mod || typeof mod.readPrinterGapReport !== 'function') return null;
  const report = await mod.readPrinterGapReport();
  if (!report?.available) return null;
  const types = Array.isArray(report.supportedGapTypes)
    ? report.supportedGapTypes.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const gapType = Number(report.gapType);
  const gapLength = Number(report.gapLength);
  const line =
    report.line ??
    `printer gapType=${gapType} gapLength=${gapLength} supportedGapTypes=${types.join(',')}`;
  return {
    available: true,
    gapType,
    gapLength,
    supportedGapTypes: types,
    line,
  };
}

/** Refresh and read PrinterParam. Null when the method is missing (older APK) or the call fails. */
export async function readJoshPrinterStatus(timeoutMs = 3000): Promise<JoshPrinterStatusRaw | null> {
  const mod = getNative();
  if (!mod || typeof mod.readPrinterStatus !== 'function') return null;
  try {
    return await mod.readPrinterStatus(timeoutMs);
  } catch {
    return null;
  }
}

export function addJoshConnectionListener(
  listener: (event: { state: string; isConnected: boolean; printerName?: string; macAddress?: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshConnectionStateChanged', listener);
}

export function addJoshPrintProgressListener(
  listener: (event: {
    jobId: string;
    /** CONNECTED, START_COPY, DATA_ENDED, SUCCESS, FAILED, TIMEOUT. */
    progress: string;
    /** Native-counted copy number and job total (SDK `sdkCopy` is its own per-job index). */
    copy?: number | null;
    copies?: number | null;
    /** FAILED: PrintFailReason name, ordinal and the cached PrinterParam.printerStatus. */
    reason?: string;
    reasonCode?: number | null;
    printerStatus?: number | null;
    [key: string]: any;
  }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshPrintProgress', listener);
}

export function addJoshErrorListener(
  listener: (event: { code: string; message: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshError', listener);
}
