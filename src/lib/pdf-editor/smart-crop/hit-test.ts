/**
 * Smart Crop — which section is under a point.
 *
 * Returns a **chain**, smallest first: the leaf under the point, then each
 * enclosing group out to the root. Tapping the same spot again walks this
 * chain outward and wraps back (plan R1.1.2).
 */

import type { DetectResult, NormRect, Section } from './types';

/** "On the edge" counts as inside, within this many page fractions. */
export const EDGE_SLOP = 0.004;

export function containsPoint(r: NormRect, p: { x: number; y: number }, slop = EDGE_SLOP): boolean {
  return p.x >= r.x - slop && p.x <= r.x + r.w + slop && p.y >= r.y - slop && p.y <= r.y + r.h + slop;
}

export function areaOf(r: NormRect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function iou(a: NormRect, b: NormRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = areaOf(a) + areaOf(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** Nearly the same rect — used to drop chain steps the user could not see change. */
export function sameRect(a: NormRect, b: NormRect, threshold = 0.95): boolean {
  return iou(a, b) >= threshold;
}

/**
 * Leaves containing the point (smallest first), then groups containing it
 * (smallest first), with visually identical steps removed.
 */
export function hitChain(result: DetectResult | null, p: { x: number; y: number }, slop = EDGE_SLOP): Section[] {
  if (!result) return [];
  const bySize = (a: Section, b: Section) => areaOf(a.rect) - areaOf(b.rect);
  const leaves = result.sections.filter((s) => s.kind === 'leaf' && containsPoint(s.rect, p, slop)).sort(bySize);
  const groups = result.sections.filter((s) => s.kind === 'group' && containsPoint(s.rect, p, 0)).sort(bySize);
  const out: Section[] = [];
  for (const s of [...leaves.slice(0, 1), ...groups]) {
    if (out.length > 0 && sameRect(out[out.length - 1].rect, s.rect)) continue;
    out.push(s);
  }
  return out;
}
