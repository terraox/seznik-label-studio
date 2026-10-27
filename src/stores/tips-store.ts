import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TipsState = {
  /** Ids of tips the user has dismissed (or already acted on). */
  seen: string[];
  markSeen: (id: string) => void;
};

/** One-time tips: each shows until it is dismissed, then never again. */
export const useTipsStore = create<TipsState>()(
  persist(
    (set, get) => ({
      seen: [],
      markSeen: (id) => {
        if (!get().seen.includes(id)) set({ seen: [...get().seen, id] });
      },
    }),
    {
      name: 'sez-tips-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ seen: s.seen }),
    },
  ),
);
