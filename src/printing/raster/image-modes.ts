/**
 * Image print modes. Pure TypeScript, no Skia, no native code.
 *
 * One pipeline for the preview and every bridge: the dots are decided here, once,
 * at the final print resolution, and the bridge only receives finished 1-bit pixels.
 *
 *   flatten onto white -> scale to the final dot size -> rotate / flip -> effects -> 1-bit
 *
 * Everything is deterministic: same input and settings give the same bytes.
 * Pixels are 8-bit luminance, 255 = white, 0 = ink.
 */

export type ImageMode = 'solid' | 'floyd' | 'atkinson' | 'ordered';

export const IMAGE_MODES: readonly ImageMode[] = ['solid', 'floyd', 'atkinson', 'ordered'];

export const IMAGE_MODE_LABEL: Record<ImageMode, string> = {
  solid: 'Solid',
  floyd: 'Dither - Floyd-Steinberg',
  atkinson: 'Dither - Atkinson',
  ordered: 'Dither - Ordered 8x8',
};

export const IMAGE_MODE_HELP: Record<ImageMode, string> = {
  solid: 'Hard black and white. Best for logos, line art and text.',
  floyd: 'Best for photos.',
  atkinson: 'Lighter. Good for small or low-contrast photos.',
  ordered: 'Stable pattern. Good for gradients and gray fills.',
};

export type ImageSettings = {
  mode: ImageMode;
  /** Solid cutoff, 1..254. Darker than this prints black. Dither modes ignore it. */
  threshold: number;
  /** -100..100. 0 = unchanged. */
  brightness: number;
  /** -100..100. 0 = unchanged. */
  contrast: number;
  invert: boolean;
};

export const DEFAULT_IMAGE_THRESHOLD = 128;

export const DEFAULT_IMAGE_SETTINGS: Readonly<ImageSettings> = {
  mode: 'solid',
  threshold: DEFAULT_IMAGE_THRESHOLD,
  brightness: 0,
  contrast: 0,
  invert: false,
};

export type Mono = {
  width: number;
  height: number;
  /** 0 = ink, 255 = paper. Same size as width * height. */
  gray: Uint8Array;
};

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/** Fill missing or out-of-range fields. Missing fields mean today's behaviour. */
export function normalizeImageSettings(input?: Partial<ImageSettings> | null): ImageSettings {
  const mode = input?.mode && IMAGE_MODES.includes(input.mode) ? input.mode : 'solid';
  const t = Number.isFinite(input?.threshold) ? (input!.threshold as number) : DEFAULT_IMAGE_THRESHOLD;
  return {
    mode,
    threshold: clampInt(t, 1, 254),
    brightness: clampInt(Number.isFinite(input?.brightness) ? (input!.brightness as number) : 0, -100, 100),
    contrast: clampInt(Number.isFinite(input?.contrast) ? (input!.contrast as number) : 0, -100, 100),
    invert: input?.invert === true,
  };
}

export function hasImageEffects(s: ImageSettings): boolean {
  return s.brightness !== 0 || s.contrast !== 0 || s.invert;
}

/** Stable key for caches. */
export function imageSettingsKey(s: ImageSettings): string {
  return `${s.mode}:${s.threshold}:${s.brightness}:${s.contrast}:${s.invert ? 1 : 0}`;
}

/** RGBA to luminance with transparency flattened onto white. */
export function rgbaToGrayOnWhite(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = rgba[o + 3];
    const lum = (77 * rgba[o] + 150 * rgba[o + 1] + 29 * rgba[o + 2]) >> 8;
    out[i] = a === 255 ? lum : Math.round((lum * a + 255 * (255 - a)) / 255);
  }
  return out;
}

/**
 * Area-average (box) resample. Used once, before dithering, so a source pixel is never
 * resampled after it has become a dot. Same size returns the input untouched.
 */
