import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { apiBase } from '@/lib/auth/api';
import { appHeaders } from '@/lib/telemetry/app-headers';
import { useAuthStore } from '@/stores/auth-store';

export type CatalogCategory = { id: string; name: string };
export type CatalogTemplate = {
  id: string;
  name: string;
  categoryId: string;
  widthMm: number;
  heightMm: number;
  svgCode: string;
  contentHash: string;
};

type CatalogState = {
  categories: CatalogCategory[];
  templates: CatalogTemplate[];
  loading: boolean;
  /** Downloads the published templates; keeps what is on the phone when offline. */
  refresh: () => Promise<void>;
};

export const useTemplateCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      categories: [],
      templates: [],
      loading: false,
      refresh: async () => {
        const token = useAuthStore.getState().token;
        if (!token || get().loading) return;
        set({ loading: true });
        try {
          const res = await fetch(`${apiBase()}/api/v1/templates`, {
            headers: { Authorization: `Bearer ${token}`, ...appHeaders() },
          });
          if (!res.ok) return;
          const data = (await res.json()) as {
            categories: CatalogCategory[];
            items: (Omit<CatalogTemplate, 'widthMm' | 'heightMm'> & {
              widthMm: number | null;
              heightMm: number | null;
            })[];
          };
          set({
            categories: data.categories,
            templates: data.items
              .filter((i) => i.widthMm && i.heightMm && i.svgCode)
              .map((i) => ({ ...i, widthMm: i.widthMm as number, heightMm: i.heightMm as number })),
          });
        } catch {
          // offline: keep the copy already on the phone
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: 'sez-template-catalog-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ categories: s.categories, templates: s.templates }),
    },
  ),
);
