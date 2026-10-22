import { useState } from 'react';
import { Alert } from 'react-native';

import { openProductUrl } from '@/lib/shop/amazon-url';
import type { ShopProduct } from '@/lib/shop/types';
import { trackProductClick } from '@/lib/telemetry/events';

function hasStoreUrl(product: ShopProduct): boolean {
  const store = product.storeUrl?.trim() ?? '';
  if (!store) return false;
  try {
    const parsed = new URL(store);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Where a product can be bought, and a buy action that records the tap for the admin desk. */
export function useBuy() {
  const [opening, setOpening] = useState<string | null>(null);

  const storeFor = (product: ShopProduct) =>
    product.linkAudit.openable ? 'Amazon' : hasStoreUrl(product) ? 'Seznik' : null;

  async function buy(product: ShopProduct) {
    if (opening) return;
    setOpening(product.id);
    trackProductClick(product.id, product.name, product.category);
    try {
      const result = await openProductUrl(product);
      if (!result.ok) Alert.alert('Link unavailable', 'This product page could not be opened. Try again later.');
    } finally {
      setOpening(null);
    }
  }

  return { buy, opening, storeFor };
}
