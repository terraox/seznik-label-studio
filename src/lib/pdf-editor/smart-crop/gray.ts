/**
 * Smart Crop — analysis buffer, binarization, integral image.
 *
 * The integral image is what keeps the detector in JS: every later clearance,
 * ink-ratio and bounds query is O(1) instead of O(area).
 */

import { downsampleGrayToSize } from '@/lib/printer/escpos';

import type { DetectOptions } from './params';
import type { GrayPage, PxRect } from './types';

/** Downscale so the long edge is at most `longEdge`. Box average, never upscales. */
export function toAnalysisGray(page: GrayPage, longEdge: number): GrayPage {
  const long = Math.max(page.width, page.height);
  if (long <= longEdge || long < 1) return page;
  const s = longEdge / long;
  return downsampleGrayToSize(
    page,
    Math.max(1, Math.round(page.width * s)),
    Math.max(1, Math.round(page.height * s)),
  );
}

/** Up to 4096 evenly spaced samples, sorted. Shared by the two tone estimates. */
function sortedSample(page: GrayPage): Uint8Array {
  const n = page.gray.length;
  const count = Math.min(n, 4096);
  if (count === 0) return new Uint8Array(0);
  const step = Math.max(1, Math.floor(n / count));
  const out = new Uint8Array(count);
  let si = 0;
  for (let i = 0; i < n && si < count; i += step) out[si++] = page.gray[i];
  const used = out.subarray(0, si);
  used.sort();
  return used;
}

function percentile(sorted: Uint8Array, p: number, fallback: number): number {
  if (sorted.length === 0) return fallback;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[i];
}

export type Tone = { inkMax: number; paperLevel: number };

/**
 * Ink threshold and paper level in one pass.
 *
 * The ink threshold is the same percentile rule `findLabelCropNorm` uses in
 * `img-to-label-engine.ts`, so Smart Crop and Fit-to-label agree on what ink is.
 */
export function measureTone(page: GrayPage, opts: DetectOptions): Tone {
  const sorted = sortedSample(page);
  const pInk = percentile(sorted, opts.inkPctl, 255);
  const inkMax = Math.min(opts.inkMax, Math.max(opts.inkMin, pInk - opts.inkMargin));
  const paperLevel = Math.max(inkMax, percentile(sorted, opts.paperPctl, 255));
  return { inkMax, paperLevel };
}

/** 1 = ink. One byte per pixel so row walks stay branch-free. */
export type InkMask = { width: number; height: number; ink: Uint8Array };

export function binarize(page: GrayPage, inkMax: number): InkMask {
  const n = page.gray.length;
  const ink = new Uint8Array(n);
  const g = page.gray;
  for (let i = 0; i < n; i++) ink[i] = g[i] < inkMax ? 1 : 0;
  return { width: page.width, height: page.height, ink };
}

/** Summed-area table over the ink mask. */
export class Integral {
  readonly width: number;
  readonly height: number;
  private readonly sat: Int32Array;
  private readonly stride: number;

  constructor(mask: InkMask) {
    this.width = mask.width;
    this.height = mask.height;
    this.stride = mask.width + 1;
    this.sat = new Int32Array(this.stride * (mask.height + 1));
    for (let y = 0; y < mask.height; y++) {
      const src = y * mask.width;
      const prev = y * this.stride;
      const cur = (y + 1) * this.stride;
      let rowSum = 0;
      for (let x = 0; x < mask.width; x++) {
        rowSum += mask.ink[src + x];
        this.sat[cur + x + 1] = this.sat[prev + x + 1] + rowSum;
      }
    }
  }

  /** Ink pixels in the half-open rect. Clamped to the buffer. */
  sum(x: number, y: number, w: number, h: number): number {
    const x0 = Math.max(0, Math.min(this.width, x));
    const y0 = Math.max(0, Math.min(this.height, y));
    const x1 = Math.max(x0, Math.min(this.width, x + w));
    const y1 = Math.max(y0, Math.min(this.height, y + h));
    if (x1 === x0 || y1 === y0) return 0;
    const a = y0 * this.stride;
    const b = y1 * this.stride;
    return this.sat[b + x1] - this.sat[b + x0] - this.sat[a + x1] + this.sat[a + x0];
  }

  rectSum(r: PxRect): number {
    return this.sum(r.x, r.y, r.w, r.h);
  }

  /** Ink pixels / total pixels in the rect. */
  ratio(r: PxRect): number {
    const area = Math.max(1, r.w * r.h);
    return this.rectSum(r) / area;
  }
}

/**
 * Tight ink bounds inside `within`, ignoring rows and columns that carry less
 * than `edgeInk` ink. That minimum is what stops a 1-3 px speck in the margin
 * from stretching the content rect (plan R2.7).
 */
export function inkBounds(
  it: Integral,
  within: PxRect,
  edgeInkRow: number,
  edgeInkCol: number,
): PxRect | null {
  const { x, y, w, h } = within;
  if (w <= 0 || h <= 0) return null;

  let top = -1;
  for (let yy = y; yy < y + h; yy++) {
    if (it.sum(x, yy, w, 1) >= edgeInkRow) {
      top = yy;
      break;
    }
  }
  if (top < 0) return null;

  let bottom = top;
  for (let yy = y + h - 1; yy >= top; yy--) {
    if (it.sum(x, yy, w, 1) >= edgeInkRow) {
      bottom = yy;
      break;
    }
  }

  const bandH = bottom - top + 1;
  let left = -1;
  for (let xx = x; xx < x + w; xx++) {
    if (it.sum(xx, top, 1, bandH) >= edgeInkCol) {
      left = xx;
      break;
    }
  }
  if (left < 0) return null;

  let right = left;
  for (let xx = x + w - 1; xx >= left; xx--) {
    if (it.sum(xx, top, 1, bandH) >= edgeInkCol) {
      right = xx;
      break;
    }
  }

  return { x: left, y: top, w: right - left + 1, h: bandH };
}

export function padRect(r: PxRect, pad: number, bounds: PxRect): PxRect {
  const p = Math.max(0, Math.round(pad));
  const x = Math.max(bounds.x, r.x - p);
  const y = Math.max(bounds.y, r.y - p);
  const right = Math.min(bounds.x + bounds.w, r.x + r.w + p);
  const bottom = Math.min(bounds.y + bounds.h, r.y + r.h + p);
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

export function toNorm(r: PxRect, pageW: number, pageH: number) {
  const w = Math.max(1, pageW);
  const h = Math.max(1, pageH);
  return { x: r.x / w, y: r.y / h, w: r.w / w, h: r.h / h };
}
