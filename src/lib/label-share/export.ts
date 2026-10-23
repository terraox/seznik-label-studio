/**
 * Build a .seznik from a LabelDocument. Pure: file access is injected, so it runs in node tests.
 * The caller passes a document obtained through `getDocument` (already migrated).
 */

import { readPaperType, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { LIMITS, SEZLABEL_FORMAT, SEZLABEL_KNOWN_LIMITS, SEZLABEL_MIN_APP_VERSION, SEZLABEL_SCHEMA_VERSION, SEZLABEL_EXTENSION } from './limits';
import { sniffFont } from './font-sniff';
import { imageExtension, sniffImage, type SniffedImage } from './image-sniff';
import { sha256Hex } from './sha256';
import { stableStringify } from './stable-json';
import { sanitizeSvgStrict } from './svg-strict';
import { forEachElement } from './schema';
import { ShareFormatError, writeZip } from './zip';

export type UserClipartSource = {
  id: string;
  label: string;
  kind: 'svg' | 'image';
  /** SVG text (kind svg) or file bytes (kind image). */
  svg?: string;
  bytes?: Uint8Array;
  widthPx?: number;
  heightPx?: number;
};

export type ExportEnv = {
  appVersion: string;
  palette: readonly string[];
  now: () => number;
  /** Bytes of a local image file, or null when it cannot be read. */
  readImage: (uri: string) => Promise<Uint8Array | null>;
  readReferenceImage: (fileName: string) => Promise<Uint8Array | null>;
  /** The user's own clipart for this id, or null for built-in / unknown ids. */
  getUserClipart: (id: string) => Promise<UserClipartSource | null>;
  /** PNG of the label for file thumbnails. Display only. */
  preview?: Uint8Array | null;
  includeUserClipart: boolean;
  /** Pack the user's own (imported) fonts that the label uses. */
  includeFonts: boolean;
  /** Bytes of a font the user imported themselves, by the name the label stores. Null for built-in or downloaded fonts. */
  getImportedFont: (name: string) => Promise<Uint8Array | null>;
};

export type ExportSummary = {
  elements: number;
  images: number;
  userClipart: number;
  fonts: string[];
  /** How many font files travel in the file. */
  fontFiles: number;
  skipped: string[];
};

export type ExportResult = { bytes: Uint8Array; fileName: string; summary: ExportSummary };

/** Design-level settings that travel. Everything else on `settings` stays on the sender's phone. */
export const SETTINGS_IN_FILE = [
  'mirrorMode',
  'flagLabel',
  'mirrorRowsCount',
  'mirrorSpacingMm',
  'mirrorRowNumber',
  'antiColor',
  'defaultDrawingColorIndex',
] as const;

const enc = new TextEncoder();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function fileNameFor(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `${slug || 'label'}.${SEZLABEL_EXTENSION}`;
}

export async function buildSezlabel(source: LabelDocument, env: ExportEnv): Promise<ExportResult> {
  const doc = clone(source) as LabelDocument & Record<string, unknown>;
  const skipped: string[] = [];
  const assets = new Map<string, Uint8Array>(); // path -> bytes
  const byHash = new Map<string, string>(); // sha256 -> path
  const userClipart: { id: string; label: string; kind: 'svg' | 'image'; path: string; widthPx?: number; heightPx?: number }[] = [];
  const fontNames = new Set<string>();

  const addAsset = (dir: 'images' | 'clipart' | 'fonts', ext: string, data: Uint8Array): string => {
    const hash = sha256Hex(data);
    const key = `${dir}/${hash}`;
    const known = byHash.get(key);
    if (known) return known;
    const path = `assets/${dir}/${hash.slice(0, 32)}.${ext}`;
    byHash.set(key, path);
    assets.set(path, data);
    return path;
  };

  const checkImage = (data: Uint8Array | null, what: string): SniffedImage | null => {
    if (!data) {
      skipped.push(`${what}: file not found`);
      return null;
    }
    const sniffed = sniffImage(data);
    if (!sniffed) {
      skipped.push(`${what}: not a PNG or JPEG`);
      return null;
    }
    if (
      data.length > LIMITS.imageBytes ||
      sniffed.width > LIMITS.imageEdgePx ||
      sniffed.height > LIMITS.imageEdgePx ||
      sniffed.width * sniffed.height > LIMITS.imagePixels
    ) {
      skipped.push(`${what}: picture is too large to share`);
      return null;
    }
    return sniffed;
  };

  const imageAssetFor = async (uri: string, what: string): Promise<string | null> => {
    if (!uri || /^https?:|^data:/i.test(uri)) return null;
    const data = await env.readImage(uri);
    const sniffed = checkImage(data, what);
    return sniffed && data ? addAsset('images', imageExtension(sniffed.kind), data) : null;
  };

  const handled = new Set<string>();
  const elements: LabelElement[] = [];
  forEachElement(doc, (el) => elements.push(el));
  if (elements.length > LIMITS.elements) {
    throw new ShareFormatError('This label has too many elements to share.', 'too-many-elements');
  }

  for (const el of elements) {
    const rec = el as unknown as Record<string, unknown>;
    if (typeof rec.fontFamily === 'string' && rec.fontFamily) fontNames.add(rec.fontFamily);
    if (Array.isArray(rec.cells)) {
      for (const row of rec.cells as { fontFamily?: string }[][]) {
        for (const cell of row ?? []) if (cell?.fontFamily) fontNames.add(cell.fontFamily);
      }
    }
    if (el.type === 'image') {
      const src = (el.printUri || el.uri || '').trim();
      const path = await imageAssetFor(src, 'picture');
      delete (rec as { uri?: string }).uri;
      delete rec.printUri;
      delete rec.workingWidthPx;
      delete rec.workingHeightPx;
      if (path) rec.printUri = path;
    } else if (el.type === 'clipart') {
      const id = el.clipartId;
      if (handled.has(id)) continue;
      const info = await env.getUserClipart(id);
      if (!info) continue;
      handled.add(id);
      if (!env.includeUserClipart) {
        skipped.push(`clipart "${info.label}": left out by choice`);
        continue;
      }
      if (info.kind === 'svg') {
        const clean = info.svg ? sanitizeSvgStrict(info.svg) : null;
        if (!clean) {
          skipped.push(`clipart "${info.label}": SVG is not safe to share`);
          continue;
        }
        userClipart.push({ id, label: info.label, kind: 'svg', path: addAsset('clipart', 'svg', enc.encode(clean)) });
      } else {
        const sniffed = checkImage(info.bytes ?? null, `clipart "${info.label}"`);
        if (!sniffed || !info.bytes) continue;
        userClipart.push({
          id,
          label: info.label,
          kind: 'image',
          path: addAsset('clipart', imageExtension(sniffed.kind), info.bytes),
          widthPx: sniffed.width,
          heightPx: sniffed.height,
        });
      }
    }
  }

  // Background image.
  if (doc.background?.type === 'image') {
    const path = await imageAssetFor(doc.background.uri, 'background picture');
    if (path) doc.background = { type: 'image', uri: path };
    else delete doc.background;
  }
  // Reference photo.
  if (doc.referenceImage) {
    const data = await env.readReferenceImage(doc.referenceImage.fileName);
    const sniffed = checkImage(data, 'guide photo');
    if (sniffed && data) {
      doc.referenceImage = { ...doc.referenceImage, fileName: addAsset('images', imageExtension(sniffed.kind), data) };
    } else {
      delete doc.referenceImage;
    }
  }
  // Template outline: only through the strict check.
  if (doc.templateSvg) {
    const clean = sanitizeSvgStrict(doc.templateSvg.xml);
    if (clean) doc.templateSvg = { xml: clean };
    else {
      delete doc.templateSvg;
      skipped.push('label outline: SVG is not safe to share');
    }
  }
  // Bulk: structure and column names only.
  let bulkColumns: string[] | undefined;
  if (doc.bulk) {
    bulkColumns = doc.bulk.slots.map((s) => s.columnName);
    const bulk = doc.bulk as unknown as Record<string, unknown>;
    delete bulk.excelFileId;
    delete bulk.rowContentOverrides;
    delete bulk.rowCopiesOverrides;
  }
  // Settings: design-level subset only.
  if (doc.settings) {
    const picked: Record<string, unknown> = {};
    for (const key of SETTINGS_IN_FILE) {
      const value = (doc.settings as unknown as Record<string, unknown>)[key];
      if (value !== undefined) picked[key] = value;
    }
    if (Object.keys(picked).length) doc.settings = picked as never;
    else delete doc.settings;
  }
  // Fonts: the user's own imported fonts ride along when allowed. Names always travel (manifest.fonts).
  const fontFiles: { family: string; path: string }[] = [];
  for (const family of [...fontNames].sort()) {
    if (family === 'Default' || family === 'Barcode') continue;
    const data = await env.getImportedFont(family);
    if (!data) continue; // built-in or downloaded: the receiver has it or can get it from its own library
    if (!env.includeFonts) {
      skipped.push(`font "${family}": left out by choice`);
      continue;
    }
    const sniffed = sniffFont(data);
    if (!sniffed || data.length > LIMITS.fontBytes) {
      skipped.push(`font "${family}": not a usable TrueType/OpenType file`);
      continue;
    }
    if (fontFiles.length >= LIMITS.fonts) {
      skipped.push(`font "${family}": too many fonts to pack (max ${LIMITS.fonts})`);
      continue;
    }
    fontFiles.push({ family, path: addAsset('fonts', sniffed.ext, data) });
  }

  // Local identity never travels.
  const out = doc as Record<string, unknown>;
  const labelId = String(out.id);
  delete out.id;
  delete out.groupId;
  delete out.createdAt;
  delete out.updatedAt;
  // Only Receipt, Label, Transparent or Cardstock is written. An old Black mark label goes out as Label.
  out.paperType = readPaperType(out.paperType);
  out.schemaVersion = SEZLABEL_SCHEMA_VERSION;

  const documentBytes = enc.encode(stableStringify(out));
  if (documentBytes.length > LIMITS.documentJsonBytes) {
    throw new ShareFormatError('This label is too large to share.', 'document-too-large');
  }

  const files: { path: string; data: Uint8Array }[] = [{ path: 'document.json', data: documentBytes }];
  for (const [path, data] of assets) files.push({ path, data });
  if (env.preview && env.preview.length <= LIMITS.previewBytes && sniffImage(env.preview)?.kind === 'png') {
    files.push({ path: 'preview.png', data: env.preview });
  }

  const manifest = {
    format: SEZLABEL_FORMAT,
    schemaVersion: SEZLABEL_SCHEMA_VERSION,
    minAppVersion: SEZLABEL_MIN_APP_VERSION,
    createdWithAppVersion: env.appVersion,
    createdAt: env.now(),
    labelId,
    labelName: doc.name,
    labelSizeMm: { w: doc.widthMm, h: doc.heightMm },
    palette: [...env.palette],
    includesData: false,
    files: files.map((f) => ({ path: f.path, bytes: f.data.length, sha256: sha256Hex(f.data) })),
    fonts: [...fontNames].sort().map((family) => ({
      family,
      source: family === 'Default' || family === 'Barcode' ? 'system' : 'named',
    })),
    userClipart,
    fontFiles,
    dataColumns: bulkColumns ?? [],
    notShared: ['printer', 'dpi', 'offsets', 'darkness', 'speed', 'gap', 'flip', 'grid', 'ruler', 'spreadsheet rows'],
    knownLimits: [...SEZLABEL_KNOWN_LIMITS],
  };
  const manifestBytes = enc.encode(stableStringify(manifest));

  const bytes = writeZip([...files, { path: 'manifest.json', data: manifestBytes }]);
  if (bytes.length > LIMITS.fileBytes) {
    throw new ShareFormatError('This label is too large to share (over 30 MB).', 'too-large');
  }

  return {
    bytes,
    fileName: fileNameFor(doc.name),
    summary: {
      elements: doc.elements.length,
      images: [...assets.keys()].filter((p) => p.startsWith('assets/images/')).length,
      userClipart: userClipart.length,
      fonts: [...fontNames],
      fontFiles: fontFiles.length,
      skipped,
    },
  };
}
