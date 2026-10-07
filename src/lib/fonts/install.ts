import * as FileSystem from 'expo-file-system/legacy';
import * as Font from 'expo-font';

import { FONT_LIBRARY, type FontLibraryItem } from '@/constants/font-library';
import { generateId } from '@/lib/label-document';
import type { InstalledFontRecord } from '@/lib/fonts/types';
import { dropPrintTypeface } from '@/printing/raster/print-typeface-map';
import { registerPrintTypeface } from '@/printing/raster/print-typeface';
import { useInstalledFontStore } from '@/stores/installed-font-store';

const FONTS_DIR = 'user-fonts';

export async function ensureUserFontsDir(): Promise<string> {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) throw new Error('This device cannot store fonts.');
  const dir = `${root}${FONTS_DIR}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

async function activateFace(familyKey: string, fileUri: string): Promise<void> {
  await Font.loadAsync({ [familyKey]: { uri: fileUri } });
  await registerPrintTypeface(familyKey, fileUri);
}

function uniqueFontName(base: string): string {
  const taken = new Set<string>([
    ...FONT_LIBRARY.map((font) => font.name),
    ...useInstalledFontStore.getState().items.map((font) => font.name),
  ]);
  const cleaned = base.trim() || 'Imported Font';
  if (!taken.has(cleaned)) return cleaned;
  let n = 2;
  while (taken.has(`${cleaned} ${n}`)) n += 1;
  return `${cleaned} ${n}`;
}

export async function downloadCatalogFont(item: FontLibraryItem): Promise<InstalledFontRecord> {
  if (!item.downloadUrl || !item.family) {
    throw new Error(`${item.name} cannot be downloaded.`);
  }
  const dir = await ensureUserFontsDir();
  const dest = `${dir}${item.id}.ttf`;
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
  const result = await FileSystem.downloadAsync(item.downloadUrl, dest);
  if (result.status !== 200) {
    throw new Error(`Could not download ${item.name}.`);
  }
  await activateFace(item.family, dest);
  const saved = useInstalledFontStore.getState().add({
    id: item.id,
    name: item.name,
    familyKey: item.family,
    fileUri: dest,
    category: item.category,
    source: 'downloaded',
  });
  if (!saved) {
    dropPrintTypeface(item.family);
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new Error('The font library is full. Delete one to add another.');
  }
  return saved;
}

export async function importFontFile(sourceUri: string, fileName: string): Promise<InstalledFontRecord> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'ttf' && ext !== 'otf') {
    throw new Error('Please choose a .ttf or .otf file.');
  }
  const dir = await ensureUserFontsDir();
  const id = generateId('font');
  const dest = `${dir}${id}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  const familyKey = `user_${id.replace(/[^a-zA-Z0-9_]/g, '')}`;
  const label = fileName.replace(/\.(ttf|otf)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported Font';
  await activateFace(familyKey, dest);
  const saved = useInstalledFontStore.getState().add({
    id,
    name: uniqueFontName(label),
    familyKey,
    fileUri: dest,
    category: 'creative',
    source: 'imported',
  });
  if (!saved) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new Error('The font library is full. Delete one to add another.');
  }
  return saved;
}

export async function removeInstalledFont(id: string): Promise<void> {
  const item = useInstalledFontStore.getState().items.find((font) => font.id === id);
  if (!item) return;
  useInstalledFontStore.getState().remove(id);
  dropPrintTypeface(item.familyKey);
  try {
    await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
  } catch {
    // The catalog entry is already gone; a leftover file is unused.
  }
}
