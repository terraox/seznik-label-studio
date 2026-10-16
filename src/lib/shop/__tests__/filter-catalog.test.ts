import assert from 'node:assert/strict';
import test from 'node:test';

import catalog from '@/lib/shop/catalog.json';
import {
  filterShopProducts,
  formatSizeKey,
  groupShopProducts,
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

test('labels are grouped by size, rectangles first, two-up friendly order', () => {
  const rows = filterShopProducts(catalog.labels, {
    category: 'labels',
    query: '',
    type: null,
    size: null,
  });
  const i25 = rows.findIndex((row) => row.widthMm === 25 && row.heightMm === 15);
  const i100 = rows.findIndex((row) => row.widthMm === 100 && row.heightMm === 150);
  const iJewel = rows.findIndex((row) => row.id === 'jewellery-750');
  assert.ok(i25 >= 0 && i100 > i25);
  assert.ok(iJewel > i100);

  const groups = groupShopProducts(rows);
  const groupedIds = groups.flatMap((group) => group.products.map((product) => product.id));
  assert.deepEqual(groupedIds, rows.map((row) => row.id));
  assert.equal(groups[0]?.title, '25 × 15 mm');
  assert.ok(groups.some((group) => group.key === '50 Diameter' && group.title === '50 mm diameter'));
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

test('printers category is empty until that catalogue is added', () => {
  const rows = filterShopProducts(catalog.printers, {
    category: 'printers',
    query: '',
    type: null,
    size: null,
  });
  assert.equal(rows.length, 0);
});
