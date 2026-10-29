/**
 * Print emoji the way WePrint does on thermal:
 * 1. Paint the *color* glyph (system Noto Color Emoji), never the black outline fallback.
 * 2. Mix RGB to luminance.
 * 3. Dark features (eyes, outlines) → ink; light fills (yellow, skin) → paper.
 */

import { clusterToTwemojiLookupIds } from '@/lib/emoji/twemoji-id';

import type { TextDrawStyle } from './skia-surface';

const LAYOUT_WIDTH = 4096;
/** WePrint mix: yellow ~196 and skin ~180 stay paper; black/red features print. */
const EMOJI_INK_THRESHOLD = 160;
/** Pull midtones toward ink without closing yellow/white cores. */
const EMOJI_MIDTONE_DARKEN = 16;

type SkColor = unknown;
type SkTypeface = unknown;
type SkData = unknown;
type SkImage = {
  width: () => number;
  height: () => number;
  readPixels?: (
    x?: number,
    y?: number,
    info?: { width: number; height: number; colorType: number; alphaType: number },
  ) => Uint8Array | Float32Array | null;
};

type SkParagraph = {
  layout: (width: number) => void;
  paint: (canvas: unknown, x: number, y: number) => void;
  getLongestLine: () => number;
  getHeight: () => number;
};

type SkParagraphBuilder = {
  pushStyle: (style: Record<string, unknown>) => SkParagraphBuilder;
  addText: (text: string) => SkParagraphBuilder;
  pop: () => SkParagraphBuilder;
  build: () => SkParagraph;
};

type SkRect = unknown;

type SkCanvas = {
  clear: (color: unknown) => void;
  drawImage?: (image: SkImage, x: number, y: number, paint?: unknown) => void;
  drawImageRect?: (image: SkImage, src: SkRect, dest: SkRect, paint: unknown, fastSample?: boolean) => void;
};

type SkSurface = {
  getCanvas: () => SkCanvas;
  flush: () => void;
  makeImageSnapshot: () => SkImage;
};

export type EmojiSkiaModule = {
  Skia: {
    Color: (c: string | number) => SkColor;
    Surface: { MakeOffscreen: (w: number, h: number) => SkSurface | null };
    XYWHRect: (x: number, y: number, w: number, h: number) => SkRect;
    Data?: {
      fromBytes: (bytes: Uint8Array) => SkData;
      fromURI?: (uri: string) => Promise<SkData>;
    };
    Image?: {
      MakeImage: (
        info: { width: number; height: number; colorType: number; alphaType: number },
        data: SkData,
        bytesPerRow: number,
      ) => SkImage | null;
      MakeImageFromEncoded?: (data: SkData) => SkImage | null;
    };
    ParagraphBuilder: {
      Make: (style?: Record<string, unknown>, provider?: unknown) => SkParagraphBuilder;
    };
    TypefaceFontProvider: { Make: () => { registerFont: (face: SkTypeface, name: string) => void } };
    Paint: () => { setColor: (c: unknown) => void; setAntiAlias: (aa: boolean) => void };
    Font?: (typeface: SkTypeface, size?: number) => { measureText: (t: string) => { width: number } };
  };
  matchFont?: (style: {
    fontFamily?: string;
    fontSize: number;
    fontWeight?: string;
    fontStyle?: string;
  }) => { measureText: (t: string) => { width: number } };
  ColorType: { RGBA_8888: number };
  AlphaType: { Unpremul: number; Opaque?: number };
};

type EmojiTile = {
  dest: number;
  image: SkImage;
};

const tileCache = new Map<string, EmojiTile>();
/** Decoded Twemoji color images, keyed by file id. Filled before rasterize. */
const twemojiImages = new Map<string, SkImage>();

type TwemojiPack = { TWEMOJI_PACK?: number; TWEMOJI_INDEX?: Record<string, [number, number]> };

function twemojiPack(): TwemojiPack {
  try {
    return require('@/lib/emoji/twemoji-modules') as TwemojiPack;
  } catch {
    return {};
  }
}

function twemojiFileId(cluster: string): string | undefined {
  const index = twemojiPack().TWEMOJI_INDEX ?? {};
  for (const id of clusterToTwemojiLookupIds(cluster)) {
    if (index[id] != null) return id;
  }
  return undefined;
}

