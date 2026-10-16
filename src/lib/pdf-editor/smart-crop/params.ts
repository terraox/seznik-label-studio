/**
 * Smart Crop — every threshold in one place.
 *
 * Only `analysisLongEdge` is an absolute pixel count: it is the sampling grid
 * itself. Everything else is relative, and the reference depends on what the
 * threshold describes (SMART_CROP_PLAN.md R2.10):
 *
 * - **printed marks and whitespace** — dash gap, rule and band thickness,
 *   clearance, gutter width, pad, code tile — × the page long edge (`unit`).
 *   A 2 mm dash gap does not shrink because half the sheet is blank.
 * - **areas** — `minArea` — × the trimmed content area, so a half-blank page
 *   still yields sections.
 * - **lengths** — `ruleSpan` × the node being cut, `sepMinLen` × the content.
 * - **tones** — gray levels.
 */

import type { Axis } from './types';

export type DetectOptions = {
  // ── Sampling ──────────────────────────────────────────────────────────────
  /** Long edge of the analysis buffer, px. ~100 DPI on A4. */
  analysisLongEdge: number;

  // ── Tone ──────────────────────────────────────────────────────────────────
  /** Percentile of sampled pixels taken as blank paper. */
  paperPctl: number;
  /** Ink threshold = clamp(p90 - inkMargin, inkMin, inkMax). */
  inkPctl: number;
  inkMargin: number;
  inkMin: number;
  inkMax: number;

  // ── Dash merge ────────────────────────────────────────────────────────────
  /** Gap closed along the scan direction, × unit. */
  dashGap: number;

  // ── Rule candidates ───────────────────────────────────────────────────────
  /** Closed coverage of the scan line for it to count as rule-ish. */
  ruleCover: number;
  /** Fraction of the node's scan extent a separator must span. */
  ruleSpan: number;
  /**
   * Minimum separator length, × the content scan extent. `ruleSpan` alone is
   * relative to the node, and inside a short node a single barcode bar spans
   * the whole node. Rules and bands only; gutters are bounded by `minArea`.
   */
  sepMinLen: number;
  /** Thin-rule thickness, × unit. */
  thinT: number;
  /** Above this a candidate is content, not a separator. × unit. */
  bandTMax: number;
  /** Pre-closing ink density across the thickness for a solid rule or ink band. */
  bandSolidity: number;
  /** "Much thicker than its neighbours" multiplier, vs the median candidate. */
  thickMult: number;

  // ── Dash classification ───────────────────────────────────────────────────
  dashMinRuns: number;
  dashDutyMin: number;
  dashDutyMax: number;
  /** Max relative std dev of the dash+gap period, and of the dash lengths. */
  dashRegularity: number;

  // ── Tone-step bands (pale title bands) ────────────────────────────────────
  /** Min |lineMid - paperLevel|, gray levels. */
  toneStep: number;
  /** Min difference from at least one neighbouring band, gray levels. */
  toneStepNeighbour: number;
  /**
   * Uniformity window about the line median, gray levels. Must stay below
   * `toneStep`, or the window around a pale band reaches paper white and every
   * half-blank line scores as uniform.
   */
  toneTol: number;
  /** Fraction of the line within `toneTol` of its median. */
  toneUniformMin: number;
  /** Max raw ink coverage inside a tone band — it may carry a heading. */
  toneBandInkMax: number;
  /** Tone band thickness range, × unit. */
  toneBandTMin: number;
  toneBandTMax: number;

  // ── Clearance and gutters ─────────────────────────────────────────────────
  /** Clearance band thickness, × unit. */
  clear: number;
  /** Max ink ratio inside a clearance band for it to count as blank. */
  clearInk: number;
  /** Min blank gutter thickness to cut on, × unit. */
  gutterMin: number;
  gutterInk: number;

  // ── Codes (tile grid, see codes.ts) ──────────────────────────────────────
  /** Code tile edge, × unit. */
  codeTile: number;
  /** Bar starts per tile pixel along the dense axis. Text is dense too. */
  codeTransDensity: number;
  /**
   * Changes along the steady axis / ink pixels. Near 0 inside a barcode,
   * well above this for text, whose rows change shape.
   */
  codeSteadyMax: number;
  codeInkMin: number;
  codeInkMax: number;
  /** Code tiles fully inside a region for `hasCodeLike`. */
  codeTilesMin: number;
  /** Code-tile coverage at which a separator candidate is a code instead. */
  codeCover: number;

  // ── Regions ───────────────────────────────────────────────────────────────
  /** Min region area, × the content area. */
  minArea: number;
  /** Min ink ratio inside a region. */
  minInk: number;
  /** Tighten pad, × unit. */
  pad: number;
  maxDepth: number;
  maxRegions: number;
  /** Leaves shown as overlays. The rest stay in memory, see plan §5.2. */
  visibleCap: number;

  // ── Robust content trim ───────────────────────────────────────────────────
  /** A row or column needs this much ink to count as content, × scan extent. */
  edgeInk: number;
  /** Floor for the above, in pixels. Kills specks up to 3 px across. */
  edgeInkMin: number;
};

