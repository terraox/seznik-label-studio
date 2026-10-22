import { productSizeKey } from '@/lib/shop/filter-catalog';
import type { ShopProduct } from '@/lib/shop/types';

/**
 * The catalogue lists every colour and pack of a roll as its own product. A shopper thinks in
 * "a 50 × 25 mm waterproof roll", then picks colour and quantity, so rolls are grouped that way.
 */

export const ROLL_COLOURS = {
  white: { label: 'White', hex: '#FFFFFF' }, // theme-fixed: real roll colours (product data)
  yellow: { label: 'Yellow', hex: '#FACC15' }, // theme-fixed: real roll colours (product data)
  red: { label: 'Red', hex: '#EF4444' }, // theme-fixed: real roll colours (product data)
  blue: { label: 'Blue', hex: '#3B82F6' }, // theme-fixed: real roll colours (product data)
  green: { label: 'Green', hex: '#22C55E' }, // theme-fixed: real roll colours (product data)
  pink: { label: 'Pink', hex: '#EC4899' }, // theme-fixed: real roll colours (product data)
} as const;
export type RollColour = keyof typeof ROLL_COLOURS;

export function rollColour(product: ShopProduct): RollColour {
  const head = product.id.split('-')[0] as RollColour;
  return head in ROLL_COLOURS ? head : 'white';
}

export type UseCaseId = 'shipping' | 'price' | 'stickers' | 'jewellery' | 'paper';

export const USE_CASES: { id: UseCaseId; title: string; note: string }[] = [
  { id: 'shipping', title: 'Shipping', note: '4 × 6 in courier labels' },
  { id: 'price', title: 'Price and barcode', note: 'MRP, SKU and barcode tags' },
  { id: 'stickers', title: 'Stickers', note: 'Square and round labels' },
  { id: 'jewellery', title: 'Jewellery and cable', note: 'Tags with a tail' },
  { id: 'paper', title: 'Paper rolls', note: 'Sticky and plain continuous' },
];

export type RollGroup = {
  key: string;
  /** "50 × 25 mm", "50 mm round" or the product name for rolls without a fixed size. */
  title: string;
  type: string;
  widthMm: number | null;
  heightMm: number | null;
  round: boolean;
  useCase: UseCaseId;
  sizeKey: string;
  variants: ShopProduct[];
  colours: RollColour[];
  /** Labels per roll on offer, smallest first. */
  quantities: number[];
  /** First variant, used for the card photo. */
  cover: ShopProduct;
};

function diameterMm(product: ShopProduct): number | null {
  const m = product.sizeLabel?.match(/^([\d.]+)\s*Diameter$/i);
  return m ? Number(m[1]) : null;
}

/** Name for a roll that has no fixed label size, without the pack count and type suffixes. */
function plainName(name: string): string {
  return (
    name
      .replace(/\s*-\s*\([^)]*\)\s*/g, ' ')
      .replace(/\s*-\s*(Normal|Waterproof|Special|Sticky)\s*$/i, '')
      .replace(/\s*-\s*\d+\s*Rolls?\s*$/i, '')
      .replace(/[-]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() || name
  );
}

export function useCaseOf(product: ShopProduct): UseCaseId {
  const w = product.widthMm;
  const h = product.heightMm;
  if (/jewel|cable/i.test(product.name)) return 'jewellery';
  if (w != null && h != null) {
    if (w >= 75 && h >= 100) return 'shipping';
    if (w === h || h >= 50) return 'stickers';
    return 'price';
  }
  if (diameterMm(product) != null) return 'stickers';
  return 'paper';
}

export function groupRolls(products: ShopProduct[]): RollGroup[] {
  const groups = new Map<string, RollGroup>();
  for (const product of products) {
    const sized = product.widthMm != null && product.heightMm != null;
    const diameter = diameterMm(product);
    const sizeKey = productSizeKey(product);
    // Rolls without a size are each their own product (sticky paper, bundles, ...).
    const key = sized || diameter != null ? `${sizeKey}|${product.type}` : product.id;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: sized
          ? `${product.widthMm} × ${product.heightMm} mm`
          : diameter != null
            ? `${diameter} mm round`
            : plainName(product.name),
        type: product.type,
        widthMm: sized ? product.widthMm : diameter,
        heightMm: sized ? product.heightMm : diameter,
        round: diameter != null,
        useCase: useCaseOf(product),
        sizeKey,
        variants: [],
        colours: [],
        quantities: [],
        cover: product,
      };
      groups.set(key, group);
    }
    group.variants.push(product);
    const colour = rollColour(product);
    if (!group.colours.includes(colour)) group.colours.push(colour);
    if (product.quantity != null && !group.quantities.includes(product.quantity)) group.quantities.push(product.quantity);
  }
  const list = [...groups.values()];
  for (const g of list) {
    g.quantities.sort((a, b) => a - b);
    g.colours.sort((a, b) => Object.keys(ROLL_COLOURS).indexOf(a) - Object.keys(ROLL_COLOURS).indexOf(b));
    g.cover = g.variants.find((v) => rollColour(v) === 'white') ?? g.variants[0];
  }
  // Sized rolls first, smallest label area first, then the rest by name.
  return list.sort((a, b) => {
    const aa = a.widthMm != null && a.heightMm != null ? a.widthMm * a.heightMm : Infinity;
    const bb = b.widthMm != null && b.heightMm != null ? b.widthMm * b.heightMm : Infinity;
    return aa !== bb ? aa - bb : a.title.localeCompare(b.title);
  });
}

/** The variant for a colour and quantity, falling back to the nearest one on offer. */
export function pickVariant(group: RollGroup, colour: RollColour, quantity: number | null): ShopProduct {
  const ofColour = group.variants.filter((v) => rollColour(v) === colour);
  const pool = ofColour.length ? ofColour : group.variants;
  return pool.find((v) => v.quantity === quantity) ?? pool[0];
}

/** "100–250 labels", "1,200 labels" or "3 rolls" for packs without a per-roll count. */
export function quantitySummary(group: RollGroup): string {
  const q = group.quantities;
  const unit = /rolls?\b/i.test(group.cover.name) && !/labels\/roll/i.test(group.cover.name) ? 'rolls' : 'labels';
  if (q.length === 0) return '';
  const fmt = (n: number) => n.toLocaleString('en-IN');
  return q.length === 1 ? `${fmt(q[0])} ${unit}` : `${fmt(q[0])}–${fmt(q[q.length - 1])} ${unit}`;
}

/** Size keys of the labels this person designs, matched against the catalogue's sizes. */
export function sizeKeyFor(widthMm: number, heightMm: number): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  return `${r(widthMm)}x${r(heightMm)}mm`;
}
