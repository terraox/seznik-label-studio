/**
 * Smart Crop — what a tap selects.
 *
 * A detected leaf under the point wins. Otherwise region-grow builds the block
 * around the tap, which works before detection has finished and where
 * detection missed a boundary. Either way the result is a chain, smallest
 * first, that a repeat tap walks outward.
 */

import type { AnalysisContext } from './detector';
import { growRegionAt } from './grow';
import { areaOf, hitChain, sameRect } from './hit-test';
import type { DetectResult, Section } from './types';

export type ResolvedTap = {
  chain: Section[];
  /** `detected`: a detector section. `grown`: region-grow. `none`: nothing there. */
  via: 'detected' | 'grown' | 'none';
};

export function resolveTapChain(
  ctx: AnalysisContext | null,
  result: DetectResult | null,
  p: { x: number; y: number },
): ResolvedTap {
  const hit = hitChain(result, p);
  if (hit[0]?.kind === 'leaf') return { chain: hit, via: 'detected' };
  if (!ctx) return { chain: [], via: 'none' };

  const grown = growRegionAt(ctx, p, result);
  if (!grown) return { chain: [], via: 'none' };

  const outer = hit.filter(
    (s) => s.kind === 'group' && areaOf(s.rect) > areaOf(grown.rect) && !sameRect(s.rect, grown.rect),
  );
  return { chain: [grown, ...outer], via: grown.source === 'detected' ? 'detected' : 'grown' };
}