export function resampleGray(
  src: Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8Array {
  if (sw === dw && sh === dh) return src;
  const out = new Uint8Array(dw * dh);
  const xs = sw / dw;
  const ys = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * ys;
    const y1 = (y + 1) * ys;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(sh, Math.ceil(y1));
    for (let x = 0; x < dw; x++) {
      const x0 = x * xs;
      const x1 = (x + 1) * xs;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(sw, Math.ceil(x1));
      let sum = 0;
      let wsum = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        const row = sy * sw;
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          const w = wx * wy;
          sum += src[row + sx] * w;
          wsum += w;
        }
      }
      out[y * dw + x] = wsum > 0 ? Math.round(sum / wsum) : 255;
    }
  }
  return out;
}

/** Brightness, contrast, invert. Identity (same array) when all are default. */
export function applyImageEffects(gray: Uint8Array, s: ImageSettings): Uint8Array {
  if (!hasImageEffects(s)) return gray;
  const lut = new Uint8Array(256);
  const bright = s.brightness * 2.55;
  const c = s.contrast * 2.55;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  for (let v = 0; v < 256; v++) {
    let x = factor * (v - 128) + 128 + bright;
    x = Math.min(255, Math.max(0, Math.round(x)));
    lut[v] = s.invert ? 255 - x : x;
  }
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]];
  return out;
}

const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

/**
 * 8-bit luminance to ink/paper bytes (0 / 255). `mask` marks the pixels that belong to the
 * image (1) when it is rotated inside a larger box; others stay paper and take part in nothing.
 */
export function quantizeGray(
  gray: Uint8Array,
  width: number,
  height: number,
  s: ImageSettings,
  mask?: Uint8Array | null,
): Uint8Array {
  const out = new Uint8Array(width * height);
  out.fill(255);
  const inside = (i: number) => !mask || mask[i] !== 0;

  if (s.mode === 'solid') {
    for (let i = 0; i < out.length; i++) {
      if (inside(i) && gray[i] < s.threshold) out[i] = 0;
    }
    return out;
  }

  if (s.mode === 'ordered') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!inside(i)) continue;
        const t = BAYER_8[(y & 7) * 8 + (x & 7)] * 4 + 2;
        if (gray[i] < t) out[i] = 0;
      }
    }
    return out;
  }

  // Error diffusion. Left to right on every row, so the result never depends on direction state.
  const atkinson = s.mode === 'atkinson';
  const rows = atkinson ? 3 : 2;
  const stride = width + 4;
  const err = new Int32Array(rows * stride); // ring of rows, offset by 2 columns
  const idx = (r: number, x: number) => (r % rows) * stride + x + 2;
  for (let y = 0; y < height; y++) {
    const cur = y;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!inside(i)) continue;
      const v = Math.min(255, Math.max(0, gray[i] + err[idx(cur, x)]));
      const black = v < 128;
      if (black) out[i] = 0;
      const e = v - (black ? 0 : 255);
      if (e === 0) continue;
      if (atkinson) {
        const share = e >> 3;
        err[idx(cur, x + 1)] += share;
        err[idx(cur, x + 2)] += share;
        err[idx(cur + 1, x - 1)] += share;
        err[idx(cur + 1, x)] += share;
        err[idx(cur + 1, x + 1)] += share;
        err[idx(cur + 2, x)] += share;
      } else {
        err[idx(cur, x + 1)] += (e * 7) >> 4;
        err[idx(cur + 1, x - 1)] += (e * 3) >> 4;
        err[idx(cur + 1, x)] += (e * 5) >> 4;
        err[idx(cur + 1, x + 1)] += e >> 4;
      }
    }
    // Recycle the row that was just finished so it can serve as the farthest-ahead row.
    err.fill(0, (cur % rows) * stride, (cur % rows) * stride + stride);
  }
  return out;
}

export type PlacedImage = {
  gray: Uint8Array;
  width: number;
  height: number;
  rotationDeg: number;
  flipH: boolean;
  flipV: boolean;
};

export type PlacedTile = {
  width: number;
  height: number;
  gray: Uint8Array;
  /** null when the tile is fully the image (no rotation inside a bigger box). */
  mask: Uint8Array | null;
  /** Where the tile's top-left sits, relative to the unrotated image's top-left, in dots. */
  offsetX: number;
  offsetY: number;
};

