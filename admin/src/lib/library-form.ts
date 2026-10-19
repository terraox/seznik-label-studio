import { HttpError } from './http';
import { MAX_SVG_BYTES, sanitizeSvg } from './catalog/sanitize-svg';
import type { LibraryKind } from './library';

/** Reads the SVG file from a form, cleans it and returns the code plus what was removed. */
export async function readSvg(file: unknown) {
  if (!file || typeof file === 'string') return null;
  const f = file as File;
  if (f.size > MAX_SVG_BYTES) throw new HttpError(400, `The file is larger than ${MAX_SVG_BYTES / 1024} KB.`);
  if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') throw new HttpError(400, 'Only .svg files are accepted.');
  const clean = sanitizeSvg(Buffer.from(await f.arrayBuffer()));
  if (!clean.ok) throw new HttpError(400, clean.message);
  return clean;
}

export function sizeFrom(kind: LibraryKind, rawW: unknown, rawH: unknown, detected: { widthMm: number | null; heightMm: number | null } | null) {
  const w = rawW === '' || rawW == null ? NaN : Number(rawW);
  const h = rawH === '' || rawH == null ? NaN : Number(rawH);
  const widthMm = Number.isFinite(w) ? w : detected?.widthMm ?? null;
  const heightMm = Number.isFinite(h) ? h : detected?.heightMm ?? null;
  if (kind === 'template' && !(widthMm && heightMm && widthMm > 0 && heightMm > 0 && widthMm <= 1000 && heightMm <= 1000)) {
    throw new HttpError(400, 'A template needs a label size (width and height in mm).');
  }
  return { widthMm, heightMm };
}

