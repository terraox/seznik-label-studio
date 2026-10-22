import assert from 'node:assert/strict';
import { test } from 'node:test';

import catalog from '@/lib/shop/catalog.json';
import { groupRolls, pickVariant, quantitySummary, rollColour, useCaseOf } from '@/lib/shop/roll-groups';
import type { ShopProduct } from '@/lib/shop/types';

const labels = catalog.labels as unknown as ShopProduct[];

test('colours and packs of one size and type become one roll', () => {
  const groups = groupRolls(labels);
  const g = groups.find((x) => x.title === '50 × 15 mm' && x.type === 'Waterproof')!;
  assert.ok(g, 'expected a 50 × 15 waterproof roll');
  assert.ok(g.colours.length >= 4);
  assert.equal(g.colours[0], 'white');
  assert.ok(groups.length < labels.length);
  assert.equal(groups.reduce((n, x) => n + x.variants.length, 0), labels.length);
});

test('use cases and colour lookups', () => {
  const ship = labels.find((p) => p.widthMm === 100)!;
  assert.equal(useCaseOf(ship), 'shipping');
  const jewel = labels.find((p) => /jewel/i.test(p.name))!;
  assert.equal(useCaseOf(jewel), 'jewellery');
  const blue = labels.find((p) => p.id.startsWith('blue-'))!;
  assert.equal(rollColour(blue), 'blue');
});

test('pickVariant falls back when a colour lacks that quantity', () => {
  const g = groupRolls(labels).find((x) => x.title === '50 × 15 mm' && x.type === 'Waterproof')!;
  const v = pickVariant(g, 'red', 99999);
  assert.equal(rollColour(v), 'red');
  assert.match(quantitySummary(g), /labels$/);
});
