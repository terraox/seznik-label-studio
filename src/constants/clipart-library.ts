import {
  CLIPART_CATALOG,
  CLIPART_CATEGORIES,
  CLIPART_ID_ALIASES,
  type ClipartCatalogEntry,
  type ClipartCategoryId,
} from '@/constants/clipart-catalog';
import { buildClipartSvg } from '@/lib/clipart/build-svg';
import type { ClipartItem } from '@/lib/clipart/types';
import { useUserClipartStore } from '@/stores/user-clipart-store';

export { CLIPART_CATEGORIES, type ClipartCategoryId };
export type { ClipartItem } from '@/lib/clipart/types';

const BUILTIN: ClipartItem[] = CLIPART_CATALOG.map((entry: ClipartCatalogEntry) => ({
  id: entry.id,
  label: entry.label,
  category: entry.category,
  svg: buildClipartSvg(entry),
  source: 'builtin',
}));

const BY_ID = new Map(BUILTIN.map((item) => [item.id, item]));

export function getBuiltinClipart(): ClipartItem[] {
  return BUILTIN;
}

export function getClipartById(id: string | undefined): ClipartItem | undefined {
  if (!id) return undefined;
  const aliased = CLIPART_ID_ALIASES[id] ?? id;
  const builtin = BY_ID.get(aliased);
  if (builtin) return builtin;
  return useUserClipartStore.getState().items.find((item) => item.id === id);
}

export function getClipartForCategory(category: ClipartCategoryId | 'mine'): ClipartItem[] {
  if (category === 'mine') {
    return useUserClipartStore.getState().items;
  }
  return BUILTIN.filter((item) => item.category === category);
}

export function allClipartCount(): number {
  return BUILTIN.length + useUserClipartStore.getState().items.length;
}

export function builtinClipartCount(): number {
  return BUILTIN.length;
}

/** @deprecated Use CLIPART_CATEGORIES. Kept for any leftover imports. */
export const CLIPART_SIDEBAR = CLIPART_CATEGORIES.map((c) => c.label);
export const CLIPART_PILLS = CLIPART_CATEGORIES.map((c) => c.label);
