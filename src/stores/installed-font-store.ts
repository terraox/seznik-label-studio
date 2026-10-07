import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { InstalledFontRecord } from '@/lib/fonts/types';

const MAX_INSTALLED_FONTS = 40;

type InstalledFontState = {
  items: InstalledFontRecord[];
  /** Bumped when faces are added, removed, or loaded so the canvas re-reads fontFamily. */
  revision: number;
  add: (item: InstalledFontRecord) => InstalledFontRecord | null;
  remove: (id: string) => void;
  touch: () => void;
};

export const useInstalledFontStore = create<InstalledFontState>()(
  persist(
    (set, get) => ({
      items: [],
      revision: 0,
      add: (item) => {
        const existing = get().items.some((font) => font.id === item.id);
        if (!existing && get().items.length >= MAX_INSTALLED_FONTS) return null;
        set({
          items: [item, ...get().items.filter((font) => font.id !== item.id)],
          revision: get().revision + 1,
        });
        return item;
      },
      remove: (id) => {
        set({
          items: get().items.filter((font) => font.id !== id),
          revision: get().revision + 1,
        });
      },
      touch: () => set({ revision: get().revision + 1 }),
    }),
    {
      name: 'sez-installed-fonts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
