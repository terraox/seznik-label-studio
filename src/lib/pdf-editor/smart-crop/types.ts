/**
 * Smart Crop — shared types.
 *
 * Everything here is pure data. This module must not import React, React
 * Native or anything native, so the detector stays unit-testable in node.
 */

/** Luminance raster, one byte per pixel, 0 = black. Same shape as `GrayRaster`. */
export type GrayPage = {
  width: number;
  height: number;
  gray: Uint8Array;
};

/** Fractions of the **full rendered page**, top-left origin. */
export type NormRect = { x: number; y: number; w: number; h: number };

/** Integer pixel rect in the analysis buffer. Half-open: covers x .. x+w-1. */
export type PxRect = { x: number; y: number; w: number; h: number };

/** Scan direction. `h` = horizontal rules, scanned row by row. */
export type Axis = 'h' | 'v';

export type SeparatorKind = 'dashed' | 'solid' | 'band' | 'gutter';

/** What bounds one side of a section. */
export type EdgeKind =
  | 'page'
  | 'content'
  | 'dashed'
  | 'solid'
  | 'band'
  | 'gutter'
  | 'ink-gap'
  | 'none';

export type SectionKind = 'leaf' | 'group';

export type Section = {
  id: string;
  /** `group` is an internal XY-cut node, kept so a tap can step outward. */
  kind: SectionKind;
  parentId: string | null;
  depth: number;
  /** Fractions of the full page. Leaves are tightened to their own ink. */
  rect: NormRect;
  confidence: number;
  inkRatio: number;
  /** A barcode / QR / DataMatrix block is inside. */
  hasCodeLike: boolean;
  boundedBy: { top: EdgeKind; right: EdgeKind; bottom: EdgeKind; left: EdgeKind };
  /** Reading order among leaves, top to bottom then left to right. -1 for groups and grown blocks. */
  order: number;
  /** `grown` = built by region-grow around a tap, not by the detector. */
  source: 'detected' | 'grown';
  /** Region-grow outcome worth telling the user about. */
  note?: GrowNote;
};

/**
 * - `capped`: the block around the tap ran into most of the page (a big table,
 *   a full-page border), so the enclosing section was returned instead.
 * - `too-small`: a speck-sized block; returned anyway, but worth a nudge.
 */
export type GrowNote = 'capped' | 'too-small';

export type DropReason =
  | 'below-min-area'
  | 'below-min-ink'
  | 'over-cap'
  | 'depth-cap'
  | 'code-block';

export type DroppedSection = { rect: NormRect; reason: DropReason };

export type DetectTiming = {
  /** Downscale to the analysis buffer. */
  downscaleMs: number;
  /** Threshold + integral image + content trim. */
  prepareMs: number;
  /** Profiles, separators, recursive cut, tighten. */
  cutMs: number;
  totalMs: number;
};

export type DetectResult = {
  /** Leaves and groups, leaves in reading order. */
  sections: Section[];
  /** Leaves worth showing as overlays, in reading order, capped at `visibleCap`. */
  visibleIds: string[];
  dropped: DroppedSection[];
  /** Ink bounds of the whole page, as fractions of the full page. */
  contentRect: NormRect;
  /** Size of the buffer the analysis actually ran on. */
  analysis: { w: number; h: number };
  /** Ink threshold and paper level the run settled on, for logging. */
  tone: { inkMax: number; paperLevel: number };
  timing: DetectTiming;
  suggestedId: string | null;
};

export function leaves(result: DetectResult): Section[] {
  return result.sections.filter((s) => s.kind === 'leaf');
}

export function sectionById(result: DetectResult, id: string): Section | null {
  return result.sections.find((s) => s.id === id) ?? null;
}

/** Union of several rects, as used by multi-select in Phase 2. */
export function unionRects(rects: NormRect[]): NormRect | null {
  if (rects.length === 0) return null;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    if (r.x < x0) x0 = r.x;
    if (r.y < y0) y0 = r.y;
    if (r.x + r.w > x1) x1 = r.x + r.w;
    if (r.y + r.h > y1) y1 = r.y + r.h;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
