import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import catalog from '@/lib/shop/catalog.json';
import flagsFile from '@/lib/shop/catalog-flags.json';
import { parseProductName } from '@/lib/shop/parse-product';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof import('xlsx');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const LABELS_SOURCE = path.join(ROOT, 'scripts/shop/pro-list.xlsx');
const PRINTERS_SOURCE = path.join(ROOT, 'scripts/shop/seznik-printers.xlsx');

function slugId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\+/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sheetRows() {
  const wb = XLSX.readFile(LABELS_SOURCE, { raw: false, defval: null });
  return XLSX.utils.sheet_to_json<Record<string, string | null>>(wb.Sheets['Roll Products'], {
    defval: null,
    raw: false,
  });
}

function printerRows() {
  const wb = XLSX.readFile(PRINTERS_SOURCE, { raw: false, defval: null });
  return XLSX.utils.sheet_to_json<Record<string, string | null>>(wb.Sheets['Printer Catalogue'], {
    defval: null,
    raw: false,
  });
}

test('imports 44 unique products from Roll Products with original fields', () => {
  const rows = sheetRows();
  assert.equal(rows.length, 44);
  assert.equal(catalog.labels.length, 44);

  const byId = new Map(catalog.labels.map((product) => [product.id, product]));
  for (const row of rows) {
    const id = String(row['Product ID'] ?? '').trim();
    const product = byId.get(id);
    assert.ok(product, `missing catalog row for ${id}`);
    assert.equal(product.name, String(row['Product Name'] ?? '').trim());
    assert.equal(product.imageUrl, String(row['Product Image Link'] ?? '').trim());
    assert.equal(product.amazonUrl, String(row['Amazon Link (as in source)'] ?? '').trim());
    assert.equal(product.type, String(row['Type'] ?? '').trim());
    assert.equal(product.imageSource, String(row['Image Source'] ?? '').trim());
    assert.equal(product.category, 'labels');
  }
});

test('imports 18 printers from Printer Catalogue with original Amazon and store URLs', () => {
  const rows = printerRows();
  assert.equal(rows.length, 18);
  assert.equal(catalog.printers.length, 18);

  const byId = new Map(catalog.printers.map((product) => [product.id, product]));
  for (const row of rows) {
    const name = String(row['Printer Name'] ?? '').trim();
    const id = slugId(name);
    const product = byId.get(id);
    assert.ok(product, `missing printer catalog row for ${name}`);
    assert.equal(product.name, name);
    assert.equal(product.imageUrl, String(row['Image URL'] ?? '').trim());
    assert.equal(product.amazonUrl, String(row['Amazon Link'] ?? '').trim());
    assert.equal(product.amazonUrl.includes('amazon.com/s?'), false);
    assert.equal(product.type, String(row['Category'] ?? '').trim());
    assert.equal(product.category, 'printers');
    const storeUrl = String(row['Store Product URL'] ?? '').trim();
    if (storeUrl) {
      assert.equal(product.storeUrl, storeUrl);
    } else {
      assert.equal(product.storeUrl, undefined);
    }
  }

  const josh = byId.get('josh');
  const labelX = byId.get('label-x');
  const proHd = byId.get('pro-hd');
  assert.equal(josh?.amazonUrl, 'https://www.amazon.in/dp/B0CVF9YPPD');
  assert.equal(josh?.storeUrl, 'https://www.seznik.in/products/seznik-josh-label-printer');
  assert.equal(
    labelX?.amazonUrl,
    'https://www.amazon.in/SEZNIK-Shipping-Printer-Bluetooth-Printing/dp/B0GZG4R46S',
  );
  assert.equal(proHd?.name, 'Pro+HD');
  assert.equal(proHd?.amazonUrl, 'https://amzn.in/d/0c3BqZ0H');
  assert.equal(proHd?.storeUrl, undefined);
});

test('derived size and quantity match the parser and do not rewrite names', () => {
  for (const product of catalog.labels) {
    const parsed = parseProductName(product.name);
    assert.equal(product.sizeLabel, parsed.sizeLabel);
    assert.equal(product.quantityLabel, parsed.quantityLabel);
    assert.equal(product.detailLabel, parsed.detailLabel);
    assert.equal(product.name.includes('amazon.com/s?'), false);
  }
});

test('flags file matches catalog flags and calls out known source issues', () => {
  assert.equal(flagsFile.flags.length, catalog.flags.length);
  const kinds = (kind: string) => catalog.flags.filter((flag) => flag.kind === kind).map((f) => f.id);

  const unusual = kinds('unusual_domain');
  assert.deepEqual(
    [...unusual].sort(),
    [
      'blue-50x15-250',
      'blue-50x25-250',
      'green-50x50-150',
      'pink-50x50-250',
      'red-50x15-250',
      'red-50x25-250',
      'yellow-50x25-250',
    ].sort(),
  );

  assert.ok(kinds('placeholder_id').includes('new-waterproof-amazon-product'));
  assert.ok(kinds('duplicate_amazon_url').includes('magic-sticky-3rolls'));
  assert.ok(kinds('duplicate_amazon_url').includes('translucent-sticky-3rolls'));
  assert.ok(kinds('duplicate_amazon_url').includes('neo'));
  assert.ok(kinds('duplicate_amazon_url').includes('nova'));
  assert.ok(kinds('short_link').includes('standard'));
  assert.ok(kinds('short_link').includes('pro-hd'));
  assert.ok(kinds('type_name_mismatch').includes('silver-50x30-1250'));
});
