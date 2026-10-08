import { readPrintHistoryCache, writePrintHistoryCache } from '@/lib/print-history/cache-file';
import { usePrintHistoryStore } from '@/stores/print-history-store';
import { usePrinterStore } from '@/stores/printer-store';

let migrated = false;

/** Pull legacy AsyncStorage history into the dedicated print-history store once. */
export async function migratePrintHistoryOnce(): Promise<void> {
  if (migrated) return;
  migrated = true;

  if (!usePrintHistoryStore.persist.hasHydrated()) {
    await usePrintHistoryStore.persist.rehydrate();
  }

  const store = usePrintHistoryStore.getState();
  if (store.entries.length > 0) {
    await writePrintHistoryCache(store.entries);
    return;
  }

  const legacy = usePrinterStore.getState().history;
  if (legacy.length > 0) {
    store.replaceEntries(legacy);
    usePrinterStore.setState({ history: [] });
    return;
  }

  const fromCache = await readPrintHistoryCache();
  if (fromCache.length > 0) {
    store.replaceEntries(fromCache);
  }
}