export async function preloadTwemojiImages(clusters: readonly string[]): Promise<void> {
  const { TWEMOJI_PACK, TWEMOJI_INDEX } = twemojiPack();
  if (TWEMOJI_PACK == null || !TWEMOJI_INDEX) return;
  const pending = new Set<string>();
  for (const cluster of clusters) {
    for (const id of clusterToTwemojiLookupIds(cluster)) {
      if (TWEMOJI_INDEX[id] == null || twemojiImages.has(id)) continue;
      pending.add(id);
      break;
    }
  }
  if (pending.size === 0) return;
  const skia = require('@shopify/react-native-skia').Skia as EmojiSkiaModule['Skia'];
  if (!skia.Data?.fromBytes || !skia.Image?.MakeImageFromEncoded) return;
  const { Asset } = require('expo-asset') as {
    Asset: {
      fromModule: (id: number) => {
        localUri: string | null;
        downloadAsync: () => Promise<unknown>;
      };
    };
  };
  const { File } = require('expo-file-system') as {
    File: new (uri: string) => {
      open: () => {
        offset: number | null;
        readBytes: (length: number) => Uint8Array;
        close: () => void;
      };
    };
  };
  let handle: ReturnType<InstanceType<typeof File>['open']> | null = null;
  try {
    const asset = Asset.fromModule(TWEMOJI_PACK);
    if (!asset.localUri) await asset.downloadAsync();
    if (!asset.localUri) return;
    handle = new File(asset.localUri).open();
    for (const id of pending) {
      try {
        const [offset, length] = TWEMOJI_INDEX[id];
        handle.offset = offset;
        const image = skia.Image.MakeImageFromEncoded(skia.Data.fromBytes(handle.readBytes(length)));
        if (image) twemojiImages.set(id, image);
      } catch (err) {
        console.warn('[twemoji] decode failed', id, err);
      }
    }
  } catch (err) {
    console.warn('[twemoji] pack load failed', err);
  } finally {
    handle?.close();
  }
}

export function emojiDestSizeDots(fontSizeDots: number): number {
  return Math.max(8, Math.round(fontSizeDots));
}

function cacheKey(emoji: string, dest: number, ink: number): string {
  return `${emoji}\u0000${dest}\u0000${ink < 128 ? 0 : 1}`;
}

function buildEmojiParagraph(skia: EmojiSkiaModule, emoji: string, paintSize: number): SkParagraph | null {
  const builderApi = skia.Skia.ParagraphBuilder;
  if (!builderApi?.Make) return null;
  try {
    // Default font mgr (no provider) so Android can fall through to the color emoji font.
    // Pinning "Noto Color Emoji" drops Samsung/device faces and misses glyphs like 😈.
    return builderApi
      .Make({ maxLines: 1 })
      .pushStyle({
        fontSize: paintSize,
        heightMultiplier: 1,
      })
      .addText(emoji)
      .pop()
      .build();
  } catch {
    return null;
  }
}

function luminance(r: number, g: number, b: number): number {
  return (r * 77 + g * 150 + b * 29) >> 8;
}

function darkenMidtones(lum: number): number {
  if (lum >= 200) return lum;
  return Math.max(0, lum - EMOJI_MIDTONE_DARKEN);
}

/** WePrint: yellow/skin paper, black/red features ink. */
export function emojiSampleIsInk(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return false;
  return luminance(r, g, b) < EMOJI_INK_THRESHOLD;
}

/** Dark/purple glyphs (😈) need a higher cut so the body does not vanish into paper. */
export function emojiInkThresholdForOpaqueMean(mean: number): number {
  if (mean < 178) return Math.min(210, Math.round(mean + 50));
  return EMOJI_INK_THRESHOLD;
}

function isInkPixel(r: number, g: number, b: number, a: number): boolean {
  return emojiSampleIsInk(r, g, b, a);
}

function cellLuminance(
  pixels: Uint8Array | Float32Array,
  tile: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { lum: number; opaque: number } {
  let sum = 0;
  let opaque = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (Math.min(tile - 1, y) * tile + Math.min(tile - 1, x)) * 4;
      const a = pixels[o + 3];
      if (a < 16) continue;
      opaque += 1;
      sum += luminance(pixels[o], pixels[o + 1], pixels[o + 2]);
    }
  }
  if (opaque === 0) return { lum: 255, opaque: 0 };
  return { lum: sum / opaque, opaque };
}

