import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProductName, typeTokens } from '@/lib/shop/parse-product';

test('parses rectangular size and labels per roll', () => {
  const parsed = parseProductName('50 x 25mm - (250 Labels/Roll) - Waterproof');
  assert.equal(parsed.sizeLabel, '50x25mm');
  assert.equal(parsed.widthMm, 50);
  assert.equal(parsed.heightMm, 25);
  assert.equal(parsed.quantity, 250);
  assert.equal(parsed.quantityLabel, '250 Labels/Roll');
  assert.equal(parsed.detailLabel, '50x25mm · 250 Labels/Roll');
});

test('parses labels without /Roll and diameter stock', () => {
  const labels = parseProductName('25 x 25mm - (2500 Labels) - Waterproof');
  assert.equal(labels.quantityLabel, '2500 Labels');
  assert.equal(labels.sizeLabel, '25x25mm');

  const diameter = parseProductName('50 Diameter - (100 Labels/Roll) - Waterproof');
  assert.equal(diameter.sizeLabel, '50 Diameter');
  assert.equal(diameter.widthMm, null);
  assert.equal(diameter.quantityLabel, '100 Labels/Roll');
});

test('parses roll packs and leaves specialty names as the detail line', () => {
  const rolls = parseProductName('White Sticky - (5 Rolls) - Normal');
  assert.equal(rolls.quantityLabel, '5 Rolls');
  assert.equal(rolls.sizeLabel, null);

  const jewellery = parseProductName('Jewellery - (150 Labels/Roll) - Waterproof');
  assert.equal(jewellery.sizeLabel, null);
  assert.equal(jewellery.quantityLabel, '150 Labels/Roll');
  assert.equal(jewellery.detailLabel, '150 Labels/Roll');

  const bundle = parseProductName('SEZNIK Multi-Type Thermal Roll Paper Bundle - Normal');
  assert.equal(bundle.sizeLabel, null);
  assert.equal(bundle.quantityLabel, null);
  assert.equal(bundle.detailLabel, 'SEZNIK Multi-Type Thermal Roll Paper Bundle - Normal');
});

test('splits comma-separated types', () => {
  assert.deepEqual(typeTokens('Normal, Special'), ['Normal', 'Special']);
});
