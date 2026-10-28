/**
 * Smart Crop — region-grow from a tap (plan §2.4, R1.1.3).
 *
 * When no detected section is under the finger, grow the connected block of
 * ink around the tap instead of doing nothing. This is what makes tap-to-select
 * work on any layout, including where separator detection missed a boundary.
 *
 * It reuses the detector's own analysis buffer and integral image through the
 * `AnalysisContext`, so it works the moment the page is prepared, long before
 * the full cut has run.
 *
 * The flood fill runs on a grid of small cells rather than pixels: a cell is
 * "on" if it holds ink, and on-cells are joined across gaps up to `gap`. So
 * words and lines of one block merge, while a real gap between blocks — wider
 * than `gap`, defined relative to the page — keeps them apart.
 */

import { codeTilesInside } from './codes';
import type { AnalysisContext } from './detector';
import { inkBounds, padRect, toNorm } from './gray';
import { containsPoint, iou } from './hit-test';
import { lineProfile } from './profile';
import { findSeparators, type Separator } from './rules';
import type { DetectResult, GrowNote, PxRect, Section } from './types';

export type GrowOptions = {
  /** Cell edge, × unit (page long edge). */
  cell: number;
  /** Largest empty run bridged between two inked cells, × unit. */
  gap: number;
  /** How far from the tap to look for ink when the tap lands on paper, × unit. */
  seedRadius: number;
  /** Ink pixels a cell needs to be on, as a fraction of the cell. */
  cellInk: number;
  /** Stricter cell threshold for the second, no-bridging pass. */
  strictCellInk: number;
  /** Below this the block is flagged `too-small`, × page area. */
  minArea: number;
  /** Above this the block is `capped` — it ran into most of the page. × page area. */
  maxArea: number;
  /** Times a too-small block is retried with a wider bridge. */
  retries: number;
};

export const DEFAULT_GROW_OPTIONS: GrowOptions = {
  cell: 0.006,
  gap: 0.012,
  seedRadius: 0.012,
  cellInk: 0.02,
  strictCellInk: 0.06,
  minArea: 0.004,
  maxArea: 0.6,
  retries: 3,
};

/** Grown-block confidence. Lower than most detected sections on purpose. */
const GROWN_CONFIDENCE = 0.5;
const CAPPED_CONFIDENCE = 0.2;
const TOO_SMALL_CONFIDENCE = 0.3;
/** A grown block this close to a detected leaf is reported as that leaf. */
const SAME_AS_DETECTED_IOU = 0.8;

type Grid = { cell: number; cols: number; rows: number; on: Uint8Array };

const gridCache = new WeakMap<AnalysisContext, Map<number, Grid>>();

function cellGrid(ctx: AnalysisContext, cellPx: number, cellInk: number): Grid {
  let byInk = gridCache.get(ctx);
  if (!byInk) {
    byInk = new Map();
    gridCache.set(ctx, byInk);
  }
  const hit = byInk.get(cellInk);
  if (hit) return hit;

  const cols = Math.ceil(ctx.page.width / cellPx);
  const rows = Math.ceil(ctx.page.height / cellPx);
  const on = new Uint8Array(cols * rows);
  const need = Math.max(1, cellInk * cellPx * cellPx);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (ctx.it.sum(c * cellPx, r * cellPx, cellPx, cellPx) >= need) on[r * cols + c] = 1;
    }
  }
  const grid = { cell: cellPx, cols, rows, on };
  byInk.set(cellInk, grid);
  return grid;
}

/** Nearest on-cell to (c, r) within `radius` cells, or null. */
function seedCell(g: Grid, c: number, r: number, radius: number): { c: number; r: number } | null {
  if (g.on[r * g.cols + c]) return { c, r };
  let best: { c: number; r: number; d: number } | null = null;
  for (let ring = 1; ring <= radius; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows || !g.on[rr * g.cols + cc]) continue;
        const d = dc * dc + dr * dr;
        if (!best || d < best.d) best = { c: cc, r: rr, d };
      }
    }
    if (best) return best;
  }
  return null;
}

type Blob = { c0: number; r0: number; c1: number; r1: number; capped: boolean };

