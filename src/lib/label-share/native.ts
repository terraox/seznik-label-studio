/**
 * The phone side of .seznik: reading and writing files, the stores, and the one-commit import.
 * Everything pure lives in the other files of this folder and is covered by `npm run test:label-share`.
 * This file is NOT run by those tests (it needs the app runtime) and is on the device checklist.
 */

import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { DRAWING_COLORS } from '@/components/editor/types';
import { BORDER_LIBRARY, resolveBorderStyle } from '@/constants/border-library';
import { FONT_LIBRARY } from '@/constants/font-library';
import { getClipartById } from '@/constants/clipart-library';
import { cachedUserSvg, rememberUserSvg } from '@/lib/clipart/user-storage';
import * as Font from 'expo-font';

import { isFontNameReady } from '@/lib/fonts/availability';
import { generateId, type LabelDocument } from '@/lib/label-document';
import { isSafeReferenceFileName } from '@/lib/reference-image';
import { safeImportFileName } from '@/lib/user-files/paths';
import {
  deleteSezprintFile,
  ensureSezprintDir,
  publishSezprintFile,
  readSezprintText,
  writeTextIntoSezprint,
} from '@/lib/user-files/root';
import { useInstalledFontStore } from '@/stores/installed-font-store';
import { dropPrintTypeface } from '@/printing/raster/print-typeface-map';
import { registerPrintTypeface } from '@/printing/raster/print-typeface';
import { useLabelStore } from '@/stores/label-store';
import { useUserClipartStore } from '@/stores/user-clipart-store';

import { base64ToBytes, bytesToBase64 } from './base64';
import { buildSezlabel, type ExportEnv, type ExportResult } from './export';
import { commitParsedLabel } from './commit';
import { parseSezlabel, type ImportEnv, type ParsedLabel } from './import';
import { LIMITS, SEZLABEL_MIME } from './limits';
import { forEachElement, type MissingItem } from './schema';
import { ShareFormatError } from './zip';

const BASE64 = { encoding: FileSystem.EncodingType.Base64 } as const;

export function currentAppVersion(): string {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.1';
}

async function readBytes(uri: string): Promise<Uint8Array | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return null;
    return base64ToBytes(await FileSystem.readAsStringAsync(uri, BASE64));
  } catch {
    return null;
  }
}

async function writeBytes(uri: string, bytes: Uint8Array): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), BASE64);
}

// ───────────────────────────── export ─────────────────────────────

/** How many of this label's fonts the user imported themselves (these can ride in the file). */
export function countOwnFonts(doc: LabelDocument): number {
  const own = useInstalledFontStore.getState().items.filter((f) => f.source === 'imported');
  const used = new Set<string>();
  const visit = (name: unknown) => {
    if (typeof name !== 'string') return;
    const hit = own.find((f) => f.name === name || f.id === name || f.familyKey === name);
    if (hit) used.add(hit.id);
  };
  forEachElement(doc, (el) => {
    const rec = el as unknown as { fontFamily?: unknown; cells?: { fontFamily?: unknown }[][] };
    visit(rec.fontFamily);
    for (const row of rec.cells ?? []) for (const cell of row ?? []) visit(cell?.fontFamily);
  });
  return used.size;
}

/** How many of this label's clipart are the user's own (they ride in the file when allowed). */
export function countOwnClipart(doc: LabelDocument): number {
  const own = new Set(useUserClipartStore.getState().items.map((i) => i.id));
  const used = new Set<string>();
  forEachElement(doc, (el) => {
    if (el.type === 'clipart' && own.has(el.clipartId)) used.add(el.clipartId);
  });
  return used.size;
}

function exportEnv(opts: { includeUserClipart: boolean; includeFonts: boolean; preview?: Uint8Array | null }): ExportEnv {
  return {
    appVersion: currentAppVersion(),
    palette: DRAWING_COLORS,
    now: () => Date.now(),
    includeUserClipart: opts.includeUserClipart,
    includeFonts: opts.includeFonts,
    getImportedFont: async (name) => {
      const item = useInstalledFontStore.getState().items.find((f) => f.source === 'imported' && (f.name === name || f.id === name || f.familyKey === name));
      return item ? readBytes(item.fileUri) : null;
    },
    preview: opts.preview ?? null,
    readImage: async (uri) => (/^(file|content):/i.test(uri) ? readBytes(uri) : null),
    readReferenceImage: async (fileName) => {
      if (!isSafeReferenceFileName(fileName)) return null;
      return readBytes(`${await ensureSezprintDir('images')}${fileName}`);
    },
    getUserClipart: async (id) => {
      const item = useUserClipartStore.getState().items.find((entry) => entry.id === id);
      if (!item) return null;
      if (item.kind === 'svg') {
        const svg = cachedUserSvg(id) ?? (await readSezprintText(item.fileUri)) ?? undefined;
        return { id, label: item.label, kind: 'svg', svg };
      }
      return { id, label: item.label, kind: 'image', bytes: (await readBytes(item.fileUri)) ?? undefined, widthPx: item.widthPx, heightPx: item.heightPx };
    },
  };
}

