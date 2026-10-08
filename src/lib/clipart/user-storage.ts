import * as FileSystem from 'expo-file-system/legacy';

import { sanitizeUserSvg } from '@/lib/clipart/parse-svg';
import type { UserClipartKind } from '@/lib/clipart/types';
import { generateId } from '@/lib/label-document';
import { extensionFromName } from '@/lib/file-import/mime-presets';
import {
  copyImportIntoSezprint,
  deleteSezprintFile,
  readSezprintText,
  writeTextIntoSezprint,
} from '@/lib/user-files/root';
import { safeImportFileName } from '@/lib/user-files/paths';
import { useUserClipartStore, type StoredUserClipart } from '@/stores/user-clipart-store';

const SVG_EXT = new Set(['svg', 'xml']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);

const svgById = new Map<string, string>();

export function cachedUserSvg(id: string): string | undefined {
  return svgById.get(id);
}

export function rememberUserSvg(id: string, svg: string): void {
  svgById.set(id, svg);
}

function kindForName(fileName: string): UserClipartKind | null {
  const ext = extensionFromName(fileName);
  if (SVG_EXT.has(ext)) return 'svg';
  if (IMAGE_EXT.has(ext)) return 'image';
  return null;
}

export async function importUserClipartFile(
  sourceUri: string,
  fileName: string,
): Promise<StoredUserClipart> {
  const kind = kindForName(fileName);
  if (!kind) {
    throw new Error('Please choose an SVG or an image (PNG, JPG, or WebP).');
  }
  const id = generateId('svg');
  const label =
    fileName.replace(/\.(svg|xml|png|jpe?g|webp)$/i, '').replace(/[_-]+/g, ' ').trim() ||
    'Local clipart';

  if (kind === 'svg') {
    const raw = await FileSystem.readAsStringAsync(sourceUri);
    const svg = sanitizeUserSvg(raw);
    if (!svg) throw new Error('That file is not a usable SVG.');
    const name = safeImportFileName(id, fileName.endsWith('.svg') ? fileName : `${fileName}.svg`, 'svg');
    const fileUri = await writeTextIntoSezprint('clipart', name, svg);
    rememberUserSvg(id, svg);
    const saved = useUserClipartStore.getState().add({ id, label, kind, fileUri });
    if (!saved) {
      await deleteSezprintFile(fileUri);
      throw new Error('Your clipart library is full. Delete one to add another.');
    }
    return saved;
  }

  const name = safeImportFileName(id, fileName, 'png');
  const fileUri = await copyImportIntoSezprint('clipart', sourceUri, name);
  const saved = useUserClipartStore.getState().add({ id, label, kind, fileUri });
  if (!saved) {
    await deleteSezprintFile(fileUri);
    throw new Error('Your clipart library is full. Delete one to add another.');
  }
  return saved;
}

export async function removeUserClipart(id: string): Promise<void> {
  const item = useUserClipartStore.getState().items.find((entry) => entry.id === id);
  if (!item) return;
  svgById.delete(id);
  useUserClipartStore.getState().remove(id);
  await deleteSezprintFile(item.fileUri);
}

/** Read SVG files that were saved without an in-memory copy (app restart). */
export async function hydrateUserClipartSvgs(): Promise<void> {
  const items = useUserClipartStore.getState().items.filter((item) => item.kind === 'svg');
  let changed = false;
  for (const item of items) {
    if (svgById.has(item.id)) continue;
    const text = await readSezprintText(item.fileUri);
    const svg = text ? sanitizeUserSvg(text) : null;
    if (!svg) continue;
    rememberUserSvg(item.id, svg);
    changed = true;
  }
  if (changed) useUserClipartStore.getState().touch();
}

type LegacyClipart = {
  id?: string;
  label?: string;
  svg?: string;
  fileUri?: string;
  kind?: UserClipartKind;
};

/** Move inline AsyncStorage SVGs onto disk under sezprint/clipart. */
export async function migrateLegacyClipartItems(items: LegacyClipart[]): Promise<StoredUserClipart[]> {
  const next: StoredUserClipart[] = [];
  for (const item of items) {
    if (!item.id || !item.label) continue;
    if (item.fileUri && item.kind) {
      next.push({
        id: item.id,
        label: item.label,
        kind: item.kind,
        fileUri: item.fileUri,
      });
      continue;
    }
    if (!item.svg) continue;
    const svg = sanitizeUserSvg(item.svg);
    if (!svg) continue;
    const fileUri = await writeTextIntoSezprint(
      'clipart',
      safeImportFileName(item.id, `${item.id}.svg`, 'svg'),
      svg,
    );
    rememberUserSvg(item.id, svg);
    next.push({ id: item.id, label: item.label, kind: 'svg', fileUri });
  }
  return next;
}
