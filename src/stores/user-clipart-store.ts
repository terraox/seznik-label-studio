import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ClipartItem } from '@/lib/clipart/types';

const MAX_USER_CLIPART = 200;

type UserClipartState = {
  items: ClipartItem[];
  add: (item: Omit<ClipartItem, 'source' | 'category'> & { label: string }) => ClipartItem | null;
  remove: (id: string) => void;
};

export const useUserClipartStore = create<UserClipartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: ({ id, label, svg }) => {
        if (get().items.length >= MAX_USER_CLIPART) return null;
        const next: ClipartItem = {
          id,
          label,
          svg,
          category: 'mine',
          source: 'user',
        };
        set({ items: [next, ...get().items.filter((item) => item.id !== id)] });
        return next;
      },
      remove: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },
    }),
    {
      name: 'sez-user-clipart-svg',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
