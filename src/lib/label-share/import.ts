/**
 * Read and vet a .seznik label file. Pure: nothing is written anywhere. The result is what the import
 * screen shows; `finalize.ts` + the native commit turn it into a saved label.
 */

import type { LabelDocument } from '@/lib/label-document';
import { LIMITS, SEZLABEL_FORMAT, SEZLABEL_SCHEMA_VERSION } from './limits';
import { sniffFont } from './font-sniff';
import { sniffImage, type SniffedImage } from './image-sniff';
import { sha256Hex } from './sha256';
import { sanitizeSvgStrict } from './svg-strict';
import { assertSafeJson, forEachElement, validateDocument, type MissingItem, type ValidatedDocument } from './schema';
import { compareVersions, isVersionString } from './version';
import { ShareFormatError, readZip } from './zip';

export type ImportEnv = {
  appVersion: string;
  palette: readonly string[];
  isKnownClipartId: (id: string) => boolean;
  isKnownBorderStyle: (id: string) => boolean;
  /** True when the font name resolves on this phone (Default and Barcode always do). */
  isFontAvailable: (name: string) => boolean;
  newId: () => string;
};

export type ParsedAsset = {
  kind: 'image' | 'svg' | 'font';
  bytes: Uint8Array;
  ext: string;
  width?: number;
  height?: number;
};

export type ParsedUserClipart = {
  oldId: string;
  label: string;
  kind: 'svg' | 'image';
  path: string;
  widthPx?: number;
  heightPx?: number;
};

/** A font that travelled in the file and this phone does not have. */
export type ParsedFont = { family: string; path: string; ext: 'ttf' | 'otf'; bytes: Uint8Array };

export type ParsedManifest = {
  schemaVersion: number;
  minAppVersion: string;
  createdWithAppVersion?: string;
  labelId: string;
  labelName: string;
  palette: string[];
  dataColumns: string[];
  knownLimits: string[];
};