/**
 * Flood fill over on-cells, joining cells up to `reach` apart. Stops early and
 * reports `capped` as soon as the blob's box passes `maxCells`.
 */
function flood(g: Grid, seed: { c: number; r: number }, reach: number, maxCells: number): Blob {
  const seen = new Uint8Array(g.cols * g.rows);
  const stack = [seed.r * g.cols + seed.c];
  seen[stack[0]] = 1;
  let c0 = seed.c;
  let c1 = seed.c;
  let r0 = seed.r;
  let r1 = seed.r;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const c = i % g.cols;
    const r = (i - c) / g.cols;
    if (c < c0) c0 = c;
    if (c > c1) c1 = c;
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > maxCells) return { c0, r0, c1, r1, capped: true };
    for (let dr = -reach; dr <= reach; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= g.rows) continue;
      for (let dc = -reach; dc <= reach; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc >= g.cols) continue;
        const j = rr * g.cols + cc;
        if (seen[j] || !g.on[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return { c0, r0, c1, r1, capped: false };
}

function blobRect(g: Grid, b: Blob, ctx: AnalysisContext): PxRect {
  const x = b.c0 * g.cell;
  const y = b.r0 * g.cell;
  return {
    x,
    y,
    w: Math.min(ctx.page.width, (b.c1 + 1) * g.cell) - x,
    h: Math.min(ctx.page.height, (b.r1 + 1) * g.cell) - y,
  };
}

function smallestDetectedLeafAt(result: DetectResult | null | undefined, p: { x: number; y: number }) {
  if (!result) return null;
  return (
    result.sections
      .filter((s) => s.kind === 'leaf' && containsPoint(s.rect, p))
      .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0] ?? null
  );
}

const cutCache = new WeakMap<AnalysisContext, Separator[]>();

/**
 * Dashed rules across the page — the cut lines between label and invoice.
 * Ink is bridged across them (the gap is a few px), so the flood fill needs
 * them stated outright to know it must stop.
 */
function cutLines(ctx: AnalysisContext): Separator[] {
  const hit = cutCache.get(ctx);
  if (hit) return hit;
  const out: Separator[] = [];
  if (ctx.content && ctx.scale && ctx.asH && ctx.asV) {
    const { page, mask, it, codes, content, scale, opts } = ctx;
    for (const as of [ctx.asH, ctx.asV]) {
      const p = lineProfile(page, mask, content, as.axis, as.dashGapPx, opts.toneTol);
      out.push(...findSeparators(page, mask, it, codes, content, p, as, scale, opts).accepted.filter((s) => s.kind === 'dashed'));
    }
  }
  cutCache.set(ctx, out);
  return out;
}

