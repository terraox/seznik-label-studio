/**
 * Ecommerce shipping labels — where the label and the invoice sit on each platform's PDF page.
 *
 * Pure geometry over Smart Crop sections, so it runs in node tests. A page that does not look
 * like the chosen platform returns `null`, which is how a wrong or unexpected PDF is rejected.
 */

import { unionRects, type NormRect, type Section } from '@/lib/pdf-editor/smart-crop';

export type PlatformId = 'amazon' | 'flipkart' | 'meesho';

export const PLATFORMS: { id: PlatformId; name: string }[] = [
  { id: 'amazon', name: 'Amazon' },
  { id: 'flipkart', name: 'Flipkart' },
  { id: 'meesho', name: 'Meesho' },
];

export function platformName(id: PlatformId): string {
  return PLATFORMS.find((p) => p.id === id)?.name ?? id;
}

export type LeafLike = Pick<Section, 'rect' | 'hasCodeLike' | 'boundedBy'>;

export type LocatedPage = {
  label: NormRect;
  /** The rest of the page. Null when the page has nothing besides the label. */
  invoice: NormRect | null;
};

/** Keeps the label's own border inside the crop. */
const PAD = 0.008;

function pad(r: NormRect, p = PAD): NormRect {
  const x = Math.max(0, r.x - p);
  const y = Math.max(0, r.y - p);
  return { x, y, w: Math.min(1, r.x + r.w + p) - x, h: Math.min(1, r.y + r.h + p) - y };
}

const byTop = (a: LeafLike, b: LeafLike) => a.rect.y - b.rect.y || a.rect.x - b.rect.x;
const bottom = (s: LeafLike) => s.rect.y + s.rect.h;

function locateAmazon(leaves: LeafLike[]): LocatedPage | null {
  const left = leaves.filter((s) => s.rect.x + s.rect.w <= 0.56);
  const right = leaves.filter((s) => s.rect.x >= 0.5);
  if (left.some((s) => s.hasCodeLike && s.rect.x < 0.25)) {
    // One page per order: label on the left, invoice on the right.
    const label = unionRects(left.map((s) => s.rect));
    if (!label) return null;
    return { label: pad(label), invoice: unionRects(right.map((s) => s.rect)) };
  }
  // Two pages per order: this page is the whole label (a wide barcode, no invoice); the invoice
  // is the next page. Meesho's page also spans the width, but its sections meet at title bands.
  const all = unionRects(leaves.map((s) => s.rect));
  const wideCode = leaves.some((s) => s.hasCodeLike && s.rect.x < 0.1 && s.rect.w > 0.7);
  const banded = leaves.some((s) => Object.values(s.boundedBy).includes('band'));
  if (all && wideCode && !banded && all.y < 0.06 && all.h >= 0.85) return { label: pad(all), invoice: null };
  return null;
}

/**
 * Amazon's two-page format: the page after a label is its invoice, a text page with no
 * barcode that runs from the top margin to the footer.
 */
export function locateInvoicePage(platform: PlatformId, leaves: LeafLike[]): NormRect | null {
  if (platform !== 'amazon' || leaves.length < 3 || leaves.some((s) => s.hasCodeLike)) return null;
  const all = unionRects(leaves.map((s) => s.rect));
  return all && all.y < 0.06 && all.h >= 0.8 ? pad(all) : null;
}

function locateFlipkart(leaves: LeafLike[]): LocatedPage | null {
  const [first, ...rest] = [...leaves].sort(byTop);
  if (!first || !first.hasCodeLike) return null;
  const centred = Math.abs(first.rect.x + first.rect.w / 2 - 0.5) <= 0.06;
  if (!centred || first.rect.w < 0.2 || first.rect.w > 0.8 || first.rect.y > 0.15) return null;
  const below = rest.filter((s) => s.rect.y >= bottom(first) - 0.02);
  if (below.length === 0) return null;
  return { label: pad(first.rect), invoice: unionRects(below.map((s) => s.rect)) };
}

/** Exchange labels (Shadowfax) have no invoice: just the boxed label across the top of the page. */
function locateMeeshoLabelOnly(sorted: LeafLike[]): LocatedPage | null {
  const label = unionRects(sorted.map((s) => s.rect));
  if (!label || label.y > 0.06 || label.x > 0.03 || label.w < 0.95 || label.h > 0.5) return null;
  if (!sorted.some((s) => s.hasCodeLike)) return null;
  // Amazon's two-column page also spans the width; its sections are cut by dashed lines.
  const edges = (s: LeafLike) => Object.values(s.boundedBy);
  if (sorted.some((s) => edges(s).includes('dashed'))) return null;
  return { label: pad(label), invoice: null };
}

function locateMeesho(leaves: LeafLike[]): LocatedPage | null {
  const sorted = [...leaves].sort(byTop);
  const invoiceStart = sorted.find((s) => s.boundedBy.top === 'band' && s.rect.y > 0.2);
  if (!invoiceStart) return locateMeeshoLabelOnly(sorted);
  const above = sorted.filter((s) => bottom(s) <= invoiceStart.rect.y + 0.02);
  const label = unionRects(above.map((s) => s.rect));
  if (!label || label.y > 0.06 || label.w < 0.9 || !above.some((s) => s.hasCodeLike)) return null;
  const rest = sorted.filter((s) => s.rect.y >= invoiceStart.rect.y - 0.02);
  return { label: pad(label), invoice: unionRects(rest.map((s) => s.rect)) };
}

export function locatePage(platform: PlatformId, leaves: LeafLike[]): LocatedPage | null {
  if (leaves.length === 0) return null;
  switch (platform) {
    case 'amazon':
      return locateAmazon(leaves);
    case 'flipkart':
      return locateFlipkart(leaves);
    case 'meesho':
      return locateMeesho(leaves);
  }
}

/**
 * Quarter turn that makes a crop fill the label better: a wide crop on a tall label (or the
 * other way round) is turned. Near-square shapes are left alone.
 */
export function bestRotation(
  region: NormRect,
  pageSizePt: { w: number; h: number },
  label: { widthMm: number; heightMm: number },
): 0 | 90 {
  const regionAspect = (region.w * pageSizePt.w) / Math.max(1e-6, region.h * pageSizePt.h);
  const labelAspect = label.widthMm / Math.max(1e-6, label.heightMm);
  const wide = (a: number) => (a > 1.15 ? 1 : a < 0.87 ? -1 : 0);
  return wide(regionAspect) * wide(labelAspect) < 0 ? 90 : 0;
}
