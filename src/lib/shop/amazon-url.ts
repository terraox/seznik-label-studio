import type { AmazonLinkKind, ShopLinkAudit } from '@/lib/shop/types';

const AMAZON_RETAIL_HOST =
  /^(?:www\.)?amazon\.(in|com|co\.uk|de|fr|it|es|co\.jp|ca|com\.au|com\.mx|com\.br|nl|se|pl|sg|ae|sa|eg)$/i;
const AMAZON_SHORT_HOST = /^(?:www\.)?(amzn\.in|amzn\.to|a\.co)$/i;
const UNUSUAL_AMAZON_HOST = /^(?:www\.)?link\.amazon$/i;
const ASIN_PATH = /\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})(?:[/?]|$)/i;

export type ClassifiedAmazonUrl = ShopLinkAudit & {
  url: string;
};

/**
 * Classify a source Amazon URL. The returned `url` is the original string
 * (trimmed). This never rewrites a product link to an Amazon search page.
 */
export function classifyAmazonUrl(raw: string | null | undefined): ClassifiedAmazonUrl {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) {
    return {
      url,
      kind: 'invalid',
      host: null,
      asin: null,
      flags: ['missing'],
      openable: false,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      url,
      kind: 'invalid',
      host: null,
      asin: null,
      flags: ['invalid_url'],
      openable: false,
    };
  }

  const host = parsed.hostname.toLowerCase();
  const flags: string[] = [];
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    flags.push('bad_protocol');
  }

  const asinMatch = (parsed.pathname + parsed.search).match(ASIN_PATH);
  const asin = asinMatch ? asinMatch[1] : null;
  const looksLikeSearch = /[?&]k=/.test(parsed.search) || /\/s(\/|$)/.test(parsed.pathname);
  if (looksLikeSearch) flags.push('search_page');

  let kind: AmazonLinkKind;
  if (flags.includes('bad_protocol')) {
    kind = 'invalid';
  } else if (UNUSUAL_AMAZON_HOST.test(host)) {
    kind = 'unusual_domain';
    flags.push('unusual_amazon_host');
    if (!asin) flags.push('no_asin_dp');
  } else if (AMAZON_SHORT_HOST.test(host)) {
    kind = 'short_link';
    flags.push('short_link');
    if (!asin) flags.push('no_asin_dp');
  } else if (AMAZON_RETAIL_HOST.test(host)) {
    kind = asin ? 'product' : 'short_link';
    if (!asin) flags.push('no_asin_dp');
  } else {
    kind = 'invalid';
    flags.push(`non_amazon_host:${host}`);
  }

  const openable = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && kind !== 'invalid';
  return { url, kind, host, asin, flags, openable };
}

export type OpenUrlFn = (url: string) => Promise<boolean>;

/**
 * Open the exact source URL. Never substitutes a generic Amazon search page.
 */
export async function openAmazonUrl(
  raw: string,
  openUrl?: OpenUrlFn,
): Promise<{ ok: boolean; openedUrl: string | null; reason?: string }> {
  const classified = classifyAmazonUrl(raw);
  if (!classified.openable) {
    return { ok: false, openedUrl: null, reason: classified.flags[0] ?? 'invalid' };
  }
  const openedUrl = classified.url;
  try {
    if (openUrl) {
      const ok = await openUrl(openedUrl);
      return { ok, openedUrl, reason: ok ? undefined : 'open_failed' };
    }
    const { Linking } = await import('react-native');
    const opened = await Linking.openURL(openedUrl);
    if (opened === false) {
      return { ok: false, openedUrl, reason: 'open_failed' };
    }
    return { ok: true, openedUrl };
  } catch {
    return { ok: false, openedUrl, reason: 'open_failed' };
  }
}
