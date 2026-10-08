import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { writePrintHistoryCache, clearPrintHistoryCache } from '@/lib/print-history/cache-file';
import type { PrintHistoryEntry } from '@/lib/print-history/types';
import { cloneDocument, generateId } from '@/lib/label-document';

export type { PrintHistoryEntry } from '@/lib/print-history/types';

const MAX_ENTRIES = 200;

type PrintHistoryState = {
  entries: PrintHistoryEntry[];
  addEntry: (entry: Omit<PrintHistoryEntry, 'id' | 'printedAt'>) => void;
  removeEntry: (id: string) => void;
  clearAll: () => void;
  replaceEntries: (entries: PrintHistoryEntry[]) => void;
};

function syncCache(entries: PrintHistoryEntry[]) {
  void writePrintHistoryCache(entries);
}

export const usePrintHistoryStore = create<PrintHistoryState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => {
          const stored: PrintHistoryEntry = {
            ...entry,
            id: generateId('print'),
            printedAt: Date.now(),
            documentSnapshot: entry.documentSnapshot
              ? cloneDocument(entry.documentSnapshot)
              : undefined,
          };
          const entries = [stored, ...state.entries].slice(0, MAX_ENTRIES);
          syncCache(entries);
          return { entries };
        }),

      removeEntry: (id) =>
        set((state) => {
          const entries = state.entries.filter((item) => item.id !== id);
          syncCache(entries);
          return { entries };
        }),

      clearAll: () => {
        void clearPrintHistoryCache();
        set({ entries: [] });
      },

      replaceEntries: (entries) => {
        const next = entries.slice(0, MAX_ENTRIES);
        syncCache(next);
        set({ entries: next });
      },
    }),
    {
      name: 'sez-print/print-history',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
      onRehydrateStorage: () => (state) => {
        if (state?.entries?.length) {
          void writePrintHistoryCache(state.entries);
        }
      },
    },
  ),
);
