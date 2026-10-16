import {
  CLIPART_CATALOG,
  CLIPART_CATEGORIES,
  CLIPART_ID_ALIASES,
  type ClipartCatalogEntry,
  type ClipartCategoryId,
} from '@/constants/clipart-catalog';
import { INDIA_CLIPART } from '@/constants/clipart-india';
import { LINE_EMOJI } from '@/constants/line-emoji-catalog';
import { buildClipartSvg } from '@/lib/clipart/build-svg';
import { cachedUserSvg } from '@/lib/clipart/user-storage';
import type { ClipartItem } from '@/lib/clipart/types';
import { useUserClipartStore, type StoredUserClipart } from '@/stores/user-clipart-store';

export { CLIPART_CATEGORIES, type ClipartCategoryId };
export type { ClipartItem } from '@/lib/clipart/types';

/** The picker list: hand-drawn Indian stickers whose art matches their names. */
const BUILTIN: ClipartItem[] = INDIA_CLIPART.map((entry) => ({
  id: entry.id,
  label: entry.label,
  category: entry.category,
  svg: entry.svg,
  source: 'builtin',
}));

/**
 * The old generated grid (rt-1 ... of-80). Not listed any more, but labels saved with those ids
 * still resolve: to the new sticker when the name matches, otherwise to the drawing they had.
 */
const LEGACY: ClipartItem[] = CLIPART_CATALOG.map((entry: ClipartCatalogEntry) => ({
  id: entry.id,
  label: entry.label,
  category: entry.category,
  svg: buildClipartSvg(entry),
  source: 'builtin',
}));

const normName = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const NEW_BY_NAME = new Map(BUILTIN.map((item) => [normName(item.label), item.id]));
const LEGACY_TO_NEW = new Map<string, string>();
for (const item of LEGACY) {
  const hit = NEW_BY_NAME.get(normName(item.label));
  if (hit) LEGACY_TO_NEW.set(item.id, hit);
}

const LINE_EMOJI_ITEMS: ClipartItem[] = LINE_EMOJI.map((entry) => ({
  id: entry.id,
  label: entry.label,
  category: 'emoji',
  group: entry.group,
  svg: entry.svg,
  source: 'builtin',
}));

const BY_ID = new Map([...LEGACY, ...BUILTIN, ...LINE_EMOJI_ITEMS].map((item) => [item.id, item]));

export function getBuiltinClipart(): ClipartItem[] {
  return BUILTIN;
}

function toUserClipart(item: StoredUserClipart): ClipartItem {
  if (item.kind === 'image') {
    return {
      id: item.id,
      label: item.label,
      category: 'local',
      source: 'user',
      kind: 'image',
      fileUri: item.fileUri,
      widthPx: item.widthPx,
      heightPx: item.heightPx,
    };
  }
  return {
    id: item.id,
    label: item.label,
    category: 'local',
    source: 'user',
    kind: 'svg',
    fileUri: item.fileUri,
    svg: cachedUserSvg(item.id),
  };
}

export function getClipartById(id: string | undefined): ClipartItem | undefined {
  if (!id) return undefined;
  const aliased = LEGACY_TO_NEW.get(CLIPART_ID_ALIASES[id] ?? id) ?? CLIPART_ID_ALIASES[id] ?? id;
  const builtin = BY_ID.get(aliased);
  if (builtin) return builtin;
  const user = useUserClipartStore.getState().items.find((item) => item.id === id);
  return user ? toUserClipart(user) : undefined;
}

export function getLineEmoji(group?: string): ClipartItem[] {
  return group ? LINE_EMOJI_ITEMS.filter((item) => item.group === group) : LINE_EMOJI_ITEMS;
}

export function getClipartForCategory(category: ClipartCategoryId | 'local' | 'mine'): ClipartItem[] {
  if (category === 'local' || category === 'mine') {
    return useUserClipartStore.getState().items.map(toUserClipart);
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
