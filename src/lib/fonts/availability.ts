import type { FontLibraryItem } from '@/constants/font-library';
import type { InstalledFontRecord } from '@/lib/fonts/types';

export function isCatalogFontInstalled(
  item: FontLibraryItem,
  installed: readonly InstalledFontRecord[],
): boolean {
  if (item.source === 'bundled') return true;
  return installed.some((font) => font.id === item.id);
}

export function findLibraryFont(
  name: string,
  library: readonly FontLibraryItem[],
): FontLibraryItem | undefined {
  return library.find((font) => font.name === name || font.id === name);
}

/** True when the face can be drawn in the editor or sent to print. */
export function isFontNameReady(
  name: string | undefined,
  installed: readonly InstalledFontRecord[],
  library: readonly FontLibraryItem[],
): boolean {
  if (!name || name === 'Default' || name === 'Barcode') return true;
  const face = findLibraryFont(name, library);
  if (!face) {
    return installed.some(
      (font) => font.name === name || font.id === name || font.familyKey === name,
    );
  }
  return isCatalogFontInstalled(face, installed);
}

export function needsFontDownload(
  name: string,
  installed: readonly InstalledFontRecord[],
  library: readonly FontLibraryItem[],
): boolean {
  const face = findLibraryFont(name, library);
  if (!face || face.source !== 'catalog') return false;
  return !isCatalogFontInstalled(face, installed);
}
