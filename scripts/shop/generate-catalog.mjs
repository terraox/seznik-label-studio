/**
 * Read scripts/shop/pro-list.xlsx (Roll Products) and
 * scripts/shop/seznik-printers.xlsx (Printer Catalogue) and write
 * src/lib/shop/catalog.json + catalog-flags.json.
 *
 * Does not rewrite Amazon, store, or image URLs. Derived size/qty is display-only.
 *
 * Usage: node scripts/shop/generate-catalog.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LABELS_SOURCE = path.join(__dirname, 'pro-list.xlsx');
const PRINTERS_SOURCE = path.join(__dirname, 'seznik-printers.xlsx');
const OUT_DIR = path.join(ROOT, 'src/lib/shop');

const RECT_SIZE = /(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*mm/i;
const DIAMETER = /(\d+(?:\.\d+)?)\s*Diameter/i;
const LABELS_PER_ROLL = /\((\d+)\s*Labels?\/Roll\)/i;
const LABELS_ONLY = /\((\d+)\s*Labels?\)/i;
const ROLLS_PAREN = /\((\d+)\s*Rolls?\)/i;
const ROLLS_BARE = /(\d+)\s*Rolls?/i;

const AMAZON_RETAIL_HOST =
  /^(?:www\.)?amazon\.(in|com|co\.uk|de|fr|it|es|co\.jp|ca|com\.au|com\.mx|com\.br|nl|se|pl|sg|ae|sa|eg)$/i;
const AMAZON_SHORT_HOST = /^(?:www\.)?(amzn\.in|amzn\.to|a\.co)$/i;
const UNUSUAL_AMAZON_HOST = /^(?:www\.)?link\.amazon$/i;
const ASIN_PATH = /\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})(?:[/?]|$)/i;

function parseProductName(name) {
  const text = String(name ?? '').trim();
  const rect = text.match(RECT_SIZE);
  const diameter = !rect ? text.match(DIAMETER) : null;
  let sizeLabel = null;
  let widthMm = null;
  let heightMm = null;
  if (rect) {
    widthMm = Number(rect[1]);
    heightMm = Number(rect[2]);
    sizeLabel = `${rect[1]}x${rect[2]}mm`;
  } else if (diameter) {
    sizeLabel = `${diameter[1]} Diameter`;
  }

  const perRoll = text.match(LABELS_PER_ROLL);
  const labelsOnly = !perRoll ? text.match(LABELS_ONLY) : null;
  const rollsParen = text.match(ROLLS_PAREN);
  const rollsBare = !perRoll && !labelsOnly && !rollsParen ? text.match(ROLLS_BARE) : null;

  let quantity = null;
  let quantityLabel = null;
  if (perRoll) {
    quantity = Number(perRoll[1]);
    quantityLabel = `${perRoll[1]} Labels/Roll`;
  } else if (labelsOnly) {
    quantity = Number(labelsOnly[1]);
    quantityLabel = `${labelsOnly[1]} Labels`;
  } else if (rollsParen) {
    quantity = Number(rollsParen[1]);
    quantityLabel = `${rollsParen[1]} Rolls`;
  } else if (rollsBare) {
    quantity = Number(rollsBare[1]);
    quantityLabel = `${rollsBare[1]} Rolls`;
  }

  const parts = [sizeLabel, quantityLabel].filter(Boolean);
  return {
    sizeLabel,
    quantityLabel,
    widthMm,
    heightMm,
    quantity,
    detailLabel: parts.length > 0 ? parts.join(' · ') : text,
  };
}

function classifyAmazonUrl(raw) {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) {
    return { url, kind: 'invalid', host: null, asin: null, flags: ['missing'], openable: false };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { url, kind: 'invalid', host: null, asin: null, flags: ['invalid_url'], openable: false };
  }
  const host = parsed.hostname.toLowerCase();
  const flags = [];
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') flags.push('bad_protocol');
  const asinMatch = (parsed.pathname + parsed.search).match(ASIN_PATH);
  const asin = asinMatch ? asinMatch[1] : null;
  const looksLikeSearch = /[?&]k=/.test(parsed.search) || /\/s(\/|$)/.test(parsed.pathname);
  if (looksLikeSearch) flags.push('search_page');

  let kind;
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

function typeNameMismatch(type, name) {
  const tokens = String(type)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const n = String(name);
  return tokens.includes('Special') && /waterproof/i.test(n) && !/special/i.test(n);
}

function cell(row, key) {
  const value = row[key];
  if (value == null) return '';
  return String(value).trim();
}

function slugId(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\+/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pushLinkFlags(flags, product) {
  const { id, name, amazonUrl, linkAudit } = product;
  if (linkAudit.kind === 'unusual_domain') {
    flags.push({ id, name, kind: 'unusual_domain', detail: linkAudit.host ?? undefined });
  }
  if (linkAudit.kind === 'short_link') {
    flags.push({ id, name, kind: 'short_link', detail: linkAudit.host ?? undefined });
  }
  if (linkAudit.kind === 'invalid') {
    flags.push({ id, name, kind: 'invalid_amazon_url', detail: amazonUrl || 'missing' });
  }
}

const labelsWb = XLSX.readFile(LABELS_SOURCE, { raw: false, defval: null });
if (!labelsWb.SheetNames.includes('Roll Products')) {
  throw new Error(`Missing "Roll Products" sheet. Found: ${labelsWb.SheetNames.join(', ')}`);
}
const labelRows = XLSX.utils.sheet_to_json(labelsWb.Sheets['Roll Products'], {
  defval: null,
  raw: false,
});

const printersWb = XLSX.readFile(PRINTERS_SOURCE, { raw: false, defval: null });
if (!printersWb.SheetNames.includes('Printer Catalogue')) {
  throw new Error(`Missing "Printer Catalogue" sheet. Found: ${printersWb.SheetNames.join(', ')}`);
}
const printerRows = XLSX.utils.sheet_to_json(printersWb.Sheets['Printer Catalogue'], {
  defval: null,
  raw: false,
});

const labels = [];
const printers = [];
const flags = [];
const amazonCounts = new Map();
const printerIds = new Set();

for (const row of labelRows) {
  const id = cell(row, 'Product ID');
  const name = cell(row, 'Product Name');
  const imageUrl = cell(row, 'Product Image Link');
  const amazonUrl = cell(row, 'Amazon Link (as in source)');
  const type = cell(row, 'Type');
  const imageSource = cell(row, 'Image Source');
  const parsed = parseProductName(name);
  const linkAudit = classifyAmazonUrl(amazonUrl);
  amazonCounts.set(amazonUrl, (amazonCounts.get(amazonUrl) ?? 0) + 1);

  const product = {
    id,
    name,
    imageUrl,
    amazonUrl,
    type,
    imageSource,
    category: 'labels',
    sizeLabel: parsed.sizeLabel,
    quantityLabel: parsed.quantityLabel,
    widthMm: parsed.widthMm,
    heightMm: parsed.heightMm,
    quantity: parsed.quantity,
    detailLabel: parsed.detailLabel,
    linkAudit: {
      kind: linkAudit.kind,
      host: linkAudit.host,
      asin: linkAudit.asin,
      flags: linkAudit.flags,
      openable: linkAudit.openable,
    },
  };
  labels.push(product);

  if (id === 'new-waterproof-amazon-product') {
    flags.push({ id, name, kind: 'placeholder_id', detail: id });
  }
  pushLinkFlags(flags, product);
  if (typeNameMismatch(type, name)) {
    flags.push({ id, name, kind: 'type_name_mismatch', detail: `Type=${type}` });
  }
}

for (const row of printerRows) {
  const name = cell(row, 'Printer Name');
  const id = slugId(name);
  if (!id) {
    throw new Error(`Printer row is missing a name: ${JSON.stringify(row)}`);
  }
  if (printerIds.has(id)) {
    throw new Error(`Duplicate printer slug "${id}" from name "${name}"`);
  }
  printerIds.add(id);

  const imageUrl = cell(row, 'Image URL');
  const amazonUrl = cell(row, 'Amazon Link');
  const storeUrl = cell(row, 'Store Product URL');
  const type = cell(row, 'Category');
  const linkAudit = classifyAmazonUrl(amazonUrl);
  amazonCounts.set(amazonUrl, (amazonCounts.get(amazonUrl) ?? 0) + 1);

  const product = {
    id,
    name,
    imageUrl,
    amazonUrl,
    ...(storeUrl ? { storeUrl } : {}),
    type,
    imageSource: '',
    category: 'printers',
    sizeLabel: null,
    quantityLabel: null,
    widthMm: null,
    heightMm: null,
    quantity: null,
    detailLabel: name,
    linkAudit: {
      kind: linkAudit.kind,
      host: linkAudit.host,
      asin: linkAudit.asin,
      flags: linkAudit.flags,
      openable: linkAudit.openable,
    },
  };
  printers.push(product);
  pushLinkFlags(flags, product);
}

for (const product of [...labels, ...printers]) {
  if (product.amazonUrl && (amazonCounts.get(product.amazonUrl) ?? 0) > 1) {
    flags.push({
      id: product.id,
      name: product.name,
      kind: 'duplicate_amazon_url',
      detail: product.amazonUrl,
    });
  }
}

const catalog = {
  generatedAt: new Date().toISOString(),
  source:
    'scripts/shop/pro-list.xlsx#Roll Products + scripts/shop/seznik-printers.xlsx#Printer Catalogue',
  labels,
  printers,
  flags,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(
  path.join(OUT_DIR, 'catalog-flags.json'),
  `${JSON.stringify({ source: catalog.source, flags }, null, 2)}\n`,
);

const unusual = flags.filter((f) => f.kind === 'unusual_domain').length;
const short = flags.filter((f) => f.kind === 'short_link').length;
const dup = flags.filter((f) => f.kind === 'duplicate_amazon_url').length;
console.log(
  `Wrote ${labels.length} labels, ${printers.length} printers, ${flags.length} flags (unusual=${unusual} short=${short} duplicate_url=${dup})`,
);