function paintTwemojiSnapshot(skia: EmojiSkiaModule, emoji: string, tile: number): SkImage | null {
  const fileId = twemojiFileId(emoji);
  const src = fileId ? twemojiImages.get(fileId) : undefined;
  if (!src) return null;
  const surface = skia.Skia.Surface.MakeOffscreen(tile, tile);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.clear(skia.Skia.Color('#FFFFFF'));
  const sw = Math.max(1, src.width());
  const sh = Math.max(1, src.height());
  const scale = Math.min(tile / sw, tile / sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const paint = skia.Skia.Paint();
  paint.setAntiAlias(true);
  if (typeof canvas.drawImageRect === 'function') {
    canvas.drawImageRect(
      src,
      skia.Skia.XYWHRect(0, 0, sw, sh),
      skia.Skia.XYWHRect(Math.round((tile - dw) / 2), Math.round((tile - dh) / 2), dw, dh),
      paint,
      false,
    );
  } else {
    canvas.drawImage?.(src, Math.round((tile - sw) / 2), Math.round((tile - sh) / 2), paint);
  }
  surface.flush();
  return surface.makeImageSnapshot();
}

function paintEmojiSnapshot(skia: EmojiSkiaModule, emoji: string, tile: number): SkImage | null {
  const fromMap = paintTwemojiSnapshot(skia, emoji, tile);
  if (fromMap) return fromMap;
  const paintSize = Math.max(12, Math.round(tile * 0.84));
  const para = buildEmojiParagraph(skia, emoji, paintSize);
  if (!para) return null;
  para.layout(LAYOUT_WIDTH);
  const surface = skia.Skia.Surface.MakeOffscreen(tile, tile);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.clear(skia.Skia.Color('#FFFFFF'));
  const w = Math.max(1, para.getLongestLine());
  const h = Math.max(1, para.getHeight());
  para.paint(canvas, Math.round((tile - w) / 2), Math.round((tile - h) / 2));
  surface.flush();
  return surface.makeImageSnapshot();
}

function readRgba(
  skia: EmojiSkiaModule,
  image: SkImage,
  width: number,
  height: number,
): Uint8Array | Float32Array | null {
  if (typeof image.readPixels !== 'function') return null;
  const colorType = skia.ColorType?.RGBA_8888;
  const alphaType = skia.AlphaType?.Unpremul;
  if (colorType == null || alphaType == null) return null;
  try {
    return image.readPixels(0, 0, { width, height, colorType, alphaType });
  } catch {
    return null;
  }
}

function makeBwImage(skia: EmojiSkiaModule, dest: number, bits: Uint8Array, inkIsBlack: boolean): SkImage | null {
  const makeImage = skia.Skia.Image?.MakeImage;
  const fromBytes = skia.Skia.Data?.fromBytes;
  if (!makeImage || !fromBytes) return null;
  const rgba = new Uint8Array(dest * dest * 4);
  const ink = inkIsBlack ? 0 : 255;
  const paper = inkIsBlack ? 255 : 0;
  for (let i = 0; i < dest * dest; i++) {
    const v = bits[i] ? ink : paper;
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  try {
    return makeImage(
      {
        width: dest,
        height: dest,
        colorType: skia.ColorType.RGBA_8888,
        alphaType: skia.AlphaType.Unpremul,
      },
      fromBytes(rgba),
      dest * 4,
    );
  } catch {
    return null;
  }
}

function rasterEmojiTile(skia: EmojiSkiaModule, emoji: string, dest: number, ink: number): EmojiTile | null {
  const key = cacheKey(emoji, dest, ink);
  const hit = tileCache.get(key);
  if (hit) return hit;

  const tile = Math.min(256, Math.max(32, dest * 3));
  const snapshot = paintEmojiSnapshot(skia, emoji, tile);
  if (!snapshot) return null;

  const pixels = readRgba(skia, snapshot, tile, tile);
  let image: SkImage = snapshot;
  if (pixels) {
    const gray = new Float32Array(dest * dest);
    let opaque = 0;
    let darkOpaque = 0;
    let lumSum = 0;
    for (let dy = 0; dy < dest; dy++) {
      const y0 = Math.floor((dy * tile) / dest);
      const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * tile) / dest));
      for (let dx = 0; dx < dest; dx++) {
        const x0 = Math.floor((dx * tile) / dest);
        const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * tile) / dest));
        const cell = cellLuminance(pixels, tile, x0, y0, x1, y1);
        gray[dy * dest + dx] = cell.lum;
        if (cell.opaque > 0) {
          opaque += 1;
          lumSum += cell.lum;
          if (cell.lum < 40) darkOpaque += 1;
        }
      }
    }
    const opaqueMean = opaque > 0 ? lumSum / opaque : 255;
    const cut = emojiInkThresholdForOpaqueMean(opaqueMean);
    const lightGlyph = opaqueMean >= 178;
    if (lightGlyph) {
      for (let i = 0; i < gray.length; i++) gray[i] = darkenMidtones(gray[i]);
    }
    const bits = new Uint8Array(dest * dest);
    const outlineOnly = opaque > 8 && darkOpaque * 10 >= opaque * 8;
    if (outlineOnly) {
      // Color glyph did not paint — keep the sharp silhouette rather than invent holes.
      for (let i = 0; i < gray.length; i++) bits[i] = gray[i] < cut ? 1 : 0;
    } else {
      // Floyd–Steinberg on the luminance mix so midtones (flame, crown) open up like WePrint.
      for (let y = 0; y < dest; y++) {
        for (let x = 0; x < dest; x++) {
          const i = y * dest + x;
          const old = gray[i];
          const next = old < cut ? 0 : 255;
          bits[i] = next === 0 ? 1 : 0;
          const err = old - next;
          if (x + 1 < dest) gray[i + 1] += (err * 7) / 16;
          if (y + 1 < dest) {
            if (x > 0) gray[i + dest - 1] += (err * 3) / 16;
            gray[i + dest] += (err * 5) / 16;
            if (x + 1 < dest) gray[i + dest + 1] += err / 16;
          }
        }
      }
    }
    image = makeBwImage(skia, dest, bits, ink < 128) ?? snapshot;
  }

  const raster: EmojiTile = { dest, image };
  if (tileCache.size > 64) tileCache.clear();
  tileCache.set(key, raster);
  return raster;
}

