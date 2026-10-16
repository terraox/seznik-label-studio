/**
 * Smart Crop — local barcode detection on a tile grid.
 *
 * Whole-line statistics cannot find a barcode that shares its rows with text
 * (Valmo prints the barcode beside the address), so codes are found locally:
 * a tile is a code tile if it is **dense along one axis and nearly constant
 * along the other**. Bars repeat identically for the height of the code; text
 * changes shape from row to row.
 *
 * Both orientations are tested, so a label printed sideways on a landscape
 * page still has its barcode found.
 *
 * Phase 1 limitation, stated rather than faked: this finds 1D barcodes. A QR
 * or DataMatrix is constant only within one module row, so it is not flagged
 * as a code yet (plan R2.10).
 */

import type { InkMask } from './gray';
import type { DetectOptions } from './params';
import type { PxRect } from './types';

export type CodeMap = {
  tile: number;
  cols: number;
  rows: number;
  /** 1 = code tile. */
  code: Uint8Array;
  /** Summed-area table over `code`, (cols+1)×(rows+1). */
  sat: Int32Array;
};

export function buildCodeMap(mask: InkMask, unit: number, opts: DetectOptions): CodeMap {
  const tile = Math.max(8, Math.round(opts.codeTile * unit));
  const cols = Math.max(1, Math.floor(mask.width / tile));
  const rows = Math.max(1, Math.floor(mask.height / tile));
  const code = new Uint8Array(cols * rows);
  const ink = mask.ink;
  const W = mask.width;

  for (let ty = 0; ty < rows; ty++) {
    const y0 = ty * tile;
    for (let tx = 0; tx < cols; tx++) {
      const x0 = tx * tile;
      let inkCount = 0;
      let transX = 0;
      let transY = 0;
      for (let y = y0; y < y0 + tile; y++) {
        const row = y * W;
        let prev = 0;
        for (let x = x0; x < x0 + tile; x++) {
          const v = ink[row + x];
          inkCount += v;
          if (v && !prev) transX++;
          if (y > y0 && v !== ink[row - W + x]) transY++;
          prev = v;
        }
      }
      const area = tile * tile;
      const inkRatio = inkCount / area;
      if (inkRatio < opts.codeInkMin || inkRatio > opts.codeInkMax) continue;

      // transY counts changes down each column (both directions); transX counts
      // bar starts along each row. Recount the other way round for sideways bars.
      let transXBoth = 0;
      let barStartsY = 0;
      for (let x = x0; x < x0 + tile; x++) {
        let prev = 0;
        for (let y = y0; y < y0 + tile; y++) {
          const v = ink[y * W + x];
          if (v && !prev) barStartsY++;
          if (x > x0 && v !== ink[y * W + x - 1]) transXBoth++;
          prev = v;
        }
      }

      const steady = Math.max(1, inkCount);
      const verticalBars = transX / area >= opts.codeTransDensity && transY / steady <= opts.codeSteadyMax;
      const horizontalBars =
        barStartsY / area >= opts.codeTransDensity && transXBoth / steady <= opts.codeSteadyMax;
      if (verticalBars || horizontalBars) code[ty * cols + tx] = 1;
    }
  }

  const sat = new Int32Array((cols + 1) * (rows + 1));
  for (let ty = 0; ty < rows; ty++) {
    let rowSum = 0;
    for (let tx = 0; tx < cols; tx++) {
      rowSum += code[ty * cols + tx];
      sat[(ty + 1) * (cols + 1) + tx + 1] = sat[ty * (cols + 1) + tx + 1] + rowSum;
    }
  }
  return { tile, cols, rows, code, sat };
}

function tileSum(map: CodeMap, c0: number, r0: number, c1: number, r1: number): number {
  const x0 = Math.max(0, Math.min(map.cols, c0));
  const y0 = Math.max(0, Math.min(map.rows, r0));
  const x1 = Math.max(x0, Math.min(map.cols, c1));
  const y1 = Math.max(y0, Math.min(map.rows, r1));
  const s = map.cols + 1;
  return map.sat[y1 * s + x1] - map.sat[y1 * s + x0] - map.sat[y0 * s + x1] + map.sat[y0 * s + x0];
}

/** Code tiles lying fully inside `r`. */
export function codeTilesInside(map: CodeMap, r: PxRect): number {
  const c0 = Math.ceil(r.x / map.tile);
  const r0 = Math.ceil(r.y / map.tile);
  const c1 = Math.floor((r.x + r.w) / map.tile);
  const r1 = Math.floor((r.y + r.h) / map.tile);
  return tileSum(map, c0, r0, c1, r1);
}

/** Fraction of `r` covered by code tiles whose centre lies inside it. */
export function codeCoverage(map: CodeMap, r: PxRect): number {
  const half = map.tile / 2;
  const c0 = Math.ceil((r.x - half) / map.tile);
  const r0 = Math.ceil((r.y - half) / map.tile);
  const c1 = Math.floor((r.x + r.w - half) / map.tile) + 1;
  const r1 = Math.floor((r.y + r.h - half) / map.tile) + 1;
  const n = tileSum(map, c0, r0, c1, r1);
  return (n * map.tile * map.tile) / Math.max(1, r.w * r.h);
}
