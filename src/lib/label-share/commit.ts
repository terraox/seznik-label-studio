/**
 * The one-commit import: write pictures and clipart, then save the label. All file and store access
 * is injected (`CommitDeps`), so the logic, including the rollback, runs in node tests with an
 * in-memory fake. `native.ts` supplies the real file system and stores.
 */

import { EDITOR_IMAGE_MAX_EDGE_PX, workingSizePx } from '@/lib/editor/image-ingest';
import type { LabelDocument } from '@/lib/label-document';
import { finalizeDocument, uniqueLabelName, type PlacedImage } from './finalize';
import { protectImportUris, releaseImportUris } from './import-guard';
import type { ParsedLabel } from './import';
import type { MissingItem } from './schema';
import { sanitizeSvgStrict } from './svg-strict';

export type CommitDeps = {
  /** Folder URIs end with "/". */
  imagesDir: () => Promise<string>;
  clipartDir: () => Promise<string>;
  writeBytes: (uri: string, bytes: Uint8Array) => Promise<void>;
  /** Writes text into sezprint/clipart and returns the file URI. */
  writeClipartText: (fileName: string, text: string) => Promise<string>;
  /** Best-effort copy to the public Documents folder (Android). */
  publish: (subdir: 'images' | 'clipart', uri: string) => Promise<void>;
  deleteFile: (uri: string) => Promise<void>;
  /** Write a downscaled JPEG copy of `printUri` to `destUri`. */
  makeWorkingCopy: (printUri: string, width: number, height: number, destUri: string) => Promise<void>;
  existingLabelNames: () => string[];
  /** Adds the label to the store. Synchronous: this is the commit point. */
  saveLabel: (doc: LabelDocument) => void;
  /** Returns false when the clipart library is full. */
  addClipart: (item: { id: string; label: string; kind: 'svg' | 'image'; fileUri: string; widthPx?: number; heightPx?: number }) => boolean;
  removeClipart: (id: string) => void;
  /** Install a packed font under the name the label uses. Returns an undo, or null when the font library is full. */
  installFont: (font: { family: string; ext: 'ttf' | 'otf'; bytes: Uint8Array }) => Promise<{ undo: () => Promise<void> } | null>;
  rememberSvg: (id: string, svg: string) => void;
  newId: (prefix?: string) => string;
  now: () => number;
  safeFileName: (id: string, name: string, ext: string) => string;
};

export async function commitParsedLabel(
  parsed: ParsedLabel,
  d: CommitDeps,
): Promise<{ doc: LabelDocument; missing: MissingItem[]; installedFonts: string[] }> {
  const written: string[] = [];
  const guarded: string[] = [];
  const addedClipart: string[] = [];
  const fontUndos: (() => Promise<void>)[] = [];
  const installedFonts: string[] = [];
  const missing = [...parsed.missing];
  try {
    const imagesDir = await d.imagesDir();
    const images = new Map<string, PlacedImage>();
    for (const path of parsed.usedAssets) {
      const asset = parsed.assets.get(path);
      if (!asset || asset.kind !== 'image' || !path.startsWith('assets/images/')) continue;
      const id = d.newId('img');
      const printName = `${id}-print.${asset.ext}`;
      const printUri = `${imagesDir}${printName}`;
      const previewUri = `${imagesDir}${id}-preview.jpg`;
      // From here the cleanup must leave these alone until the label names them.
      guarded.push(printUri, previewUri);
      protectImportUris([printUri, previewUri]);
      written.push(printUri);
      await d.writeBytes(printUri, asset.bytes);
      await d.publish('images', printUri);
      const widthPx = asset.width ?? 1;
      const heightPx = asset.height ?? 1;
      const working = workingSizePx(widthPx, heightPx, EDITOR_IMAGE_MAX_EDGE_PX);
      let uri = printUri;
      if (working.downscaled) {
        written.push(previewUri);
        await d.makeWorkingCopy(printUri, working.widthPx, working.heightPx, previewUri);
        await d.publish('images', previewUri);
        uri = previewUri;
      }
      images.set(path, {
        printUri,
        uri,
        workingWidthPx: working.downscaled ? working.widthPx : widthPx,
        workingHeightPx: working.downscaled ? working.heightPx : heightPx,
        widthPx,
        heightPx,
        fileName: printName,
      });
    }

    const clipartIds = new Map<string, string>();
    for (const item of parsed.userClipart) {
      const asset = parsed.assets.get(item.path);
      if (!asset) continue;
      const newId = d.newId('svg');
      let fileUri: string;
      let svg: string | null = null;
      if (item.kind === 'svg') {
        svg = sanitizeSvgStrict(new TextDecoder().decode(asset.bytes));
        if (!svg) continue;
        fileUri = await d.writeClipartText(d.safeFileName(newId, `${newId}.svg`, 'svg'), svg);
      } else {
        const dir = await d.clipartDir();
        fileUri = `${dir}${d.safeFileName(newId, `${newId}.${asset.ext}`, asset.ext)}`;
        written.push(fileUri);
        await d.writeBytes(fileUri, asset.bytes);
        await d.publish('clipart', fileUri);
      }
      if (item.kind === 'svg') written.push(fileUri);
      const saved = d.addClipart({
        id: newId,
        label: item.label,
        kind: item.kind,
        fileUri,
        ...(item.kind === 'image' ? { widthPx: asset.width, heightPx: asset.height } : {}),
      });
      if (!saved) {
        // The library is full: the file is not kept, and the label lists the clipart as missing.
        await d.deleteFile(fileUri);
        written.splice(written.indexOf(fileUri), 1);
        missing.push({ kind: 'user-clipart', name: item.label, detail: 'your clipart library is full' });
        continue;
      }
      if (svg) d.rememberSvg(newId, svg);
      addedClipart.push(newId);
      clipartIds.set(item.oldId, newId);
    }

    // Fonts that came in the file are installed under the exact name the label uses.
    for (const font of parsed.fonts) {
      const done = await d.installFont({ family: font.family, ext: font.ext, bytes: font.bytes });
      if (!done) {
        missing.push({ kind: 'font', name: font.family, detail: 'your font library is full, the system font is used instead' });
        continue;
      }
      fontUndos.push(done.undo);
      installedFonts.push(font.family);
    }

    const doc = finalizeDocument(parsed, {
      id: d.newId('label'),
      name: uniqueLabelName(parsed.document.name, d.existingLabelNames()),
      now: d.now(),
      images,
      clipartIds,
    });
    // The single commit: from here the label names its pictures.
    d.saveLabel(doc);
    return { doc, missing, installedFonts };
  } catch (error) {
    for (const id of addedClipart) d.removeClipart(id);
    await Promise.all(fontUndos.map((undo) => undo().catch(() => undefined)));
    await Promise.all(written.map((uri) => d.deleteFile(uri).catch(() => undefined)));
    throw error;
  } finally {
    releaseImportUris(guarded);
  }
}
