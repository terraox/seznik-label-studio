/**
 * Smart Crop — separator candidates and classification.
 *
 * The whole point of this module is to say no. Invoice tables, barcodes and
 * ordinary text lines all look like full-width rules to a naive profile scan,
 * so every candidate has to earn the right to split a region:
 *
 *   accept  ⇔  (distinct OR clearSides ≥ 1)
 *   distinct ⇔  dashed  OR  much thicker than its neighbours  OR  a filled band
 *
 * and the caller additionally requires both resulting regions to clear
 * `minArea`. See SMART_CROP_PLAN.md R2.2 and R2.4.
 */

import { codeCoverage, codeTilesInside, type CodeMap } from './codes';
import { Integral, type InkMask } from './gray';
import { dashStats, type LineProfile } from './profile';
import type { AxisScale, DetectOptions, Scale } from './params';
import type { Axis, GrayPage, PxRect, SeparatorKind } from './types';

export type Separator = {
  axis: Axis;
  kind: SeparatorKind;
  /** Cross coordinate, analysis px. Half-open: the band is [start, end). */
  start: number;
  end: number;
  thickness: number;
  /** Fraction of the node's scan extent the separator covers. */
  span: number;
  /** Pre-closing ink density across the thickness. */
  solidity: number;
  clearSides: 0 | 1 | 2;
  distinct: boolean;
  /** Span × clearance × distinctness × kind, 0-1. Balance is applied by the caller. */
  baseScore: number;
};

export type RejectReason =
  | 'span'
  | 'short'
  | 'text'
  | 'code'
  | 'content-thickness'
  | 'no-clearance'
  | 'tone-neighbour'
  | 'crossed';

export type RejectedSeparator = {
  axis: Axis;
  start: number;
  end: number;
  thickness: number;
  reason: RejectReason;
};

const KIND_WEIGHT: Record<SeparatorKind, number> = {
  gutter: 1,
  dashed: 1,
  band: 0.95,
  solid: 0.85,
};

type Run = { from: number; to: number };

