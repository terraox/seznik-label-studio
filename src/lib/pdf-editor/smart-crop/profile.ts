/**
 * Smart Crop — per-scan-line statistics.
 *
 * One pass over a region produces everything the separator classifier needs.
 * Tone statistics use the line **median**, not the mean: a pale title band
 * carrying dark text has its mean dragged far out of range, while its median
 * stays on the band's own tone (plan R2.3).
 */

import type { InkMask } from './gray';
import type { Axis, GrayPage, PxRect } from './types';

export type LineProfile = {
  axis: Axis;
  /** Cross coordinate of index 0 — `rect.y` for `h`, `rect.x` for `v`. */
  start: number;
  /** Number of scan lines. */
  count: number;
  /** Length of each scan line, px. */
  extent: number;
  /** Ink coverage after closing gaps along the scan direction, 0-1. */
  cov: Float32Array;
  /** Ink coverage before closing, 0-1. */
  rawCov: Float32Array;
  /** Raw ink 0→1 transitions along the line. */
  trans: Int32Array;
  /** Median gray of the line. */
  mid: Float32Array;
  /** Fraction of the line within ±toneTol of `mid`. */
  uniform: Float32Array;
};

export function lineProfile(
  page: GrayPage,
  mask: InkMask,
  rect: PxRect,
  axis: Axis,
  dashGapPx: number,
  toneTol: number,
): LineProfile {
  const count = axis === 'h' ? rect.h : rect.w;
  const extent = axis === 'h' ? rect.w : rect.h;
  const cov = new Float32Array(Math.max(0, count));
  const rawCov = new Float32Array(Math.max(0, count));
  const trans = new Int32Array(Math.max(0, count));
  const mid = new Float32Array(Math.max(0, count));
  const uniform = new Float32Array(Math.max(0, count));
  const start = axis === 'h' ? rect.y : rect.x;
  if (count <= 0 || extent <= 0) {
    return { axis, start, count: Math.max(0, count), extent: Math.max(0, extent), cov, rawCov, trans, mid, uniform };
  }

  const hist = new Int32Array(256);
  const g = page.gray;
  const ink = mask.ink;
  const stride = page.width;
  const half = extent / 2;

  for (let i = 0; i < count; i++) {
    hist.fill(0);
    // Walking index and step: rows are contiguous, columns are strided.
    const base = axis === 'h' ? (rect.y + i) * stride + rect.x : rect.y * stride + rect.x + i;
    const step = axis === 'h' ? 1 : stride;

    let inkCount = 0;
    let transitions = 0;
    let first = -1;
    let last = -1;
    let bigGapTotal = 0;
    let gapStart = -1;
    let prevInk = 0;

    for (let k = 0, idx = base; k < extent; k++, idx += step) {
      const v = ink[idx];
      if (v !== 0) {
        if (prevInk === 0) {
          transitions++;
          if (first < 0) first = k;
          else if (gapStart >= 0) {
            const gapLen = k - gapStart;
            if (gapLen > dashGapPx) bigGapTotal += gapLen;
          }
        }
        last = k;
        inkCount++;
      } else if (prevInk !== 0) {
        gapStart = k;
      }
      prevInk = v;
      hist[g[idx]]++;
    }

    rawCov[i] = inkCount / extent;
    trans[i] = transitions;
    cov[i] = first < 0 ? 0 : Math.max(0, last - first + 1 - bigGapTotal) / extent;

    let acc = 0;
    let median = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= half) {
        median = v;
        break;
      }
    }
    mid[i] = median;

    const lo = Math.max(0, Math.round(median - toneTol));
    const hi = Math.min(255, Math.round(median + toneTol));
    let near = 0;
    for (let v = lo; v <= hi; v++) near += hist[v];
    uniform[i] = near / extent;
  }

  return { axis, start, count, extent, cov, rawCov, trans, mid, uniform };
}

export type DashStats = {
  /** Ink runs along the line. */
  runs: number;
  /** Ink length / span. */
  duty: number;
  /** Relative std dev of the dash+gap period. */
  periodCv: number;
  /** Relative std dev of the dash lengths. */
  dashCv: number;
  /** First-ink to last-ink length / extent. */
  span: number;
};

function relStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  if (mean <= 0) return Number.POSITIVE_INFINITY;
  let acc = 0;
  for (const v of values) acc += (v - mean) * (v - mean);
  return Math.sqrt(acc / values.length) / mean;
}

/**
 * Run / gap structure of one scan line. Recomputed only for the line that
 * represents a candidate, so the per-line pass above stays cheap.
 */
export function dashStats(
  mask: InkMask,
  rect: PxRect,
  axis: Axis,
  lineIndex: number,
  stride: number,
): DashStats {
  const extent = axis === 'h' ? rect.w : rect.h;
  const base =
    axis === 'h' ? (rect.y + lineIndex) * stride + rect.x : rect.y * stride + rect.x + lineIndex;
  const step = axis === 'h' ? 1 : stride;

  const runLens: number[] = [];
  const gapLens: number[] = [];
  let prevInk = 0;
  let runStart = -1;
  let gapStart = -1;
  let first = -1;
  let last = -1;

  for (let k = 0, idx = base; k < extent; k++, idx += step) {
    const v = mask.ink[idx];
    if (v !== 0 && prevInk === 0) {
      runStart = k;
      if (first < 0) first = k;
      else if (gapStart >= 0) gapLens.push(k - gapStart);
    } else if (v === 0 && prevInk !== 0) {
      gapStart = k;
      if (runStart >= 0) runLens.push(k - runStart);
      last = k - 1;
    }
    if (v !== 0) last = k;
    prevInk = v;
  }
  if (prevInk !== 0 && runStart >= 0) runLens.push(extent - runStart);

  const span = first < 0 ? 0 : last - first + 1;
  let inkTotal = 0;
  for (const r of runLens) inkTotal += r;

  const periods: number[] = [];
  for (let i = 0; i < gapLens.length && i < runLens.length; i++) {
    periods.push(runLens[i] + gapLens[i]);
  }

  return {
    runs: runLens.length,
    duty: span > 0 ? inkTotal / span : 0,
    periodCv: relStdDev(periods),
    dashCv: relStdDev(runLens),
    span: extent > 0 ? span / extent : 0,
  };
}