/**
 * Flip, then rotate clockwise by `rotationDeg`, with the box grown to hold the result.
 * Multiples of 90 are exact copies. Other angles sample bilinearly into a mask.
 */
export function rotateImage(p: PlacedImage): PlacedTile {
  const { width: w, height: h } = p;
  let src = p.gray;
  if (p.flipH || p.flipV) {
    const f = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      const sy = p.flipV ? h - 1 - y : y;
      for (let x = 0; x < w; x++) {
        const sx = p.flipH ? w - 1 - x : x;
        f[y * w + x] = src[sy * w + sx];
      }
    }
    src = f;
  }
  const deg = ((Math.round(p.rotationDeg * 1000) / 1000) % 360 + 360) % 360;
  if (deg === 0) return { width: w, height: h, gray: src, mask: null, offsetX: 0, offsetY: 0 };
  if (deg === 90 || deg === 180 || deg === 270) {
    const swap = deg !== 180;
    const ow = swap ? h : w;
    const oh = swap ? w : h;
    const out = new Uint8Array(ow * oh);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let nx: number;
        let ny: number;
        if (deg === 90) {
          nx = h - 1 - y;
          ny = x;
        } else if (deg === 180) {
          nx = w - 1 - x;
          ny = h - 1 - y;
        } else {
          nx = y;
          ny = w - 1 - x;
        }
        out[ny * ow + nx] = src[y * w + x];
      }
    }
    return {
      width: ow,
      height: oh,
      gray: out,
      mask: null,
      offsetX: Math.round((w - ow) / 2),
      offsetY: Math.round((h - oh) / 2),
    };
  }

  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ow = Math.max(1, Math.ceil(Math.abs(w * cos) + Math.abs(h * sin)));
  const oh = Math.max(1, Math.ceil(Math.abs(w * sin) + Math.abs(h * cos)));
  const out = new Uint8Array(ow * oh);
  out.fill(255);
  const mask = new Uint8Array(ow * oh);
  const cx = w / 2;
  const cy = h / 2;
  const ocx = ow / 2;
  const ocy = oh / 2;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      // Inverse of a clockwise turn.
      const dx = x + 0.5 - ocx;
      const dy = y + 0.5 - ocy;
      const sx = dx * cos + dy * sin + cx;
      const sy = -dx * sin + dy * cos + cy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const fx = Math.min(w - 1, Math.max(0, sx - 0.5));
      const fy = Math.min(h - 1, Math.max(0, sy - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const top = src[y0 * w + x0] * (1 - ax) + src[y0 * w + x1] * ax;
      const bot = src[y1 * w + x0] * (1 - ax) + src[y1 * w + x1] * ax;
      out[y * ow + x] = Math.round(top * (1 - ay) + bot * ay);
      mask[y * ow + x] = 1;
    }
  }
  return {
    width: ow,
    height: oh,
    gray: out,
    mask,
    offsetX: Math.round((w - ow) / 2),
    offsetY: Math.round((h - oh) / 2),
  };
}

export type RenderImageInput = {
  /** Source luminance, transparency already flattened onto white. */
  gray: Uint8Array;
  width: number;
  height: number;
  /** Final size in printer dots, before rotation. */
  destWidth: number;
  destHeight: number;
  rotationDeg?: number;
  flipH?: boolean;
  flipV?: boolean;
  settings: ImageSettings;
};

/** The whole pipeline. Returns the finished dots and the mask (null = whole tile is image). */
export function renderImageToMono(input: RenderImageInput): PlacedTile {
  const dw = Math.max(1, Math.round(input.destWidth));
  const dh = Math.max(1, Math.round(input.destHeight));
  const scaled = resampleGray(input.gray, input.width, input.height, dw, dh);
  const tile = rotateImage({
    gray: scaled,
    width: dw,
    height: dh,
    rotationDeg: input.rotationDeg ?? 0,
    flipH: input.flipH === true,
    flipV: input.flipV === true,
  });
  const adjusted = applyImageEffects(tile.gray, input.settings);
  const mono = quantizeGray(adjusted, tile.width, tile.height, input.settings, tile.mask);
  return { ...tile, gray: mono };
}

