/** Purchased printer options shown after register and in the admin printers catalog. */
export const APP_PRINTER_OPTIONS = [
  {
    id: 'tejas',
    printerName: 'SEZNIK Tejas',
    shortName: 'Tejas',
    bridge: 'bluetooth-spp',
    tagline: 'High-resolution labels for jewellery and stickers',
  },
  {
    id: 'rudra',
    printerName: 'SEZNIK Rudra',
    shortName: 'Rudra',
    bridge: 'bluetooth-spp',
    tagline: 'Same fast label engine, sized for daily shop work',
  },
  {
    id: 'josh',
    printerName: 'SEZNIK Josh',
    shortName: 'Josh',
    bridge: 'josh-lpapi',
    tagline: 'Compact printer with automatic die-cut alignment',
  },
] as const;

export type AppPrinterId = (typeof APP_PRINTER_OPTIONS)[number]['id'];

export function isAppPrinterId(value: unknown): value is AppPrinterId {
  return value === 'tejas' || value === 'rudra' || value === 'josh';
}

export function printerDisplayName(id: string | null | undefined): string | null {
  if (!id) return null;
  const match = APP_PRINTER_OPTIONS.find((p) => p.id === id);
  return match?.printerName ?? id;
}
