import type { InstalledFontRecord } from '@/lib/fonts/types';

export type LookupFont = {
  id: string;
  name: string;
  family?: string;
  /** Catalog faces are not resolvable until a file is installed. */
  source?: 'bundled' | 'catalog' | string;
};

export type LookupInstalled = Pick<InstalledFontRecord, 'id' | 'name' | 'familyKey'>;

type FontCarrier = {
  fontFamily?: unknown;
  cells?: unknown;
};

/**
 * Map a stored font name to the family key RN and Skia should draw.
 * Installed file-backed faces win. Catalog entries that were never downloaded do not resolve.
 * `Default` / `Barcode` / empty stay unset so print falls back to Inter.
 */
export function lookupFontFamily(
  name: string | undefined,
  bundled: LookupFont[],
  installed: LookupInstalled[] = [],
): string | undefined {
  if (!name || name === 'Default' || name === 'Barcode') return undefined;
  const extra = installed.find(
    (font) => font.name === name || font.id === name || font.familyKey === name,
  );
  if (extra?.familyKey) return extra.familyKey;
  const face = bundled.find(
    (font) => (font.name === name || font.id === name) && font.source !== 'catalog',
  );
  return face?.family;
}

/** Unique font names on a label, including table cells. */
export function collectDocumentFontNames(doc: { elements: readonly object[] }): string[] {
  const names = new Set<string>();
  for (const element of doc.elements) {
    const record = element as FontCarrier;
    if (typeof record.fontFamily === 'string' && record.fontFamily) names.add(record.fontFamily);
    if (!Array.isArray(record.cells)) continue;
    for (const row of record.cells) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!cell || typeof cell !== 'object') continue;
        const family = (cell as { fontFamily?: unknown }).fontFamily;
        if (typeof family === 'string' && family) names.add(family);
      }
    }
  }
  return [...names];
}