/** Build the .seznik for a saved label (read through getDocument, so it is already migrated) and write it to cache. */
export async function exportLabelFile(
  labelId: string,
  opts: { includeUserClipart: boolean; includeFonts: boolean; previewBase64?: string | null },
): Promise<ExportResult & { uri: string; name: string }> {
  const doc = useLabelStore.getState().getDocument(labelId);
  if (!doc) throw new ShareFormatError('That label could not be found.', 'no-label');
  const preview = opts.previewBase64 ? base64ToBytes(opts.previewBase64) : null;
  const result = await buildSezlabel(doc, exportEnv({ includeUserClipart: opts.includeUserClipart, includeFonts: opts.includeFonts, preview }));
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('This device has no place to prepare the file.');
  const uri = `${dir}${result.fileName}`;
  await writeBytes(uri, result.bytes);
  return { ...result, uri, name: doc.name };
}

export const SHARE_MIME = 'application/zip';
export { SEZLABEL_MIME };

// ───────────────────────────── import: read ─────────────────────────────

function importEnv(): ImportEnv {
  const installed = () => useInstalledFontStore.getState().items;
  return {
    appVersion: currentAppVersion(),
    palette: DRAWING_COLORS,
    newId: () => generateId(),
    isKnownClipartId: (id) => getClipartById(id) !== undefined,
    isKnownBorderStyle: (id) => id === 'solid-medium' || resolveBorderStyle(id) !== 'solid-medium' || BORDER_LIBRARY.some((i) => i.id === id),
    isFontAvailable: (name) => isFontNameReady(name, installed(), FONT_LIBRARY),
  };
}

/** Read and vet a picked file. Nothing is written. Throws ShareFormatError with a plain message. */
export async function readLabelFile(uri: string): Promise<ParsedLabel> {
  // Content URIs (a chosen folder) may not report a size; the read below is still bounded.
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  if (info && (!info.exists || info.isDirectory)) throw new ShareFormatError('That file could not be opened.', 'unreadable');
  if (info && info.exists && typeof info.size === 'number' && info.size > LIMITS.fileBytes) {
    throw new ShareFormatError('This label file is too large.', 'too-large');
  }
  const bytes = await readBytes(uri);
  if (!bytes) throw new ShareFormatError('That file could not be opened.', 'unreadable');
  return parseSezlabel(bytes, importEnv());
}

/** The id of an already-saved label with the same origin id, if any. */
export function findSameLabel(parsed: ParsedLabel): LabelDocument | null {
  const id = parsed.manifest.labelId;
  if (!id) return null;
  const s = useLabelStore.getState();
  return s.documents.find((d) => d.id === id) ?? s.cloudTemplates.find((d) => d.id === id) ?? null;
}

// ───────────────────────────── import: commit ─────────────────────────────

/**
 * Write the pictures and clipart, then add the label to the store in one synchronous step
 * (logic and rollback live in commit.ts and are covered by node tests with an in-memory fake).
 * Always a NEW label (new id, folder none, fresh dates).
 */
export function commitImport(parsed: ParsedLabel): Promise<{ doc: LabelDocument; missing: MissingItem[]; installedFonts: string[] }> {
  return commitParsedLabel(parsed, {
    imagesDir: () => ensureSezprintDir('images'),
    clipartDir: () => ensureSezprintDir('clipart'),
    writeBytes,
    writeClipartText: (fileName, text) => writeTextIntoSezprint('clipart', fileName, text),
    publish: (subdir, uri) => publishSezprintFile(subdir, uri),
    deleteFile: (uri) => deleteSezprintFile(uri),
    makeWorkingCopy: async (printUri, width, height, destUri) => {
      const ctx = ImageManipulator.manipulate(printUri);
      ctx.resize({ width, height });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      await FileSystem.copyAsync({ from: saved.uri, to: destUri });
    },
    existingLabelNames: () => useLabelStore.getState().documents.map((d) => d.name),
    saveLabel: (doc) => useLabelStore.getState().upsertDocument(doc),
    addClipart: (item) => useUserClipartStore.getState().add(item) !== null,
    removeClipart: (id) => useUserClipartStore.getState().remove(id),
    installFont: async ({ family, ext, bytes }) => {
      const id = generateId('font');
      const dir = await ensureSezprintDir('fonts');
      const fileUri = `${dir}${safeImportFileName(id, `${id}.${ext}`, ext)}`;
      const familyKey = `user_${id.replace(/[^a-zA-Z0-9_]/g, '')}`;
      await writeBytes(fileUri, bytes);
      const undo = async () => {
        useInstalledFontStore.getState().remove(id);
        dropPrintTypeface(familyKey);
        await deleteSezprintFile(fileUri);
      };
      try {
        await publishSezprintFile('fonts', fileUri);
        await Font.loadAsync({ [familyKey]: { uri: fileUri } });
        await registerPrintTypeface(familyKey, fileUri);
      } catch {
        await undo();
        return null;
      }
      const saved = useInstalledFontStore.getState().add({ id, name: family, familyKey, fileUri, category: 'local', source: 'imported' });
      if (!saved) {
        await undo();
        return null;
      }
      return { undo };
    },
    rememberSvg: rememberUserSvg,
    newId: (prefix) => generateId(prefix),
    now: () => Date.now(),
    safeFileName: safeImportFileName,
  });
}
