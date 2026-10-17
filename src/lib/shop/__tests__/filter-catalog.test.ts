import assert from 'node:assert/strict';
import test from 'node:test';

import catalog from '@/lib/shop/catalog.json';
import {
  filterShopProducts,
  formatSizeKey,
  groupPrintersByCategory,
  OTHER_SIZE,
  productDisplayTitle,
  uniqueSizes,
  uniqueTypes,
} from '@/lib/shop/filter-catalog';

test('type Waterproof filter keeps waterproof rows including comma types', () => {
  const rows = filterShopProducts(catalog.labels, {
    category: 'labels',
    query: '',
    type: 'Waterproof',
    size: null,
  });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.type.includes('Waterproof')));
});

test('size 50x25mm filter matches parsed rectangles only', () => {
  const rows = filterShopProducts(catalog.labels, {
    category: 'labels',
    query: '',
    type: null,
    size: '50x25mm',
  });
  assert.ok(rows.length >= 5);
  assert.ok(rows.every((row) => row.widthMm === 50 && row.heightMm === 25));
});

test('search jewellery finds the jewellery roll', () => {
  const rows = filterShopProducts(catalog.labels, {
    category: 'labels',
    query: 'jewellery',
    type: null,
    size: null,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, 'jewellery-750');
});

test('Other size includes specialty packs without a parsed size', () => {
  const rows = filterShopProducts(catalog.labels, {
    category: 'labels',
    query: '',
    type: null,
    size: OTHER_SIZE,
  });
  assert.ok(rows.some((row) => row.id === 'jewellery-750'));
  assert.ok(!rows.some((row) => row.id === '50-diameter-500'));
  assert.ok(uniqueSizes(catalog.labels).includes(OTHER_SIZE));
  assert.ok(uniqueSizes(catalog.labels).includes('50 Diameter'));
  assert.ok(uniqueTypes(catalog.labels).includes('Sticky'));
});

test('labels stay size-sorted as a single 2-up grid, not tiny per-size sections', () => {
  const rows = filterShopProducts(catalog.labels, {
    category: 'labels',
    query: '',
    type: null,
    size: null,
  });
  const i25 = rows.findIndex((row) => row.widthMm === 25 && row.heightMm === 15);
  const i100 = rows.findIndex((row) => row.widthMm === 100 && row.heightMm === 150);
  const iJewel = rows.findIndex((row) => row.id === 'jewellery-750');
  assert.equal(i25, 0);
  assert.ok(i100 > i25);
  assert.ok(iJewel > i100);
  assert.ok(rows.length >= 4);
  const firstKeys = new Set(
    rows.slice(0, 4).map((row) => `${row.widthMm ?? ''}x${row.heightMm ?? ''}`),
  );
  assert.ok(firstKeys.size >= 2);
  assert.equal(formatSizeKey('100x150mm'), '100 × 150 mm');
});

test('display titles prefer formatted size and strip specialty tails', () => {
  const rect = catalog.labels.find((row) => row.id === '100x150mm-1200');
  const jewel = catalog.labels.find((row) => row.id === 'jewellery-750');
  const diameter = catalog.labels.find((row) => row.id === '50-diameter-500');
  assert.equal(productDisplayTitle(rect!), '100 × 150 mm');
  assert.equal(productDisplayTitle(jewel!), 'Jewellery');
  assert.equal(productDisplayTitle(diameter!), '50 mm diameter');
});

test('printer titles are model names and printers group by sheet category', () => {
  assert.equal(catalog.printers.length, 18);
  const josh = catalog.printers.find((row) => row.id === 'josh');
  const tej = catalog.printers.find((row) => row.id === 'tej');
  assert.equal(productDisplayTitle(josh!), 'Josh');
  assert.equal(productDisplayTitle(tej!), 'Tej');

  const rows = filterShopProducts(catalog.printers, {
    category: 'printers',
    query: '',
    type: null,
    size: null,
  });
  assert.equal(rows.length, 18);
  assert.deepEqual(
    rows.map((row) => row.id),
    catalog.printers.map((row) => row.id),
  );

  const groups = groupPrintersByCategory(rows);
  assert.deepEqual(
    groups.map((group) => group.title),
    ['Label Printers', 'Photo & Mini Printers', 'A4 Printers'],
  );
  assert.equal(groups[0]?.products.length, 7);
  assert.equal(groups[1]?.products.length, 8);
  assert.equal(groups[2]?.products.length, 3);
  assert.equal(groups[0]?.products[0]?.id, 'josh');
  assert.equal(groups[2]?.products[2]?.id, 'pro-hd');
});

test('printer search matches name and category', () => {
  const byName = filterShopProducts(catalog.printers, {
    category: 'printers',
    query: 'label x',
    type: null,
    size: null,
  });
  assert.equal(byName.length, 1);
  assert.equal(byName[0]?.id, 'label-x');

  const byCategory = filterShopProducts(catalog.printers, {
    category: 'printers',
    query: 'a4',
    type: null,
    size: null,
  });
  assert.ok(byCategory.length >= 3);
  assert.ok(byCategory.every((row) => row.type === 'A4 Printers'));
});
