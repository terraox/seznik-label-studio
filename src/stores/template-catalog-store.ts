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
  /** Admin categories it sits in; may be empty. Every template is listed under All either way. */
  categoryIds: string[];
  widthMm: number;
  heightMm: number;
  svgCode: string;
  contentHash: string;
  /** Sample content designed in the admin (elements in mm), absent when none. */
  sampleLayout?: unknown;
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
            items: (Omit<CatalogTemplate, 'widthMm' | 'heightMm' | 'categoryIds'> & {
              widthMm: number | null;
              heightMm: number | null;
              categoryIds?: string[];
              categoryId?: string | null;
            })[];
          };
          set({
            categories: data.categories,
            templates: data.items
              .filter((i) => i.widthMm && i.heightMm && i.svgCode)
              .map(({ categoryId, categoryIds, ...i }) => ({
                ...i,
                // Servers from before multi-category send a single categoryId.
                categoryIds: categoryIds ?? (categoryId ? [categoryId] : []),
                widthMm: i.widthMm as number,
                heightMm: i.heightMm as number,
              })),
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
      // v0 saved a single categoryId per template; v1 keeps a list.
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as { categories?: CatalogCategory[]; templates?: (CatalogTemplate & { categoryId?: string | null })[] };
        if (version < 1 && state.templates) {
          state.templates = state.templates.map(({ categoryId, ...t }) => ({
            ...t,
            categoryIds: t.categoryIds ?? (categoryId ? [categoryId] : []),
          }));
        }
        return state as CatalogState;
      },
    },
  ),
);
