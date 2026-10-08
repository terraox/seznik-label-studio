import * as FileSystem from 'expo-file-system/legacy';

import type { PrintHistoryEntry } from '@/lib/print-history/types';

const CACHE_DIR_NAME = 'sez-print';
const CACHE_FILE_NAME = 'print-history.json';

function cacheFileUri(): string | null {
  const root = FileSystem.cacheDirectory;
  if (!root) return null;
  return `${root}${CACHE_DIR_NAME}/${CACHE_FILE_NAME}`;
}

export async function readPrintHistoryCache(): Promise<PrintHistoryEntry[]> {
  const uri = cacheFileUri();
  if (!uri) return [];
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as PrintHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writePrintHistoryCache(entries: PrintHistoryEntry[]): Promise<void> {
  const uri = cacheFileUri();
  if (!uri) return;
  try {
    const dir = uri.slice(0, uri.lastIndexOf('/') + 1);
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(entries));
  } catch {
    // Best-effort local cache mirror.
  }
}

export async function clearPrintHistoryCache(): Promise<void> {
  const uri = cacheFileUri();
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}
