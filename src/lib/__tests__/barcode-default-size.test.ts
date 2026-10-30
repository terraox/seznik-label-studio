import test from 'node:test';
import assert from 'node:assert/strict';

import { fitBarcodeDefaults } from '../element-sizing';

test('small labels keep the old default barcode size (28 mm cap)', () => {
  const fit = fitBarcodeDefaults(50, 30);
  assert.ok(Math.abs(fit.width - 28) < 0.01, `width ${fit.width}`);
  assert.ok(Math.abs(fit.height - 11.2) < 0.01, `height ${fit.height}`);
});

test('a 100 x 150 mm label gets a barcode that grows with it', () => {
  const fit = fitBarcodeDefaults(100, 150);
  assert.ok(fit.width >= 45 && fit.width <= 60, `width ${fit.width}`);
  assert.ok(fit.height >= 15, `height ${fit.height}`);
  assert.ok(fit.left + fit.width <= 100 && fit.top + fit.height <= 150);
});

test('the default barcode never leaves the label', () => {
  for (const [w, h] of [[30, 20], [50, 30], [75, 50], [100, 150], [120, 180]] as const) {
    const fit = fitBarcodeDefaults(w, h);
    assert.ok(fit.left >= 0 && fit.top >= 0, `${w}x${h} origin`);
    assert.ok(fit.left + fit.width <= w + 0.01, `${w}x${h} width`);
    assert.ok(fit.top + fit.height <= h + 0.01, `${w}x${h} height`);
  }
});
