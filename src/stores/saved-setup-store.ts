import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SavedSetup } from '@/lib/saved-setup';

type SavedSetupState = {
  setups: SavedSetup[];
  /** Labels the save prompt was already shown for (saved or skipped), so it asks once. */
  askedLabelIds: string[];
  add: (setup: SavedSetup) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  touch: (id: string) => void;
  markAsked: (labelId: string) => void;
  wasAsked: (labelId: string) => boolean;
};

export const useSavedSetupStore = create<SavedSetupState>()(
  persist(
    (set, get) => ({
      setups: [],
      askedLabelIds: [],
      add: (setup) => set((s) => ({ setups: [setup, ...s.setups] })),
      remove: (id) => set((s) => ({ setups: s.setups.filter((x) => x.id !== id) })),
      rename: (id, name) => {
        const next = name.trim();
        if (!next) return;
        set((s) => ({ setups: s.setups.map((x) => (x.id === id ? { ...x, name: next } : x)) }));
      },
      touch: (id) =>
        set((s) => ({ setups: s.setups.map((x) => (x.id === id ? { ...x, lastUsedAt: Date.now() } : x)) })),
      markAsked: (labelId) =>
        set((s) =>
          s.askedLabelIds.includes(labelId) ? s : { askedLabelIds: [...s.askedLabelIds, labelId].slice(-200) },
        ),
      wasAsked: (labelId) => get().askedLabelIds.includes(labelId),
    }),
    { name: 'saved-setups', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