export function measureEmojiSegmentWidth(
  _skia: EmojiSkiaModule,
  _emoji: string,
  style: TextDrawStyle,
): number {
  return emojiDestSizeDots(style.fontSizeDots);
}

function drawTile(
  skia: EmojiSkiaModule,
  canvas: SkCanvas,
  raster: EmojiTile,
  x: number,
  yTop: number,
): void {
  const paint = skia.Skia.Paint();
  paint.setAntiAlias(false);
  const left = Math.round(x);
  const top = Math.round(yTop);
  if (typeof canvas.drawImageRect === 'function') {
    const srcW = raster.image.width();
    const srcH = raster.image.height();
    canvas.drawImageRect(
      raster.image,
      skia.Skia.XYWHRect(0, 0, srcW, srcH),
      skia.Skia.XYWHRect(left, top, raster.dest, raster.dest),
      paint,
      true,
    );
    return;
  }
  canvas.drawImage?.(raster.image, left, top, paint);
}

export function drawEmojiSegmentAsImage(
  skia: EmojiSkiaModule,
  canvas: SkCanvas,
  emoji: string,
  x: number,
  yTop: number,
  style: TextDrawStyle,
): number {
  const dest = emojiDestSizeDots(style.fontSizeDots);
  const raster = rasterEmojiTile(skia, emoji, dest, style.ink);
  if (!raster) return dest;
  drawTile(skia, canvas, raster, x, yTop);
  return dest;
}

export function stampEmojiDots(
  skia: EmojiSkiaModule,
  _colorType: number,
  _alphaType: number,
  putRect: (x: number, y: number, w: number, h: number, gray: number) => void,
  emoji: string,
  x: number,
  yTop: number,
  style: TextDrawStyle,
): number {
  const dest = emojiDestSizeDots(style.fontSizeDots);
  const raster = rasterEmojiTile(skia, emoji, dest, style.ink);
  if (!raster) return dest;
  const pixels = readRgba(skia, raster.image, raster.image.width(), raster.image.height());
  const ink = style.ink < 128 ? 0 : 255;
  const x0 = Math.round(x);
  const y0 = Math.round(yTop);
  if (!pixels) {
    putRect(x0, y0, dest, dest, ink);
    return dest;
  }
  const srcW = raster.image.width();
  const srcH = raster.image.height();
  for (let dy = 0; dy < dest; dy++) {
    const sy = Math.min(srcH - 1, Math.floor((dy * srcH) / dest));
    for (let dx = 0; dx < dest; dx++) {
      const sx = Math.min(srcW - 1, Math.floor((dx * srcW) / dest));
      const o = (sy * srcW + sx) * 4;
      if (!isInkPixel(pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])) continue;
      putRect(x0 + dx, y0 + dy, 1, 1, ink);
    }
  }
  return dest;
}

export function resetEmojiRasterCacheForTests(): void {
  tileCache.clear();
}
