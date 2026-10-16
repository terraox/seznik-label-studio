import { typeTokens } from '@/lib/shop/parse-product';
import type { ShopCategory, ShopProduct } from '@/lib/shop/types';

export const OTHER_SIZE = 'other';

export type ShopFilterState = {
  category: ShopCategory;
  query: string;
  type: string | null;
  size: string | null;
};

export function productSizeKey(product: ShopProduct): string {
  if (product.widthMm != null && product.heightMm != null) {
    return `${product.widthMm}x${product.heightMm}mm`;
  }
  if (product.sizeLabel) return product.sizeLabel;
  return OTHER_SIZE;
}

export function formatSizeKey(key: string): string {
  if (key === OTHER_SIZE) return 'Specialty';
  const rect = key.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm$/i);
  if (rect) return `${rect[1]} × ${rect[2]} mm`;
  const diameter = key.match(/^([\d.]+)\s*Diameter$/i);
  if (diameter) return `${diameter[1]} mm diameter`;
  return key;
}

export function productDisplayTitle(product: ShopProduct): string {
  if (product.widthMm != null && product.heightMm != null) {
    return `${product.widthMm} × ${product.heightMm} mm`;
  }
  const key = productSizeKey(product);
  if (key === OTHER_SIZE) return specialtyTitle(product.name);
  return formatSizeKey(key);
}

function specialtyTitle(name: string): string {
  const trimmed = name
    .replace(/\s*-\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*-\s*(Normal|Waterproof|Special|Sticky)(, [\w ]+)*\s*$/i, '')
    .replace(/\s*-\s*\d+\s*Rolls?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return trimmed || name;
}

export type ShopProductGroup = {
  key: string;
  title: string;
  products: ShopProduct[];
};

export function compareShopProducts(a: ShopProduct, b: ShopProduct): number {
  const aRect = a.widthMm != null && a.heightMm != null;
  const bRect = b.widthMm != null && b.heightMm != null;
  if (aRect !== bRect) return aRect ? -1 : 1;
  if (aRect && bRect) {
    if (a.widthMm !== b.widthMm) return (a.widthMm ?? 0) - (b.widthMm ?? 0);
    if (a.heightMm !== b.heightMm) return (a.heightMm ?? 0) - (b.heightMm ?? 0);
  } else {
    const sizeCmp = productSizeKey(a).localeCompare(productSizeKey(b), undefined, { numeric: true });
    if (sizeCmp !== 0) return sizeCmp;
  }
  const typeCmp = a.type.localeCompare(b.type);
  if (typeCmp !== 0) return typeCmp;
  if ((a.quantity ?? 0) !== (b.quantity ?? 0)) return (a.quantity ?? 0) - (b.quantity ?? 0);
  return a.name.localeCompare(b.name);
}

export function groupShopProducts(products: ShopProduct[]): ShopProductGroup[] {
  const groups: ShopProductGroup[] = [];
  const index = new Map<string, ShopProductGroup>();
  for (const product of [...products].sort(compareShopProducts)) {
    const key = productSizeKey(product);
    let group = index.get(key);
    if (!group) {
      group = { key, title: formatSizeKey(key), products: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.products.push(product);
  }
  return groups;
}

export function uniqueTypes(products: ShopProduct[]): string[] {
  const set = new Set<string>();
  for (const product of products) {
    for (const token of typeTokens(product.type)) set.add(token);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function uniqueSizes(products: ShopProduct[]): string[] {
  const set = new Set<string>();
  let hasOther = false;
  for (const product of products) {
    const key = productSizeKey(product);
    if (key === OTHER_SIZE) hasOther = true;
    else set.add(key);
  }
  const sizes = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (hasOther) sizes.push(OTHER_SIZE);
  return sizes;
}

function matchesQuery(product: ShopProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    product.name,
    product.type,
    product.id,
    product.sizeLabel ?? '',
    product.quantityLabel ?? '',
    product.detailLabel,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesType(product: ShopProduct, type: string | null): boolean {
  if (!type) return true;
  return typeTokens(product.type).includes(type);
}

function matchesSize(product: ShopProduct, size: string | null): boolean {
  if (!size) return true;
  return productSizeKey(product) === size;
}

export function filterShopProducts(
  products: ShopProduct[],
  filters: ShopFilterState,
): ShopProduct[] {
  return products
    .filter(
      (product) =>
        product.category === filters.category &&
        matchesQuery(product, filters.query) &&
        matchesType(product, filters.type) &&
        matchesSize(product, filters.size),
    )
    .sort(compareShopProducts);
}
