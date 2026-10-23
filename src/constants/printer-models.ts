export type SeznikPrinterModelId = 'td404' | 'josh' | 'dev' | 'tez' | 'labelx';

export interface SeznikPrinterModel {
  id: SeznikPrinterModelId;
  name: string;
  shortName: string;
  tagline: string;
  driver: string;
  driverType: 'td404' | 'josh' | 'dev' | 'tez' | 'labelx';
  defaultDpi: number;
  badgeColor: string;
  badgeTextColor: string;
  badgeBorderColor: string;
  description: string;
  warningNotice?: string;
  connectionHelp: string;
  supportedNames: string[];
}

export const SEZNIK_PRINTER_MODELS: Record<SeznikPrinterModelId, SeznikPrinterModel> = {
  td404: {
    id: 'td404',
    name: 'SEZNIK TEJAS / RUDRA',
    shortName: 'TEJAS / RUDRA',
    tagline: 'TD-404 TSPL High-Speed Label Engine',
    driver: 'TD-404 Driver (TSPL)',
    driverType: 'td404',
    defaultDpi: 304,
    badgeColor: '#F0F9FF',
    badgeTextColor: '#0284C7',
    badgeBorderColor: '#BAE6FD',
    description: 'High-speed 304 DPI & 203 DPI thermal label printer engine for Tejas, Rudra, and TD-404 series.',
    warningNotice: 'Optimized for high-resolution jewellery labels, cable flags, and sticker rolls.',
    connectionHelp: 'Power on your Tejas / Rudra / TD-404 printer, pair in Bluetooth settings or tap Scan below.',
    supportedNames: ['TEJAS', 'RUDRA', 'TD404', 'TD-404', 'TD_404', 'SEZNIK', '4BARCODE', 'POSTEK', 'TSC', 'GAINSCHA'],
  },
  josh: {
    id: 'josh',
    name: 'SEZNIK JOSH',
    shortName: 'JOSH',
    tagline: 'Dual-Mode Smart LPAPI Vector Engine',
    driver: 'JOSH LPAPI Driver',
    driverType: 'josh',
    defaultDpi: 203,
    badgeColor: '#E4F3FB',
    badgeTextColor: '#1878B8',
    badgeBorderColor: '#BFE0F1',
    description: 'Premium dual-mode printer with hardware optical gap sensor and native LPAPI vector graphics.',
    warningNotice: 'Hardware optical gap detection for instant die-cut alignment.',
    connectionHelp: 'Power on JOSH printer and tap Scan under the JOSH section.',
    supportedNames: ['JOSH', 'D110', 'D11', 'B21', 'B1', 'B3S', 'JC', 'NIIMBOT', 'LPAPI'],
  },
  dev: {
    id: 'dev',
    name: 'SEZNIK DEV',
    shortName: 'DEV',
    tagline: 'AutoReplyPrint 2-in-1 POS & Label Driver',
    driver: 'DEV AutoReply Driver',
    driverType: 'dev',
    defaultDpi: 203,
    badgeColor: '#EFF6FF',
    badgeTextColor: '#2563EB',
    badgeBorderColor: '#BFDBFE',
    description: 'AutoReplyPrint SDK engine supporting 50×30mm die-cut labels and versatile media types.',
    warningNotice: 'Supports 50×30mm die-cut labels and continuous rolls.',
    connectionHelp: 'Pair via phone Bluetooth settings, then select SEZNIK DEV.',
    supportedNames: ['DEV', 'SEZNIK DEV', 'POS-58', 'MTP', 'RPP', 'MPT'],
  },
  tez: {
    id: 'tez',
    name: 'SEZNIK TEZ / SHAKTI',
    shortName: 'TEZ / SHAKTI',
    tagline: 'Smart Thermal Label Driver & Auto-Calibrate',
    driver: 'TEZ Smart Driver',
    driverType: 'tez',
    defaultDpi: 203,
    badgeColor: '#ECFDF5',
    badgeTextColor: '#059669',
    badgeBorderColor: '#A7F3D0',
    description: 'Proprietary TEZ / Shakti smart driver with hardware gap calibration and image print pipeline.',
    warningNotice: 'High-speed smart label printing with hardware paper calibration.',
    connectionHelp: 'Power on the TEZ printer and tap Scan under TEZ section.',
    supportedNames: ['TEZ', 'SHAKTI', 'TEZ-PRINT', 'YX', 'YIXIN'],
  },
  labelx: {
    id: 'labelx',
    name: 'SEZNIK LABEL X',
    shortName: 'LABEL X',
    tagline: 'LuckPrinter OEM Vector & Die-Cut Engine',
    driver: 'Label X OEM Driver',
    driverType: 'labelx',
    defaultDpi: 203,
    badgeColor: '#ECFEFF',
    badgeTextColor: '#0891B2',
    badgeBorderColor: '#A5F3FC',
    description: 'LuckPrinter SDK engine for Label X series portable wireless thermal printers.',
    warningNotice: 'Optimized for high-speed portable die-cut label rolls.',
    connectionHelp: 'Power on your Label X printer, pair in Bluetooth settings or tap Scan below.',
    supportedNames: ['LABELX', 'LABEL X', 'MINIX', 'GD985', 'LUCKP', 'U8', 'PPP1', 'LPC50'],
  },
};

