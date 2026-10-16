/**
 * Smart Crop — screen ↔ page coordinates.
 *
 * Section rects and crop rects are fractions of the **unrotated rendered page**
 * (plan §4.3). The viewer may draw that page rotated, zoomed and panned; these
 * functions undo exactly that, so a tap always lands in the same frame the
 * detector and `cropRgbaNorm` use.
 *
 * Today the crop view draws the page unrotated at zoom 1, so in practice only
 * the stage scale applies. The rotation and zoom terms are tested anyway so the
 * mapping breaks loudly if the crop view ever gains them (plan R1.2.2).
 */

import type { NormRect } from './types';

export type Rotation = 0 | 90 | 180 | 270;

/**
 * How the page is drawn: rotated clockwise by `rotation`, scaled to fill a
 * `stageW` × `stageH` box (already in the rotated aspect), then zoomed about the
 * stage centre and translated by `panX` / `panY`. All in screen px.
 */
export type ViewTransform = {
  stageW: number;
  stageH: number;
  rotation?: Rotation;
  zoom?: number;
  panX?: number;
  panY?: number;
};

type Pt = { x: number; y: number };

/** Page fraction → fraction of the displayed (rotated) stage. */
function rotateForward(p: Pt, rotation: Rotation): Pt {
  switch (rotation) {
    case 90:
      return { x: 1 - p.y, y: p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: p.y, y: 1 - p.x };
    default:
      return p;
  }
}

/** Fraction of the displayed (rotated) stage → page fraction. */
function rotateBack(p: Pt, rotation: Rotation): Pt {
  switch (rotation) {
    case 90:
      return { x: p.y, y: 1 - p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: 1 - p.y, y: p.x };
    default:
      return p;
  }
}

/** Screen px → page fraction, or null when the point is off the page. */
export function screenToNorm(pt: Pt, t: ViewTransform): Pt | null {
  const w = Math.max(1, t.stageW);
  const h = Math.max(1, t.stageH);
  const zoom = t.zoom && t.zoom > 0 ? t.zoom : 1;
  const sx = (pt.x - (t.panX ?? 0) - w / 2) / zoom + w / 2;
  const sy = (pt.y - (t.panY ?? 0) - h / 2) / zoom + h / 2;
  const u = sx / w;
  const v = sy / h;
  const eps = 1e-6;
  if (u < -eps || u > 1 + eps || v < -eps || v > 1 + eps) return null;
  const p = rotateBack({ x: Math.min(1, Math.max(0, u)), y: Math.min(1, Math.max(0, v)) }, t.rotation ?? 0);
  return { x: p.x, y: p.y };
}

/** Page fraction → screen px. */
export function normToScreen(p: Pt, t: ViewTransform): Pt {
  const w = Math.max(1, t.stageW);
  const h = Math.max(1, t.stageH);
  const zoom = t.zoom && t.zoom > 0 ? t.zoom : 1;
  const d = rotateForward(p, t.rotation ?? 0);
  return {
    x: (d.x * w - w / 2) * zoom + w / 2 + (t.panX ?? 0),
    y: (d.y * h - h / 2) * zoom + h / 2 + (t.panY ?? 0),
  };
}

/** Page-fraction rect → screen rect (axis-aligned; rotation by quarter turns keeps it so). */
export function normRectToScreen(r: NormRect, t: ViewTransform): NormRect {
  const a = normToScreen({ x: r.x, y: r.y }, t);
  const b = normToScreen({ x: r.x + r.w, y: r.y + r.h }, t);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}