/** Pack ink/paper bytes into 1 bit per dot, MSB first, bit set = ink. */
export function packMono(mono: Mono): { bytesPerRow: number; bytes: Uint8Array } {
  const bytesPerRow = Math.ceil(mono.width / 8);
  const bytes = new Uint8Array(bytesPerRow * mono.height);
  for (let y = 0; y < mono.height; y++) {
    for (let x = 0; x < mono.width; x++) {
      if (mono.gray[y * mono.width + x] === 0) bytes[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bytesPerRow, bytes };
}

/** Tiny deterministic hash for cache keys. */
export function hashGray(gray: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < gray.length; i++) {
    h ^= gray[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

const CACHE_LIMIT = 24;
const cache = new Map<string, PlacedTile>();

/** Memoised `renderImageToMono`, keyed by the caller's source id plus every setting. */
export function renderImageToMonoCached(sourceKey: string, input: RenderImageInput): PlacedTile {
  const key = [
    sourceKey,
    input.width,
    input.height,
    input.destWidth,
    input.destHeight,
    input.rotationDeg ?? 0,
    input.flipH ? 1 : 0,
    input.flipV ? 1 : 0,
    imageSettingsKey(input.settings),
  ].join('|');
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = renderImageToMono(input);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}

export function clearImageModeCache(): void {
  cache.clear();
}

/**
 * Photo regions of a page: blocks with many mid-gray pixels. Text and barcodes are almost
 * all black or white, so they stay out. Used for PDF pages, where text must stay crisp.
 */
export function photoRegionMask(
  gray: Uint8Array,
  width: number,
  height: number,
  block = 16,
  midFraction = 0.4,
): Uint8Array | null {
  const bw = Math.ceil(width / block);
  const bh = Math.ceil(height / block);
  const hit = new Uint8Array(bw * bh);
  let any = false;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let mid = 0;
      let total = 0;
      const y1 = Math.min(height, (by + 1) * block);
      const x1 = Math.min(width, (bx + 1) * block);
      for (let y = by * block; y < y1; y++) {
        for (let x = bx * block; x < x1; x++) {
          const v = gray[y * width + x];
          total++;
          if (v > 40 && v < 215) mid++;
        }
      }
      if (total > 0 && mid / total >= midFraction) {
        hit[by * bw + bx] = 1;
        any = true;
      }
    }
  }
  if (!any) return null;
  // Close one-block gaps so a photo is one region, then grow by one block so its edge dithers too.
  const grown = new Uint8Array(hit.length);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let on = false;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = bx + dx;
          const y = by + dy;
          if (x >= 0 && y >= 0 && x < bw && y < bh && hit[y * bw + x]) {
            on = true;
            break;
          }
        }
      }
      grown[by * bw + bx] = on ? 1 : 0;
    }
  }
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const by = Math.floor(y / block);
    for (let x = 0; x < width; x++) {
      if (grown[by * bw + Math.floor(x / block)]) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/**
 * Whole-page conversion for a PDF page or a photo: Solid everywhere except inside `mask`,
 * which gets the chosen dither. With no mask the mode applies to every pixel.
 */
export function renderPageToMono(
  gray: Uint8Array,
  width: number,
  height: number,
  s: ImageSettings,
  mask?: Uint8Array | null,
): Uint8Array {
  const adjusted = applyImageEffects(gray, s);
  if (!mask || s.mode === 'solid') return quantizeGray(adjusted, width, height, s);
  const solid = quantizeGray(adjusted, width, height, { ...s, mode: 'solid' });
  const dithered = quantizeGray(adjusted, width, height, s, mask);
  for (let i = 0; i < solid.length; i++) if (mask[i]) solid[i] = dithered[i];
  return solid;
}
