/**
 * Safe zip reading and deterministic zip writing for .seznik (fflate 0.8.3).
 *
 * Reading never extracts to disk and never trusts a declared size:
 *  1. The central directory is read WITHOUT inflating (fflate `filter`), every entry is checked.
 *  2. Entries are then inflated one by one through the streaming API with a running byte
 *     budget, and the actual size must equal the declared size.
 * fflate accepts any entry name (it does not strip "../"), so all name rules live here.
 */

import { Unzip, UnzipInflate, unzipSync, zipSync, type Zippable } from 'fflate';

import { ALLOWED_DIRS, LIMITS } from './limits';

export class ShareFormatError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ShareFormatError';
  }
}

const fail = (code: string, message: string): never => {
  throw new ShareFormatError(message, code);
};

const ROOT_FILES = new Set(['manifest.json', 'document.json', 'preview.png']);
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** True when `name` is a path this format may contain. */
export function isAllowedEntryName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > LIMITS.entryNameChars) return false;
   
  if (/[\u0000-\u001f\u007f\\:]/.test(name)) return false;
  if (name.startsWith('/') || name.endsWith('/') || name.includes('..') || name.includes('//')) return false;
  if (name !== name.toLowerCase()) return false;
  if (ROOT_FILES.has(name)) return true;
  const dir = ALLOWED_DIRS.find((d) => name.startsWith(d));
  if (!dir) return false;
  const rest = name.slice(dir.length);
  return NAME_RE.test(rest) && !rest.includes('/');
}

function perEntryLimit(name: string): number {
  if (name === 'manifest.json') return LIMITS.manifestJsonBytes;
  if (name === 'document.json') return LIMITS.documentJsonBytes;
  if (name === 'preview.png') return LIMITS.previewBytes;
  if (name.endsWith('.svg')) return LIMITS.svgBytes;
  if (name.startsWith('assets/fonts/')) return LIMITS.fontBytes;
  return LIMITS.imageBytes;
}

export type ZipEntryInfo = { name: string; compressed: number; declared: number; method: number };

/** Read and vet the central directory. Nothing is inflated here. */
export function listZipEntries(bytes: Uint8Array): ZipEntryInfo[] {
  if (bytes.length > LIMITS.fileBytes) fail('too-large', 'This label file is too large.');
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    fail('not-zip', "This file isn't a valid Sez Print label.");
  }
  const infos: ZipEntryInfo[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        infos.push({
          name: f.name,
          compressed: f.size,
          declared: f.originalSize,
          method: f.compression,
        });
        return false;
      },
    });
  } catch {
    return fail('bad-zip', "This file isn't a valid Sez Print label.");
  }

  if (infos.length === 0) fail('empty', 'This label file is empty.');
  if (infos.length > LIMITS.entries) fail('too-many-entries', 'This label file has too many parts.');
  const seen = new Set<string>();
  let total = 0;
  for (const info of infos) {
    if (!isAllowedEntryName(info.name)) fail('bad-name', 'This label file contains an unsafe path.');
    const key = info.name.toLowerCase();
    if (seen.has(key)) fail('duplicate', 'This label file contains duplicate parts.');
    seen.add(key);
    if (info.method !== 0 && info.method !== 8) fail('bad-method', 'This label file uses an unsupported format.');
    if (!Number.isFinite(info.declared) || info.declared < 0 || info.declared > perEntryLimit(info.name)) {
      fail('entry-too-large', 'A part of this label file is too large.');
    }
    // The ratio guard is for pictures/SVG. document.json and manifest.json are already capped at
    // 5 MB / 256 KB, and repetitive JSON (many similar elements) legitimately compresses well.
    if (
      !info.name.endsWith('.json') &&
      info.declared > LIMITS.ratioFloorBytes &&
      info.compressed > 0 &&
      info.declared / info.compressed > LIMITS.maxRatio
    ) {
      fail('ratio', 'This label file looks like a decompression bomb.');
    }
    total += info.declared;
    if (total > LIMITS.totalInflatedBytes) fail('total-too-large', 'This label file expands to too much data.');
  }
  return infos;
}

/** Inflate every entry with a real byte budget. Returns path -> bytes. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const infos = listZipEntries(bytes);
  const declared = new Map(infos.map((i) => [i.name, i]));
  const chunks = new Map<string, Uint8Array[]>();
  const sizes = new Map<string, number>();
  let total = 0;
  let error: ShareFormatError | null = null;

  const unzipper = new Unzip((file) => {
    if (error) return;
    const info = declared.get(file.name);
    if (!info || chunks.has(file.name)) {
      error = new ShareFormatError('This label file does not match its own index.', 'index-mismatch');
      file.terminate();
      return;
    }
    const limit = Math.min(info.declared, perEntryLimit(file.name));
    chunks.set(file.name, []);
    sizes.set(file.name, 0);
    file.ondata = (err, chunk) => {
      if (error) return;
      if (err) {
        error = new ShareFormatError("This file isn't a valid Sez Print label.", 'inflate');
        file.terminate();
        return;
      }
      const used = (sizes.get(file.name) ?? 0) + chunk.length;
      total += chunk.length;
      if (used > limit || total > LIMITS.totalInflatedBytes) {
        error = new ShareFormatError('A part of this label file is larger than it says.', 'size-lie');
        file.terminate();
        return;
      }
      sizes.set(file.name, used);
      chunks.get(file.name)!.push(chunk);
    };
    file.start();
  });
  unzipper.register(UnzipInflate);
  try {
    unzipper.push(bytes, true);
  } catch {
    fail('bad-zip', "This file isn't a valid Sez Print label.");
  }
  if (error) throw error;

  const out = new Map<string, Uint8Array>();
  for (const info of infos) {
    const parts = chunks.get(info.name);
    if (!parts) fail('missing-entry', 'This label file is damaged.');
    const size = sizes.get(info.name) ?? 0;
    if (size !== info.declared) fail('size-lie', 'A part of this label file is larger or smaller than it says.');
    const data = new Uint8Array(size);
    let at = 0;
    for (const part of parts!) {
      data.set(part, at);
      at += part.length;
    }
    out.set(info.name, data);
  }
  return out;
}

const FIXED_MTIME = new Date(Date.UTC(2020, 0, 1));

/** Deterministic zip: sorted paths, fixed timestamps; images are stored, text is deflated. */
export function writeZip(entries: { path: string; data: Uint8Array }[]): Uint8Array {
  const zippable: Zippable = {};
  for (const entry of [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isAllowedEntryName(entry.path)) fail('bad-name', `Cannot write path ${entry.path}`);
    const store = !/\.(json|svg)$/.test(entry.path);
    zippable[entry.path] = [entry.data, { level: store ? 0 : 6, mtime: FIXED_MTIME }];
  }
  return zipSync(zippable, { mtime: FIXED_MTIME });
}
