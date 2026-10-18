import type { AdminProductRedirect, RedirectClickEvent } from '../types/redirect';
import { SEZNIK_WEBSITE_PRODUCTS } from '../data/seznikWebsiteProducts';

const ADMIN_REDIRECTS_STORAGE_KEY = 'seznik_admin_redirects_telemetry_v2';
const SEZNIK_STORE_ORIGIN = 'https://seznik.in';

export const getInitialAdminRedirects = (): AdminProductRedirect[] => {
  const now = new Date();

  return SEZNIK_WEBSITE_PRODUCTS.map((p) => {
    return {
      id: `red_adm_${p.id}`,
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      sellingPrice: p.sellingPrice,
      categoryName: p.categoryName,
      targetUrl: p.productUrl,
      clicks: [],
      totalRedirects: 0,
      status: 'active',
      createdAt: new Date(now.getTime() - 40 * 24 * 3600 * 1000).toISOString(),
    };
  });
};

export const fetchAdminRedirects = (): AdminProductRedirect[] => {
  if (typeof localStorage === 'undefined') return getInitialAdminRedirects();

  const raw = localStorage.getItem(ADMIN_REDIRECTS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // fallback
    }
  }

  const initial = getInitialAdminRedirects();
  localStorage.setItem(ADMIN_REDIRECTS_STORAGE_KEY, JSON.stringify(initial));
  return initial;
};

export const saveAdminRedirects = (data: AdminProductRedirect[]): void => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ADMIN_REDIRECTS_STORAGE_KEY, JSON.stringify(data));
  }
};

export const simulateAdminRedirectClick = (
  redirectId: string,
  source: string = 'Direct Website'
): AdminProductRedirect[] => {
  const redirects = fetchAdminRedirects();
  const now = new Date().toISOString();

  const updated = redirects.map((r) => {
    if (r.id === redirectId) {
      const newClick: RedirectClickEvent = {
        id: `clk_sim_${Date.now()}`,
        timestamp: now,
        source,
        device: 'Desktop',
      };
      const clicks = [newClick, ...r.clicks];
      return {
        ...r,
        clicks,
        totalRedirects: clicks.length,
        lastRedirectAt: now,
      };
    }
    return r;
  });

  saveAdminRedirects(updated);
  return updated;
};

export const updateAdminRedirectUrl = (
  redirectId: string,
  targetUrl: string
): AdminProductRedirect[] => {
  const redirects = fetchAdminRedirects();
  const updated = redirects.map((r) => (r.id === redirectId ? { ...r, targetUrl } : r));
  saveAdminRedirects(updated);
  return updated;
};

export const toggleAdminRedirectStatus = (redirectId: string): AdminProductRedirect[] => {
  const redirects = fetchAdminRedirects();
  const updated = redirects.map((r) => {
    if (r.id === redirectId) {
      const status: 'active' | 'paused' = r.status === 'active' ? 'paused' : 'active';
      return { ...r, status };
    }
    return r;
  });
  saveAdminRedirects(updated);
  return updated;
};

export const addAdminProductRedirect = (
  productName: string,
  sku: string,
  price: number,
  category: string,
  customUrl?: string
): AdminProductRedirect[] => {
  const redirects = fetchAdminRedirects();
  const newRedirect: AdminProductRedirect = {
    id: `red_adm_custom_${Date.now()}`,
    productId: `prod_custom_${Date.now()}`,
    productName,
    productSku: sku,
    sellingPrice: price,
    categoryName: category,
    targetUrl: customUrl || `${SEZNIK_STORE_ORIGIN}/products/${sku.toLowerCase()}`,
    clicks: [],
    totalRedirects: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  const updated = [newRedirect, ...redirects];
  saveAdminRedirects(updated);
  return updated;
};
