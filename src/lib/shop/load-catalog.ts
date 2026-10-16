import bundled from '@/lib/shop/catalog.json';
import type { ShopCatalog, ShopProduct } from '@/lib/shop/types';

/**
 * Public HTTPS JSON URL for a future remote catalogue. Null means the app
 * uses the bundled snapshot only — products do not update automatically.
 */
export const SHOP_CATALOG_URL: string | null = null;

function isProduct(value: unknown): value is ShopProduct {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.imageUrl === 'string' &&
    typeof row.amazonUrl === 'string' &&
    typeof row.type === 'string' &&
    (row.category === 'labels' || row.category === 'printers')
  );
}

function isCatalog(value: unknown): value is ShopCatalog {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    Array.isArray(row.labels) &&
    row.labels.every(isProduct) &&
    Array.isArray(row.printers) &&
    row.printers.every(isProduct) &&
    Array.isArray(row.flags)
  );
}

export function getBundledShopCatalog(): ShopCatalog {
  const data = bundled as ShopCatalog;
  return {
    generatedAt: data.generatedAt,
    source: data.source,
    labels: data.labels,
    printers: data.printers ?? [],
    flags: data.flags ?? [],
  };
}

/**
 * Load the shop catalogue. Remote fetch runs only when SHOP_CATALOG_URL is set;
 * a failed fetch falls back to the bundled JSON.
 */
export async function loadShopCatalog(): Promise<ShopCatalog> {
  const bundledCatalog = getBundledShopCatalog();
  if (!SHOP_CATALOG_URL) return bundledCatalog;
  try {
    const response = await fetch(SHOP_CATALOG_URL);
    if (!response.ok) return bundledCatalog;
    const json: unknown = await response.json();
    if (!isCatalog(json) || json.labels.length === 0) return bundledCatalog;
    return json;
  } catch {
    return bundledCatalog;
  }
}
