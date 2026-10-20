import type { GrayPage, NormRect } from '@/lib/pdf-editor/smart-crop';

const INK = 160;
/** A row counts as a solid rule when this much of the crop width is ink. */
const SOLID = 0.85;
/** Only the bottom of the crop is searched, as a share of its height. */
const SEARCH = 0.1;

/**
 * Cuts the bottom of a crop at its last solid horizontal rule. Flipkart's label is a boxed
 * table, and the dashed cut line printed just under the box would otherwise stay in the crop.
 * Returns the crop unchanged when no rule is found near the bottom.
 */
export function trimBottomToRule(page: GrayPage, rect: NormRect): NormRect {
  const x0 = Math.max(0, Math.round(rect.x * page.width));
  const x1 = Math.min(page.width, Math.round((rect.x + rect.w) * page.width));
  const yTop = Math.max(0, Math.round(rect.y * page.height));
  const yBottom = Math.min(page.height, Math.round((rect.y + rect.h) * page.height));
  const width = x1 - x0;
  if (width < 1 || yBottom <= yTop) return rect;

  const lowest = Math.max(yTop, yBottom - Math.round((yBottom - yTop) * SEARCH));
  for (let y = yBottom - 1; y >= lowest; y--) {
    let ink = 0;
    for (let x = x0; x < x1; x++) if (page.gray[y * page.width + x] < INK) ink++;
    if (ink / width < SOLID) continue;
    // Keep the rule's own thickness: step down while the rows below are still solid.
    let end = y;
    while (end + 1 < yBottom) {
      let n = 0;
      for (let x = x0; x < x1; x++) if (page.gray[(end + 1) * page.width + x] < INK) n++;
      if (n / width < SOLID) break;
      end++;
    }
    return { ...rect, h: (end + 1) / page.height - rect.y };
  }
  return rect;
}