export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  analysisLongEdge: 1000,

  paperPctl: 0.95,
  inkPctl: 0.9,
  inkMargin: 12,
  inkMin: 40,
  inkMax: 236,

  dashGap: 0.012,

  ruleCover: 0.55,
  ruleSpan: 0.8,
  sepMinLen: 0.25,
  thinT: 0.006,
  bandTMax: 0.06,
  bandSolidity: 0.72,
  thickMult: 2.5,

  dashMinRuns: 6,
  dashDutyMin: 0.25,
  dashDutyMax: 0.9,
  dashRegularity: 0.45,

  toneStep: 8,
  toneStepNeighbour: 5,
  toneTol: 6,
  toneUniformMin: 0.7,
  toneBandInkMax: 0.35,
  toneBandTMin: 0.008,
  toneBandTMax: 0.06,

  clear: 0.02,
  clearInk: 0.02,
  gutterMin: 0.04,
  gutterInk: 0.005,

  codeTile: 0.024,
  codeTransDensity: 0.1,
  codeSteadyMax: 0.06,
  codeInkMin: 0.15,
  codeInkMax: 0.85,
  codeTilesMin: 3,
  codeCover: 0.3,

  minArea: 0.015,
  minInk: 0.002,
  pad: 0.004,
  maxDepth: 4,
  maxRegions: 24,
  visibleCap: 8,

  edgeInk: 0.002,
  edgeInkMin: 4,
};

export function resolveOptions(partial?: Partial<DetectOptions>): DetectOptions {
  return partial ? { ...DEFAULT_DETECT_OPTIONS, ...partial } : DEFAULT_DETECT_OPTIONS;
}

/**
 * Content geometry plus the thresholds that depend on it, resolved to pixels
 * once per run. Thresholds are measured against the **content rect**, never
 * against the node being cut, so every depth uses the same yardstick.
 */
export type Scale = {
  /** Page long edge in analysis px — the reference for printed-mark thresholds. */
  unit: number;
  contentW: number;
  contentH: number;
  contentArea: number;
  pageW: number;
  pageH: number;
  paperLevel: number;
  inkMax: number;
  minAreaPx: number;
  padPx: number;
};

/** Thresholds in pixels for one scan direction. */
export type AxisScale = {
  axis: Axis;
  /** Length of a scan line. */
  scanExtent: number;
  /** The dimension thickness is measured along. */
  crossExtent: number;
  dashGapPx: number;
  thinTPx: number;
  bandTMaxPx: number;
  clearPx: number;
  gutterMinPx: number;
  toneTMinPx: number;
  toneTMaxPx: number;
  edgeInkPx: number;
  sepMinLenPx: number;
};

export function axisScale(scale: Scale, axis: Axis, opts: DetectOptions): AxisScale {
  // A horizontal rule runs along the content width and is thick along its height.
  const scanExtent = axis === 'h' ? scale.contentW : scale.contentH;
  const crossExtent = axis === 'h' ? scale.contentH : scale.contentW;
  const u = scale.unit;
  return {
    axis,
    scanExtent,
    crossExtent,
    dashGapPx: Math.max(1, Math.round(opts.dashGap * u)),
    thinTPx: Math.max(1, opts.thinT * u),
    bandTMaxPx: Math.max(2, opts.bandTMax * u),
    clearPx: Math.max(2, Math.round(opts.clear * u)),
    gutterMinPx: Math.max(2, Math.round(opts.gutterMin * u)),
    toneTMinPx: Math.max(1, opts.toneBandTMin * u),
    toneTMaxPx: Math.max(2, opts.toneBandTMax * u),
    edgeInkPx: Math.max(opts.edgeInkMin, opts.edgeInk * scanExtent),
    sepMinLenPx: opts.sepMinLen * scanExtent,
  };
}
