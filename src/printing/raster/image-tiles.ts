/**
 * Prepared image dots for the headless rasterizer.
 *
 * The rasterizer is synchronous, decoding is not. So before a label is rasterized, `prepareImageTiles`
 * decodes every image that uses the new print modes, runs the shared pipeline once at the final dot
 * size, and parks the finished dots here. The rasterizer then only copies them onto the page.
 * An image that has no tile here is "unsupported" for the headless path and prints the old way.
 */
import { elementSizeMm, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { rectMmToDots } from '@/lib/printer/print-spec';
import { modedImageSettings, usesModedPrint } from './image-element-settings';
import {
  imageSettingsKey,
  renderImageToMonoCached,
  resampleGray,
  type ImageSettings,
  type PlacedTile,
} from './image-modes';

type ImageEl = Extract<LabelElement, { type: 'image' }>;

export type DecodedGray = { gray: Uint8Array; width: number; height: number };
export type ImageDecoder = (uri: string) => Promise<DecodedGray | null>;

let decoder: ImageDecoder | null = null;

/** Tests and screens inject their own source. The default reads the file with the gallery decoder. */
export function setImageTileDecoder(next: ImageDecoder | null): void {
  decoder = next;
}

async function defaultDecode(uri: string): Promise<DecodedGray | null> {
  try {
    // Lazy: pulls in expo-file-system, which host-side tests do not have.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/printer/gallery-decode') as typeof import('@/lib/printer/gallery-decode');
    const out = await mod.decodeGalleryImage(uri);
    return { gray: out.gray.gray, width: out.gray.width, height: out.gray.height };
  } catch {
    return null;
  }
}

type Entry = { sig: string; dpi: number; tile: PlacedTile };
const registry = new Map<string, Entry>();
const REGISTRY_LIMIT = 48;

const decodeCache = new Map<string, DecodedGray | null>();
const DECODE_CACHE_LIMIT = 6;

/** Where the element's image goes, in dots, plus every input that changes the result. */
export function imageTileSignature(el: ImageEl, settings: ImageSettings, dpi: number): string {
  const size = elementSizeMm(el);
  const box = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  return [
    el.printUri || el.uri,
    box.widthDots,
    box.heightDots,
    el.rotation ?? 0,
    el.flipH ? 1 : 0,
    el.flipV ? 1 : 0,
    el.contentFit ?? 'contain',
    imageSettingsKey(settings),
    dpi,
  ].join('|');
}

/** The element's box in printer dots. */
export function imageBoxDots(el: ImageEl, dpi: number): { w: number; h: number } {
  const size = elementSizeMm(el);
  const box = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  return { w: Math.max(1, box.widthDots), h: Math.max(1, box.heightDots) };
}

function fitSource(
  src: DecodedGray,
  boxW: number,
  boxH: number,
  fit: 'fill' | 'contain' | 'cover',
): { gray: Uint8Array; width: number; height: number; destW: number; destH: number } {
  if (fit === 'fill') return { ...src, destW: boxW, destH: boxH };
  if (fit === 'contain') {
    const s = Math.min(boxW / src.width, boxH / src.height);
    return {
      ...src,
      destW: Math.max(1, Math.round(src.width * s)),
      destH: Math.max(1, Math.round(src.height * s)),
    };
  }
  // cover: crop the middle of the source to the box's aspect.
  const boxAspect = boxW / boxH;
  const srcAspect = src.width / src.height;
  let cw = src.width;
  let ch = src.height;
  if (srcAspect > boxAspect) cw = Math.max(1, Math.round(src.height * boxAspect));
  else ch = Math.max(1, Math.round(src.width / boxAspect));
  const x0 = Math.floor((src.width - cw) / 2);
  const y0 = Math.floor((src.height - ch) / 2);
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    out.set(src.gray.subarray((y0 + y) * src.width + x0, (y0 + y) * src.width + x0 + cw), y * cw);
  }
  return { gray: out, width: cw, height: ch, destW: boxW, destH: boxH };
}

