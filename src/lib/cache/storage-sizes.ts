import * as FileSystem from 'expo-file-system/legacy';

import { ensureSezprintDir } from '@/lib/user-files/root';
import type { SezprintSubdir } from '@/lib/user-files/paths';

export type CacheCategoryId =
  | 'local'
  | 'industryTemplate'
  | 'cloud'
  | 'font'
  | 'logo'
  | 'dataFile'
  | 'printingHistory';

export type CacheCategorySizes = Record<CacheCategoryId, number>;

async function directoryBytes(path: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(path).catch(() => null);
  if (!info?.exists) return 0;
  if (!info.isDirectory) return info.size ?? 0;

  let total = 0;
  const entries = await FileSystem.readDirectoryAsync(path).catch(() => [] as string[]);
  for (const entry of entries) {
    const child = path.endsWith('/') ? `${path}${entry}` : `${path}/${entry}`;
    total += await directoryBytes(child);
  }
  return total;
}

async function sezprintSubdirBytes(subdir: SezprintSubdir): Promise<number> {
  try {
    const dir = await ensureSezprintDir(subdir);
    return directoryBytes(dir);
  } catch {
    return 0;
  }
}

async function cacheDirectoryBytes(): Promise<number> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return 0;
  return directoryBytes(dir);
}

/** Industry templates ship in the app bundle; only count optional on-disk preview cache. */
async function industryTemplateCacheBytes(): Promise<number> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return 0;
  const entries = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  let total = 0;
  for (const entry of entries) {
    if (!/template|industry/i.test(entry)) continue;
    total += await directoryBytes(`${dir}${entry}`);
  }
  return total;
}

export async function measureCacheCategorySizes(): Promise<CacheCategorySizes> {
  const [labels, images, fonts, clipart, excel, pdf, history, industry, cacheDir] = await Promise.all([
    sezprintSubdirBytes('labels'),
    sezprintSubdirBytes('images'),
    sezprintSubdirBytes('fonts'),
    sezprintSubdirBytes('clipart'),
    sezprintSubdirBytes('excel'),
    sezprintSubdirBytes('pdf'),
    sezprintSubdirBytes('print-history'),
    industryTemplateCacheBytes(),
    cacheDirectoryBytes(),
  ]);

  return {
    local: labels + images + cacheDir,
    industryTemplate: industry,
    cloud: 0,
    font: fonts,
    logo: clipart,
    dataFile: excel + pdf,
    printingHistory: history,
  };
}

export function formatCacheBytes(bytes: number): string {
  if (bytes <= 0) return '0B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes)}B`;
}

export function cacheCategoriesForDisplay(sizes: CacheCategorySizes): { id: CacheCategoryId; label: string; bytes: number }[] {
  return [
    { id: 'local', label: 'Local', bytes: sizes.local },
    { id: 'industryTemplate', label: 'Industry Template', bytes: sizes.industryTemplate },
    { id: 'cloud', label: 'Cloud', bytes: sizes.cloud },
    { id: 'font', label: 'Font', bytes: sizes.font },
    { id: 'logo', label: 'Logo Management', bytes: sizes.logo },
    { id: 'dataFile', label: 'Data File', bytes: sizes.dataFile },
    { id: 'printingHistory', label: 'Printing History', bytes: sizes.printingHistory },
  ];
}