export type ParsedLabel = {
  manifest: ParsedManifest;
  document: ValidatedDocument['document'];
  counts: Record<string, number>;
  elementCount: number;
  missing: MissingItem[];
  warnings: string[];
  fontNames: string[];
  paletteChanged: boolean;
  bulkColumns: string[];
  assets: Map<string, ParsedAsset>;
  userClipart: ParsedUserClipart[];
  /** Packed fonts the label uses and this phone lacks. Installed when the label is added. */
  fonts: ParsedFont[];
  /** Asset paths the saved label will actually use. */
  usedAssets: Set<string>;
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const BAD = "This file isn't a valid Sez Print label.";
const bad = (code: string, message = BAD): never => {
  throw new ShareFormatError(message, code);
};

function decodeJson(bytes: Uint8Array, what: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return bad('bad-utf8', `${what} is not valid text.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return bad('bad-json', `${what} is not valid.`);
  }
}

function parseManifest(raw: unknown, env: ImportEnv): ParsedManifest & { files: { path: string; bytes: number; sha256: string }[]; userClipart: Json[]; fontFiles: Json[] } {
  if (!isObj(raw)) bad('bad-manifest');
  const m = raw as Json;
  assertSafeJson(m);
  if (m.format !== SEZLABEL_FORMAT) bad('bad-format');
  if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion) || m.schemaVersion < 1) bad('bad-schema');
  if (!isVersionString(m.minAppVersion)) bad('bad-min-version');
  // Version gate comes first: a newer file is refused whole, never half-opened.
  if ((m.schemaVersion as number) > SEZLABEL_SCHEMA_VERSION || compareVersions(m.minAppVersion as string, env.appVersion) > 0) {
    throw new ShareFormatError('Update Sez Print to open this label.', 'needs-newer-app');
  }
  if (!Array.isArray(m.files) || m.files.length > LIMITS.entries) bad('bad-files');
  const files = (m.files as unknown[]).map((f) => {
    if (!isObj(f) || typeof f.path !== 'string' || typeof f.sha256 !== 'string' || typeof f.bytes !== 'number') return bad('bad-files');
    return { path: f.path as string, bytes: f.bytes as number, sha256: f.sha256 as string };
  });
  const palette = Array.isArray(m.palette) ? (m.palette as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 32) : [];
  const userClipart = Array.isArray(m.userClipart) ? (m.userClipart as unknown[]).filter(isObj).slice(0, LIMITS.userClipart) : [];
  return {
    schemaVersion: m.schemaVersion as number,
    minAppVersion: m.minAppVersion as string,
    createdWithAppVersion: typeof m.createdWithAppVersion === 'string' ? m.createdWithAppVersion.slice(0, 40) : undefined,
    labelId: typeof m.labelId === 'string' ? m.labelId.slice(0, LIMITS.idChars) : '',
    labelName: typeof m.labelName === 'string' ? m.labelName.slice(0, LIMITS.nameChars) : '',
    palette,
    dataColumns: Array.isArray(m.dataColumns) ? (m.dataColumns as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 100).map((c) => c.slice(0, 200)) : [],
    knownLimits: Array.isArray(m.knownLimits) ? (m.knownLimits as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 10).map((c) => c.slice(0, 400)) : [],
    files,
    userClipart,
    fontFiles: Array.isArray(m.fontFiles) ? (m.fontFiles as unknown[]).filter(isObj).slice(0, LIMITS.fonts) : [],
  };
}

function checkImageBytes(bytes: Uint8Array, allowWebp: boolean): SniffedImage {
  const s = sniffImage(bytes);
  if (!s || (s.kind === 'webp' && !allowWebp)) return bad('bad-image', 'A picture in this label file is not a supported image.');
  if (
    bytes.length > LIMITS.imageBytes ||
    s.width > LIMITS.imageEdgePx ||
    s.height > LIMITS.imageEdgePx ||
    s.width * s.height > LIMITS.imagePixels
  ) {
    return bad('image-too-large', 'A picture in this label file is too large.');
  }
  return s;
}

export function parseSezlabel(fileBytes: Uint8Array, env: ImportEnv): ParsedLabel {
  const entries = readZip(fileBytes);

  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) bad('no-manifest');
  const manifest = parseManifest(decodeJson(manifestBytes as Uint8Array, 'The manifest'), env);

  // Every part must be listed with the right size and hash, and every listed part must exist.
  const listed = new Map<string, { bytes: number; sha256: string }>();
  for (const f of manifest.files) {
    if (f.path === 'manifest.json' || listed.has(f.path)) bad('bad-files');
    listed.set(f.path, f);
  }
  for (const [path, data] of entries) {
    if (path === 'manifest.json') continue;
    const entry = listed.get(path);
    if (!entry) return bad('unlisted-entry', 'This label file contains parts that are not listed.');
    if (entry.bytes !== data.length || entry.sha256 !== sha256Hex(data)) {
      return bad('hash-mismatch', 'This label file is damaged (a part does not match its checksum).');
    }
  }
  for (const path of listed.keys()) if (!entries.has(path)) bad('missing-entry', 'This label file is damaged (a listed part is missing).');

  const documentBytes = entries.get('document.json');
  if (!documentBytes) bad('no-document');

  // Assets: content is sniffed, never trusted by name. Pictures that are not pictures reject the file.
  const assets = new Map<string, ParsedAsset>();
  let imageCount = 0;
  for (const [path, data] of entries) {
    if (!path.startsWith('assets/')) continue;
    const ext = path.slice(path.lastIndexOf('.') + 1);
    if (path.startsWith('assets/clipart/') && ext === 'svg') {
      const clean = sanitizeSvgStrict(new TextDecoder('utf-8').decode(data));
      if (clean) assets.set(path, { kind: 'svg', bytes: new TextEncoder().encode(clean), ext: 'svg' });
      continue; // an unsafe SVG is reported later as a missing item, not as a failure
    }
    if (path.startsWith('assets/fonts/')) {
      const f = sniffFont(data);
      if (!f || f.ext !== ext || data.length > LIMITS.fontBytes) bad('bad-font', 'A font in this label file is not a usable font.');
      assets.set(path, { kind: 'font', bytes: data, ext: f!.ext });
      continue;
    }
    const inClipart = path.startsWith('assets/clipart/');
    const s = checkImageBytes(data, inClipart);
    const okExt = s.kind === 'jpeg' ? ['jpg', 'jpeg'] : [s.kind];
    if (!okExt.includes(ext)) bad('type-mismatch', 'A picture in this label file does not match its type.');
    imageCount += 1;
    if (imageCount > LIMITS.images) bad('too-many-images', 'This label file has too many pictures.');
    assets.set(path, { kind: 'image', bytes: data, ext: s.kind === 'jpeg' ? 'jpg' : s.kind, width: s.width, height: s.height });
  }

  // User clipart declared in the manifest.
  const declared = new Map<string, ParsedUserClipart>();
  for (const raw of manifest.userClipart) {
    if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > LIMITS.idChars) continue;
    if (typeof raw.path !== 'string' || !raw.path.startsWith('assets/clipart/')) continue;
    if (raw.kind !== 'svg' && raw.kind !== 'image') continue;
    declared.set(raw.id, {
      oldId: raw.id,
      label: typeof raw.label === 'string' ? raw.label.slice(0, 80) : 'Clipart',
      kind: raw.kind,
      path: raw.path,
    });
  }

  const imageAssets = new Map<string, { kind: 'image' | 'svg' }>();
  for (const [path, a] of assets) if (path.startsWith('assets/images/') && a.kind === 'image') imageAssets.set(path, { kind: 'image' });

  const validated = validateDocument(decodeJson(documentBytes as Uint8Array, 'The label'), {
    assets: imageAssets,
    userClipartIds: new Set(declared.keys()),
    isKnownClipartId: env.isKnownClipartId,
    isKnownBorderStyle: env.isKnownBorderStyle,
    newId: env.newId,
  });

  const missing = [...validated.missing];
  const usedAssets = new Set(validated.usedAssets);

  // Which user clipart does the label really use, and is its file usable?
  const usedClipart: ParsedUserClipart[] = [];
  const seen = new Set<string>();
  forEachElement(validated.document as unknown as LabelDocument, (el) => {
    if (el.type !== 'clipart' || !declared.has(el.clipartId) || seen.has(el.clipartId)) return;
    seen.add(el.clipartId);
    const info = declared.get(el.clipartId)!;
    const asset = assets.get(info.path);
    const matches = asset && ((info.kind === 'svg' && asset.kind === 'svg') || (info.kind === 'image' && asset.kind === 'image'));
    if (matches) {
      usedClipart.push({ ...info, widthPx: asset!.width, heightPx: asset!.height });
      usedAssets.add(info.path);
    } else {
      missing.push({ kind: 'user-clipart', name: info.label, detail: 'the clipart file was missing or not safe' });
    }
  });

  // Fonts: a font packed in the file is installed with the label. Otherwise the name is kept and the
  // system font is drawn until the font is installed.
  const packed = new Map<string, ParsedFont>();
  for (const raw of manifest.fontFiles) {
    if (typeof raw.family !== 'string' || typeof raw.path !== 'string' || !raw.path.startsWith('assets/fonts/')) continue;
    const a = assets.get(raw.path);
    if (a?.kind === 'font') packed.set(raw.family, { family: raw.family, path: raw.path, ext: a.ext as 'ttf' | 'otf', bytes: a.bytes });
  }
  const fonts: ParsedFont[] = [];
  for (const name of validated.fontNames) {
    if (env.isFontAvailable(name)) continue;
    const file = packed.get(name);
    if (file) {
      fonts.push(file);
      usedAssets.add(file.path);
    } else {
      missing.push({ kind: 'font', name, detail: 'the system font is used instead' });
    }
  }

  const same =
    manifest.palette.length === env.palette.length &&
    manifest.palette.every((c, i) => c.toLowerCase() === env.palette[i].toLowerCase());
  const paletteChanged = manifest.palette.length > 0 && !same;

  const doc = validated.document as unknown as LabelDocument;
  const bulkColumns = doc.bulk ? doc.bulk.slots.map((s) => s.columnName) : [];

  return {
    manifest,
    document: validated.document,
    counts: validated.counts,
    elementCount: doc.elements.length,
    missing,
    warnings: validated.warnings,
    fontNames: validated.fontNames,
    paletteChanged,
    bulkColumns,
    assets,
    userClipart: usedClipart,
    fonts,
    usedAssets,
  };
}