/** Internal driver catalog. Connect UI uses CONSUMER_PRINTER_LIST instead. */
export const PRINTER_MODEL_LIST: SeznikPrinterModel[] = [
  SEZNIK_PRINTER_MODELS.td404,
  SEZNIK_PRINTER_MODELS.josh,
  SEZNIK_PRINTER_MODELS.dev,
  SEZNIK_PRINTER_MODELS.tez,
  SEZNIK_PRINTER_MODELS.labelx,
];

/** Printer the user picks on the connect screen. Tejas and Rudra share the TD-404 driver. */
export type ConsumerPrinterId = 'tejas' | 'rudra' | 'josh';

export type ConsumerPrinter = {
  id: ConsumerPrinterId;
  name: string;
  shortName: string;
  tagline: string;
  howToConnect: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
};

export const CONSUMER_PRINTERS: Record<ConsumerPrinterId, ConsumerPrinter> = {
  tejas: {
    id: 'tejas',
    name: 'SEZNIK Tejas',
    shortName: 'Tejas',
    tagline: 'High-resolution labels for jewellery and stickers',
    howToConnect: 'Turn the printer on, then scan and tap Connect.',
    accent: '#0284C7',
    accentSoft: '#F0F9FF',
    accentBorder: '#BAE6FD',
  },
  rudra: {
    id: 'rudra',
    name: 'SEZNIK Rudra',
    shortName: 'Rudra',
    tagline: 'Same fast label engine, sized for daily shop work',
    howToConnect: 'Turn the printer on, then scan and tap Connect.',
    accent: '#0F766E',
    accentSoft: '#F0FDFA',
    accentBorder: '#99F6E4',
  },
  josh: {
    id: 'josh',
    name: 'SEZNIK Josh',
    shortName: 'Josh',
    tagline: 'Compact printer with automatic die-cut alignment',
    howToConnect: 'Turn Josh on, then scan and tap Connect.',
    accent: '#1878B8',
    accentSoft: '#E4F3FB',
    accentBorder: '#BFE0F1',
  },
};

export const CONSUMER_PRINTER_LIST: ConsumerPrinter[] = [
  CONSUMER_PRINTERS.tejas,
  CONSUMER_PRINTERS.rudra,
  CONSUMER_PRINTERS.josh,
];

const CONSUMER_IDS = new Set<string>(['tejas', 'rudra', 'josh']);

export function isConsumerPrinterId(value: unknown): value is ConsumerPrinterId {
  return typeof value === 'string' && CONSUMER_IDS.has(value);
}

/** Driver used by scan and connect. Tejas and Rudra both use TD-404. */
export function toDriverModel(id: ConsumerPrinterId): 'td404' | 'josh' {
  return id === 'josh' ? 'josh' : 'td404';
}

/** Connect-screen family must match the native driver being opened. */
export function consumerMatchesDriver(
  consumer: ConsumerPrinterId,
  driver: 'td404' | 'josh' | 'dev' | 'tez' | 'labelx' | 'generic',
): boolean {
  if (driver === 'josh') return consumer === 'josh';
  if (driver === 'td404') return consumer === 'tejas' || consumer === 'rudra';
  return true;
}

/**
 * Map a persisted driver id (or already-migrated consumer id) to the connect-screen choice.
 * Unknown legacy drivers land on Tejas unless the live SDK is Josh.
 */
export function consumerIdFromLegacy(
  model: string | null | undefined,
  sdkId?: string | null,
): ConsumerPrinterId {
  if (isConsumerPrinterId(model)) return model;
  if (model === 'josh' || sdkId === 'josh') return 'josh';
  return 'tejas';
}

/** Last printer connected for one family. connectedAt is missing on entries saved before it existed. */
export type LastModelDevice = { id: string; name: string; connectedAt?: number };

export function migrateLastDeviceForModel(
  raw: Partial<Record<string, LastModelDevice>> | null | undefined,
): Partial<Record<ConsumerPrinterId, LastModelDevice>> {
  const source = raw ?? {};
  const next: Partial<Record<ConsumerPrinterId, LastModelDevice>> = {};
  if (source.tejas) next.tejas = source.tejas;
  else if (source.td404) next.tejas = source.td404;
  if (source.rudra) next.rudra = source.rudra;
  if (source.josh) next.josh = source.josh;
  return next;
}
