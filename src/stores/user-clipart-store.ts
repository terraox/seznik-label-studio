import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UserClipartKind } from '@/lib/clipart/types';

const MAX_USER_CLIPART = 200;
const LEGACY_KEY = 'sez-user-clipart-svg';

export type StoredUserClipart = {
  id: string;
  label: string;
  kind: UserClipartKind;
  fileUri: string;
  widthPx?: number;
  heightPx?: number;
};

type UserClipartState = {
  items: StoredUserClipart[];
  revision: number;
  add: (item: StoredUserClipart) => StoredUserClipart | null;
  remove: (id: string) => void;
  replaceAll: (items: StoredUserClipart[]) => void;
  touch: () => void;
};

export const useUserClipartStore = create<UserClipartState>()(
  persist(
    (set, get) => ({
      items: [],
      revision: 0,
      add: (item) => {
        if (!get().items.some((entry) => entry.id === item.id) && get().items.length >= MAX_USER_CLIPART) {
          return null;
        }
        set({
          items: [item, ...get().items.filter((entry) => entry.id !== item.id)],
          revision: get().revision + 1,
        });
        return item;
      },
      remove: (id) => {
        set({
          items: get().items.filter((entry) => entry.id !== id),
          revision: get().revision + 1,
        });
      },
      replaceAll: (items) => set({ items, revision: get().revision + 1 }),
      touch: () => set({ revision: get().revision + 1 }),
    }),
    {
      name: 'sez-user-clipart-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        void migrateAfterRehydrate(state?.items ?? []);
      },
    },
  ),
);

async function migrateAfterRehydrate(current: StoredUserClipart[]): Promise<void> {
  const { migrateLegacyClipartItems } = await import('@/lib/clipart/user-storage');
  let legacy: unknown[] = [];
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { items?: unknown[] } };
      legacy = parsed.state?.items ?? [];
    }
  } catch {
    legacy = [];
  }

  const inline = current.filter((item) => !item.fileUri || !item.kind) as StoredUserClipart[];
  const needsWork = legacy.length > 0 || inline.length > 0;
  if (!needsWork) {
    const { hydrateUserClipartSvgs } = await import('@/lib/clipart/user-storage');
    await hydrateUserClipartSvgs();
    return;
  }

  try {
    const migrated = await migrateLegacyClipartItems([
      ...(legacy as []),
      ...current,
    ]);
    useUserClipartStore.getState().replaceAll(migrated);
    if (legacy.length > 0) await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    // Keep whatever metadata we already have.
  }
  const { hydrateUserClipartSvgs } = await import('@/lib/clipart/user-storage');
  await hydrateUserClipartSvgs();
}
