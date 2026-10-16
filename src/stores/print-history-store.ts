import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { writePrintHistoryCache, clearPrintHistoryCache } from '@/lib/print-history/cache-file';
import {
  deleteHistorySnapshot,
  migrateInlineSnapshotsToFiles,
  persistHistorySnapshot,
} from '@/lib/print-history/snapshot-file';
import { usePrintStatsStore } from '@/stores/print-stats-store';
import type { PrintHistoryEntry } from '@/lib/print-history/types';
import { cloneDocument, generateId } from '@/lib/label-document';

export type { PrintHistoryEntry } from '@/lib/print-history/types';

const MAX_ENTRIES = 200;

type PrintHistoryState = {
  entries: PrintHistoryEntry[];
  addEntry: (entry: Omit<PrintHistoryEntry, 'id' | 'printedAt'>) => void;
  removeEntry: (id: string) => void;
  removeEntriesForDay: (dayKey: string) => void;
  clearAll: () => void;
  replaceEntries: (entries: PrintHistoryEntry[]) => void;
};

/** Local calendar day `YYYY-MM-DD` for grouping history. */
export function printHistoryDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function stripInlineSnapshot(entry: PrintHistoryEntry): PrintHistoryEntry {
  if (!entry.documentSnapshot) return entry;
  const { documentSnapshot: _removed, ...rest } = entry;
  return rest;
}

function syncCache(entries: PrintHistoryEntry[]) {
  void writePrintHistoryCache(entries.map(stripInlineSnapshot));
}

export const usePrintHistoryStore = create<PrintHistoryState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => {
          const id = generateId('print');
          const snap = entry.documentSnapshot ? cloneDocument(entry.documentSnapshot) : undefined;
          const stored: PrintHistoryEntry = stripInlineSnapshot({
            ...entry,
            id,
            printedAt: Date.now(),
            snapshotFileId: snap ? id : entry.snapshotFileId,
          });
          if (snap) {
            void persistHistorySnapshot(id, snap);
          }
          const merged = [stored, ...state.entries];
          const entries = merged.slice(0, MAX_ENTRIES);
          for (const old of merged.slice(MAX_ENTRIES)) {
            if (old.snapshotFileId) void deleteHistorySnapshot(old.snapshotFileId);
          }
          syncCache(entries);
          usePrintStatsStore.getState().record(entry.copies, stored.printedAt);
          return { entries };
        }),

      removeEntry: (id) =>
        set((state) => {
          const removed = state.entries.find((item) => item.id === id);
          if (removed?.snapshotFileId) void deleteHistorySnapshot(removed.snapshotFileId);
          const entries = state.entries.filter((item) => item.id !== id);
          syncCache(entries);
          return { entries };
        }),

      removeEntriesForDay: (dayKey) =>
        set((state) => {
          const removed = state.entries.filter((item) => printHistoryDayKey(item.printedAt) === dayKey);
          for (const entry of removed) {
            if (entry.snapshotFileId) void deleteHistorySnapshot(entry.snapshotFileId);
          }
          const entries = state.entries.filter((item) => printHistoryDayKey(item.printedAt) !== dayKey);
          syncCache(entries);
          return { entries };
        }),

      clearAll: () => {
        const entries = usePrintHistoryStore.getState().entries;
        for (const entry of entries) {
          if (entry.snapshotFileId) void deleteHistorySnapshot(entry.snapshotFileId);
        }
        void clearPrintHistoryCache();
        set({ entries: [] });
      },

      replaceEntries: (entries) => {
        const next = entries.map(stripInlineSnapshot).slice(0, MAX_ENTRIES);
        syncCache(next);
        set({ entries: next });
      },
    }),
    {
      name: 'sez-print/print-history',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        entries: state.entries.map(stripInlineSnapshot),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state?.entries?.length) return;
        void migrateInlineSnapshotsToFiles(state.entries).then((migrated) => {
          const hadInline = state.entries.some((e) => e.documentSnapshot);
          if (hadInline) {
            usePrintHistoryStore.getState().replaceEntries(migrated);
          } else {
            void writePrintHistoryCache(migrated);
          }
        });
      },
    },
  ),
);