/** Keep only the side of every cut line that `seed` (analysis px) is on. */
function clampToCuts(ctx: AnalysisContext, rect: PxRect, seed: { x: number; y: number }): PxRect {
  let { x, y, w, h } = rect;
  for (const s of cutLines(ctx)) {
    const at = s.axis === 'h' ? seed.y : seed.x;
    if (at >= s.start && at < s.end) continue;
    if (s.axis === 'h') {
      if (at < s.start) h = Math.min(y + h, s.start) - y;
      else {
        const b = y + h;
        y = Math.max(y, s.end);
        h = b - y;
      }
    } else if (at < s.start) w = Math.min(x + w, s.start) - x;
    else {
      const r = x + w;
      x = Math.max(x, s.end);
      w = r - x;
    }
  }
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

function grownSection(ctx: AnalysisContext, px: PxRect, confidence: number, note?: GrowNote): Section | null {
  const tight =
    inkBounds(
      ctx.it,
      px,
      Math.max(ctx.opts.edgeInkMin, ctx.opts.edgeInk * px.w),
      Math.max(ctx.opts.edgeInkMin, ctx.opts.edgeInk * px.h),
    ) ?? px;
  const padded = padRect(tight, ctx.scale?.padPx ?? 2, ctx.full);
  const rect = toNorm(padded, ctx.page.width, ctx.page.height);
  return {
    id: `g:${padded.x}:${padded.y}:${padded.w}:${padded.h}`,
    kind: 'leaf',
    parentId: null,
    depth: -1,
    rect,
    confidence,
    inkRatio: Number(ctx.it.ratio(padded).toFixed(4)),
    hasCodeLike: codeTilesInside(ctx.codes, padded) >= ctx.opts.codeTilesMin,
    boundedBy: { top: 'ink-gap', right: 'ink-gap', bottom: 'ink-gap', left: 'ink-gap' },
    order: -1,
    source: 'grown',
    note,
  };
}

/**
 * The block of ink around `at` (page fractions), or null when there is nothing
 * there. Pass the detection result when it exists, so a grown block that is
 * really a detected section comes back as that section, and a capped grow can
 * fall back to the enclosing one.
 */
export function growRegionAt(
  ctx: AnalysisContext,
  at: { x: number; y: number },
  detected?: DetectResult | null,
  options?: Partial<GrowOptions>,
): Section | null {
  const o = options ? { ...DEFAULT_GROW_OPTIONS, ...options } : DEFAULT_GROW_OPTIONS;
  if (!(at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1) || !ctx.content) return null;

  const unit = Math.max(ctx.page.width, ctx.page.height);
  const cellPx = Math.max(2, Math.round(o.cell * unit));
  const pageCells = Math.ceil(ctx.page.width / cellPx) * Math.ceil(ctx.page.height / cellPx);
  const maxCells = o.maxArea * pageCells;
  const minCells = o.minArea * pageCells;
  const baseReach = 1 + Math.ceil((o.gap * unit) / cellPx);

  const c = Math.min(Math.ceil(ctx.page.width / cellPx) - 1, Math.floor((at.x * ctx.page.width) / cellPx));
  const r = Math.min(Math.ceil(ctx.page.height / cellPx) - 1, Math.floor((at.y * ctx.page.height) / cellPx));

  const grid = cellGrid(ctx, cellPx, o.cellInk);
  const seed = seedCell(grid, c, r, Math.ceil((o.seedRadius * unit) / cellPx));
  if (!seed) return null;

  const seedPx = { x: seed.c * cellPx + cellPx / 2, y: seed.r * cellPx + cellPx / 2 };

  let blob = flood(grid, seed, baseReach, maxCells);
  let usedGrid = grid;

  // Ran into most of the page — a dense table, a page-wide border. Try again
  // without bridging gaps and with a stricter idea of what an inked cell is.
  if (blob.capped) {
    const strict = cellGrid(ctx, cellPx, o.strictCellInk);
    const strictSeed = seedCell(strict, c, r, Math.ceil((o.seedRadius * unit) / cellPx));
    const retry = strictSeed ? flood(strict, strictSeed, 1, maxCells) : null;
    if (!retry || retry.capped) {
      const enclosing = smallestDetectedLeafAt(detected, at);
      if (enclosing) return { ...enclosing, note: 'capped' };
      return grownSection(ctx, clampToCuts(ctx, ctx.content, seedPx), CAPPED_CONFIDENCE, 'capped');
    }
    blob = retry;
    usedGrid = strict;
  }

  // A speck-sized block: widen the bridge a step at a time before giving up.
  let reach = baseReach;
  let tries = 0;
  while ((blob.c1 - blob.c0 + 1) * (blob.r1 - blob.r0 + 1) < minCells && tries < o.retries) {
    reach += 1;
    tries += 1;
    const wider = flood(usedGrid, seed, reach, maxCells);
    if (wider.capped) break;
    blob = wider;
  }
  const tooSmall = (blob.c1 - blob.c0 + 1) * (blob.r1 - blob.r0 + 1) < minCells;

  const grown = grownSection(
    ctx,
    clampToCuts(ctx, blobRect(usedGrid, blob, ctx), seedPx),
    tooSmall ? TOO_SMALL_CONFIDENCE : GROWN_CONFIDENCE,
    tooSmall ? 'too-small' : undefined,
  );
  if (!grown) return null;

  if (detected && !tooSmall) {
    const same = detected.sections.find(
      (s) => s.kind === 'leaf' && iou(s.rect, grown.rect) >= SAME_AS_DETECTED_IOU,
    );
    if (same) return same;
  }
  return grown;
}