/** Maximal runs of indices where `pass(i)` holds. */
function runsOf(count: number, pass: (i: number) => boolean): Run[] {
  const out: Run[] = [];
  let from = -1;
  for (let i = 0; i < count; i++) {
    if (pass(i)) {
      if (from < 0) from = i;
    } else if (from >= 0) {
      out.push({ from, to: i });
      from = -1;
    }
  }
  if (from >= 0) out.push({ from, to: count });
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function meanOf(arr: Float32Array, from: number, to: number): number {
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += arr[i];
  return sum / (to - from);
}

function medianOfInt(arr: Int32Array, from: number, to: number): number {
  if (to <= from) return 0;
  const slice: number[] = [];
  for (let i = from; i < to; i++) slice.push(arr[i]);
  return median(slice);
}

function argMax(arr: Float32Array, from: number, to: number): number {
  let best = from;
  for (let i = from; i < to; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

/** Cross-axis clearance: how many sides of the band are blank. */
function clearanceSides(
  it: Integral,
  node: PxRect,
  axis: Axis,
  start: number,
  end: number,
  as: AxisScale,
  opts: DetectOptions,
): 0 | 1 | 2 {
  const nodeStart = axis === 'h' ? node.y : node.x;
  const nodeEnd = nodeStart + (axis === 'h' ? node.h : node.w);
  const beforeFrom = Math.max(nodeStart, start - as.clearPx);
  const afterTo = Math.min(nodeEnd, end + as.clearPx);

  const band = (from: number, to: number): PxRect =>
    axis === 'h'
      ? { x: node.x, y: from, w: node.w, h: to - from }
      : { x: from, y: node.y, w: to - from, h: node.h };

  let sides = 0;
  // A zero-thickness clearance band means the candidate sits on the node edge.
  // That is never "clear": the cut would carve off nothing.
  if (start - beforeFrom > 0 && it.ratio(band(beforeFrom, start)) <= opts.clearInk) sides++;
  if (afterTo - end > 0 && it.ratio(band(end, afterTo)) <= opts.clearInk) sides++;
  return sides as 0 | 1 | 2;
}

type Candidate = {
  from: number;
  to: number;
  source: 'ink' | 'tone';
  thickness: number;
  span: number;
  solidity: number;
  bestLine: number;
  transMedian: number;
};

function inkCandidates(p: LineProfile, opts: DetectOptions): Candidate[] {
  return runsOf(p.count, (i) => p.cov[i] >= opts.ruleCover).map((run) => {
    const best = argMax(p.cov, run.from, run.to);
    return {
      from: run.from,
      to: run.to,
      source: 'ink' as const,
      thickness: run.to - run.from,
      span: p.cov[best],
      solidity: meanOf(p.rawCov, run.from, run.to),
      bestLine: best,
      transMedian: medianOfInt(p.trans, run.from, run.to),
    };
  });
}

/**
 * Pale title bands. These carry no ink at all once the ink threshold is capped
 * at 236, so they can only be found from the tone of the line (plan R2.3).
 */
function toneCandidates(p: LineProfile, as: AxisScale, scale: Scale, opts: DetectOptions): Candidate[] {
  const isBandLine = (i: number) =>
    Math.abs(p.mid[i] - scale.paperLevel) >= opts.toneStep &&
    p.uniform[i] >= opts.toneUniformMin &&
    p.rawCov[i] <= opts.toneBandInkMax;

  return runsOf(p.count, isBandLine)
    .filter((run) => {
      const t = run.to - run.from;
      return t >= as.toneTMinPx && t <= as.toneTMaxPx;
    })
    .map((run) => {
      const best = argMax(p.uniform, run.from, run.to);
      return {
        from: run.from,
        to: run.to,
        source: 'tone' as const,
        thickness: run.to - run.from,
        span: p.uniform[best],
        solidity: meanOf(p.rawCov, run.from, run.to),
        bestLine: best,
        transMedian: medianOfInt(p.trans, run.from, run.to),
      };
    });
}

function gutterCandidates(p: LineProfile, as: AxisScale, opts: DetectOptions): Candidate[] {
  return runsOf(p.count, (i) => p.rawCov[i] <= opts.gutterInk)
    .filter((run) => run.to - run.from >= as.gutterMinPx)
    .map((run) => ({
      from: run.from,
      to: run.to,
      source: 'ink' as const,
      thickness: run.to - run.from,
      span: 1,
      solidity: 0,
      bestLine: Math.floor((run.from + run.to) / 2),
      transMedian: 0,
    }));
}

/** At least one neighbouring band must differ from a tone band's own tone. */
function toneNeighbourOk(p: LineProfile, c: Candidate, as: AxisScale, opts: DetectOptions): boolean {
  const bandMid = median(Array.from(p.mid.subarray(c.from, c.to)));
  const beforeFrom = Math.max(0, c.from - as.clearPx);
  const afterTo = Math.min(p.count, c.to + as.clearPx);
  let best = 0;
  if (c.from - beforeFrom > 0) {
    best = Math.max(best, Math.abs(bandMid - median(Array.from(p.mid.subarray(beforeFrom, c.from)))));
  }
  if (afterTo - c.to > 0) {
    best = Math.max(best, Math.abs(bandMid - median(Array.from(p.mid.subarray(c.to, afterTo)))));
  }
  return best >= opts.toneStepNeighbour;
}

export type SeparatorScan = {
  accepted: Separator[];
  rejected: RejectedSeparator[];
};

export function findSeparators(
  page: GrayPage,
  mask: InkMask,
  it: Integral,
  codes: CodeMap,
  node: PxRect,
  p: LineProfile,
  as: AxisScale,
  scale: Scale,
  opts: DetectOptions,
): SeparatorScan {
  const axis = p.axis;
  const rejected: RejectedSeparator[] = [];
  const reject = (c: Candidate, reason: RejectReason) =>
    rejected.push({
      axis,
      start: p.start + c.from,
      end: p.start + c.to,
      thickness: c.thickness,
      reason,
    });

  type Classified = { c: Candidate; kind: SeparatorKind; dashed: boolean };
  const classified: Classified[] = [];

  for (const c of [...inkCandidates(p, opts), ...toneCandidates(p, as, scale, opts)]) {
    if (c.span < opts.ruleSpan) {
      reject(c, 'span');
      continue;
    }
    if (c.span * p.extent < as.sepMinLenPx) {
      reject(c, 'short');
      continue;
    }
    // Barcodes: never a separator, however solid and full-width they look.
    const candRect: PxRect =
      axis === 'h'
        ? { x: node.x, y: p.start + c.from, w: node.w, h: c.thickness }
        : { x: p.start + c.from, y: node.y, w: c.thickness, h: node.h };
    if (codeCoverage(codes, candRect) >= opts.codeCover) {
      reject(c, 'code');
      continue;
    }

    if (c.source === 'tone') {
      if (!toneNeighbourOk(p, c, as, opts)) {
        reject(c, 'tone-neighbour');
        continue;
      }
      classified.push({ c, kind: 'band', dashed: false });
      continue;
    }

    if (c.thickness <= as.thinTPx) {
      const ds = dashStats(mask, node, axis, c.bestLine, page.width);
      const dashed =
        ds.runs >= opts.dashMinRuns &&
        ds.duty >= opts.dashDutyMin &&
        ds.duty <= opts.dashDutyMax &&
        ds.periodCv <= opts.dashRegularity &&
        ds.dashCv <= opts.dashRegularity;
      if (dashed) {
        classified.push({ c, kind: 'dashed', dashed: true });
      } else if (c.solidity >= opts.bandSolidity) {
        classified.push({ c, kind: 'solid', dashed: false });
      } else {
        // Thin, full width after closing, but neither a regular dash pattern
        // nor solid ink: a line of text.
        reject(c, 'text');
      }
      continue;
    }

    if (c.thickness <= as.bandTMaxPx) {
      if (c.solidity >= opts.bandSolidity) classified.push({ c, kind: 'band', dashed: false });
      else reject(c, 'text');
      continue;
    }

    reject(c, 'content-thickness');
  }

  // "Much thicker" is relative to the other rules on this page, so the median
  // can only be taken once every candidate has been classified.
  const ruleThicknesses = classified
    .filter((k) => k.kind === 'dashed' || k.kind === 'solid')
    .map((k) => k.c.thickness);
  const medianThickness = median(ruleThicknesses);

  const accepted: Separator[] = [];

  for (const { c, kind, dashed } of classified) {
    const start = p.start + c.from;
    const end = p.start + c.to;
    const clearSides = clearanceSides(it, node, axis, start, end, as, opts);
    const distinct =
      dashed ||
      kind === 'band' ||
      (medianThickness > 0 && c.thickness >= opts.thickMult * medianThickness);

    if (!distinct && clearSides === 0) {
      // Text immediately adjacent on both sides: a table rule.
      reject(c, 'no-clearance');
      continue;
    }

    accepted.push({
      axis,
      kind,
      start,
      end,
      thickness: c.thickness,
      span: Math.min(1, c.span),
      solidity: c.solidity,
      clearSides,
      distinct,
      baseScore:
        Math.min(1, Math.max(0, c.span)) *
        (0.6 + 0.2 * clearSides) *
        (distinct ? 1 : 0.8) *
        KIND_WEIGHT[kind],
    });
  }

  for (const c of gutterCandidates(p, as, opts)) {
    // Whitespace inside a bordered box is crossed end to end by the box's own
    // side borders. That is the inside of one block, not a gap between two —
    // and on a wide box those two thin borders can sit under `gutterInk`.
    if (gutterCrossed(it, node, axis, p.start + c.from, p.start + c.to)) {
      reject(c, 'crossed');
      continue;
    }
    accepted.push({
      axis,
      kind: 'gutter',
      start: p.start + c.from,
      end: p.start + c.to,
      thickness: c.thickness,
      span: 1,
      solidity: 0,
      clearSides: 2,
      distinct: true,
      baseScore: KIND_WEIGHT.gutter,
    });
  }

  return { accepted, rejected };
}

/** True if some stroke runs through the whole thickness of a gutter band. */
function gutterCrossed(it: Integral, node: PxRect, axis: Axis, start: number, end: number): boolean {
  const t = end - start;
  if (t <= 0) return false;
  if (axis === 'h') {
    for (let x = node.x; x < node.x + node.w; x++) if (it.sum(x, start, 1, t) === t) return true;
  } else {
    for (let y = node.y; y < node.y + node.h; y++) if (it.sum(start, y, t, 1) === t) return true;
  }
  return false;
}

/** Does this region hold a 1D barcode? See codes.ts for why this is tile based. */
export function hasCodeLike(codes: CodeMap, rect: PxRect, opts: DetectOptions): boolean {
  return codeTilesInside(codes, rect) >= opts.codeTilesMin;
}
