import * as FileSystem from 'expo-file-system/legacy';

import { removeUserClipart } from '@/lib/clipart/user-storage';
import { removeInstalledFont } from '@/lib/fonts/install';
import { ensureSezprintDir } from '@/lib/user-files/root';
import type { SezprintSubdir } from '@/lib/user-files/paths';
import { useDataStore } from '@/stores/data-store';
import { useInstalledFontStore } from '@/stores/installed-font-store';
import { useLabelStore } from '@/stores/label-store';
import { usePrintHistoryStore } from '@/stores/print-history-store';
import { useUserClipartStore } from '@/stores/user-clipart-store';

async function emptyDirectory(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path).catch(() => null);
  if (!info?.exists || !info.isDirectory) return;
  const entries = await FileSystem.readDirectoryAsync(path).catch(() => [] as string[]);
  await Promise.all(
    entries.map((entry) =>
      FileSystem.deleteAsync(`${path}${entry}`, { idempotent: true }),
    ),
  );
}

async function emptySezprintSubdir(subdir: SezprintSubdir): Promise<void> {
  const dir = await ensureSezprintDir(subdir);
  await emptyDirectory(dir);
}

async function clearCacheDirectory(): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return;
  await emptyDirectory(dir);
}

/** Clear every cache category shown on Cache Settings (WePrint-style clear all). */
export async function clearAllAppCache(): Promise<void> {
  const dataStore = useDataStore.getState();
  const fontItems = [...useInstalledFontStore.getState().items];
  const clipartItems = [...useUserClipartStore.getState().items];

  useLabelStore.setState({ documents: [], groups: [], cloudTemplates: [] });

  const excelIds = dataStore.excelFiles.map((file) => file.id);
  const pdfIds = dataStore.pdfFiles.map((file) => file.id);
  for (const id of excelIds) dataStore.removeExcelFile(id);
  for (const id of pdfIds) dataStore.removePdfFile(id);
  useDataStore.setState({
    remoteLinks: [],
    activeExcelFileId: null,
    activeRowIndex: 0,
  });

  for (const font of fontItems) {
    await removeInstalledFont(font.id);
  }

  for (const item of clipartItems) {
    await removeUserClipart(item.id);
  }

  usePrintHistoryStore.getState().clearAll();

  await Promise.all([
    emptySezprintSubdir('labels'),
    emptySezprintSubdir('images'),
    emptySezprintSubdir('fonts'),
    emptySezprintSubdir('clipart'),
    emptySezprintSubdir('excel'),
    emptySezprintSubdir('pdf'),
    emptySezprintSubdir('print-history'),
    clearCacheDirectory(),
  ]);

}
