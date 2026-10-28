import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPPING_SIZE_PRESETS } from '../platforms';
import { MAX_LABEL_MM, MIN_LABEL_MM, validateLabelSize } from '../../label-geometry';

test('shipping sizes are all printable and unique', () => {
  const seen = new Set<string>();
  for (const p of SHIPPING_SIZE_PRESETS) {
    assert.ok(p.width >= MIN_LABEL_MM && p.width <= MAX_LABEL_MM, p.name);
    assert.ok(p.height >= MIN_LABEL_MM && p.height <= MAX_LABEL_MM, p.name);
    assert.equal(validateLabelSize(p.width, p.height), null, p.name);
    assert.ok(!seen.has(p.name), `duplicate ${p.name}`);
    seen.add(p.name);
  }
});

test('4 × 6 in is exactly 100 × 150 mm and comes first', () => {
  const [first] = SHIPPING_SIZE_PRESETS;
  assert.equal(first.name, '4 × 6 in');
  assert.equal(first.width, 100);
  assert.equal(first.height, 150);
});

test('every size is a whole number of millimetres, close to its inch size', () => {
  for (const p of SHIPPING_SIZE_PRESETS) {
    assert.ok(Number.isInteger(p.width) && Number.isInteger(p.height), p.name);
    if (p.inch) {
      // Nominal sizes: 4 × 6 in is 100 × 150 mm, 3 × 5 in is 75 × 125 mm.
      assert.ok(Math.abs(p.inch[0] * 25.4 - p.width) < 2.5, p.name);
      assert.ok(Math.abs(p.inch[1] * 25.4 - p.height) < 2.5, p.name);
    }
  }
});