/** Finished dots for one image element at `dpi`. Pure: no registry, no decoding. */
export function buildImageTile(
  el: ImageEl,
  src: DecodedGray,
  dpi: number,
  /** The editor view already turns the element, so its preview asks for 0. Print leaves it out. */
  opts: { rotation?: number } = {},
): PlacedTile {
  const settings = modedImageSettings(el)!;
  const rotation = opts.rotation ?? el.rotation ?? 0;
  const size = elementSizeMm(el);
  const box = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  const boxW = Math.max(1, box.widthDots);
  const boxH = Math.max(1, box.heightDots);
  const fitted = fitSource(src, boxW, boxH, el.contentFit ?? 'contain');
  return renderImageToMonoCached(`${imageTileSignature(el, settings, dpi)}|r${rotation}`, {
    gray: fitted.gray,
    width: fitted.width,
    height: fitted.height,
    destWidth: fitted.destW,
    destHeight: fitted.destH,
    rotationDeg: rotation,
    flipH: el.flipH === true,
    flipV: el.flipV === true,
    settings,
  });
}

export async function loadImageSource(uri: string): Promise<DecodedGray | null> {
  return decodeOnce(uri);
}

async function decodeOnce(uri: string): Promise<DecodedGray | null> {
  if (decodeCache.has(uri)) return decodeCache.get(uri) ?? null;
  const got = await (decoder ?? defaultDecode)(uri);
  decodeCache.set(uri, got);
  while (decodeCache.size > DECODE_CACHE_LIMIT) {
    const oldest = decodeCache.keys().next().value;
    if (oldest === undefined) break;
    decodeCache.delete(oldest);
  }
  return got;
}

function wantsTile(el: LabelElement): el is ImageEl {
  return el.type === 'image' && usesModedPrint(el) && el.needPrinting !== false && el.visible !== false;
}

/**
 * Decode and render every moded image in `doc` at `dpi`. An image whose source cannot be decoded
 * gets no tile and so keeps the old print path. Safe to call repeatedly; unchanged images are reused.
 */
export async function prepareImageTiles(doc: LabelDocument, dpi: number): Promise<void> {
  for (const el of doc.elements) {
    if (!wantsTile(el)) continue;
    const settings = modedImageSettings(el)!;
    const sig = imageTileSignature(el, settings, dpi);
    const have = registry.get(el.id);
    if (have && have.sig === sig) continue;
    const uri = el.printUri || el.uri;
    if (!uri) continue;
    const src = await decodeOnce(uri);
    if (!src) continue;
    registerImageTile(el.id, sig, dpi, buildImageTile(el, src, dpi));
  }
}

export function registerImageTile(id: string, sig: string, dpi: number, tile: PlacedTile): void {
  registry.delete(id);
  registry.set(id, { sig, dpi, tile });
  while (registry.size > REGISTRY_LIMIT) {
    const oldest = registry.keys().next().value;
    if (oldest === undefined) break;
    registry.delete(oldest);
  }
}

/** The element's tile if it is ready for what the element looks like now (any dpi). */
export function readyImageTile(el: ImageEl, dpi?: number): PlacedTile | null {
  const entry = registry.get(el.id);
  if (!entry) return null;
  const settings = modedImageSettings(el);
  if (!settings) return null;
  const wantDpi = dpi ?? entry.dpi;
  if (entry.sig !== imageTileSignature(el, settings, wantDpi)) return null;
  return entry.tile;
}

/** True when every moded image in the doc already has a tile at this dpi. */
export function hasImageTiles(doc: LabelDocument, dpi?: number): boolean {
  for (const el of doc.elements) {
    if (wantsTile(el) && !readyImageTile(el, dpi)) return false;
  }
  return true;
}

export function docHasModedImages(doc: LabelDocument): boolean {
  return doc.elements.some(wantsTile);
}

export function clearImageTiles(): void {
  registry.clear();
  decodeCache.clear();
}

export { resampleGray };
