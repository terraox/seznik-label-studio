import test from 'node:test';
import assert from 'node:assert/strict';

import { fitBarcodeDefaults, fitQrcodeDefaults } from '../element-sizing';
import { ptToMm } from '../label-document';

test('small labels keep the old default barcode size (28 mm cap)', () => {
  const fit = fitBarcodeDefaults(50, 30);
  assert.ok(Math.abs(fit.width - 28) < 0.01, `width ${fit.width}`);
  assert.ok(Math.abs(fit.height - 11.2) < 0.01, `height ${fit.height}`);
});

test('a 100 x 150 mm label gets a barcode that grows with it', () => {
  const fit = fitBarcodeDefaults(100, 150);
  assert.ok(fit.width >= 70 && fit.width <= 90, `width ${fit.width}`);
  assert.ok(fit.height >= 25, `height ${fit.height}`);
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

test('a QR on a 100 x 150 mm label starts big, and on a small label as before', () => {
  const big = fitQrcodeDefaults(100, 150);
  assert.ok(big.width >= 50 && big.width <= 60, `width ${big.width}`);
  const small = fitQrcodeDefaults(50, 30);
  assert.ok(small.width <= 50 * 0.4 + 0.01, `small width ${small.width}`);
});

test('default barcode and QR sizes grow smoothly with the label: no jump between near sizes', () => {
  let prevBarcode = fitBarcodeDefaults(40, 200).width;
  let prevQr = fitQrcodeDefaults(40, 400).width;
  for (let w = 41; w <= 140; w++) {
    const barcode = fitBarcodeDefaults(w, 200).width;
    const qr = fitQrcodeDefaults(w, 400).width;
    assert.ok(barcode >= prevBarcode - 1e-9, `barcode shrinks at ${w}mm`);
    assert.ok(qr >= prevQr - 1e-9, `qr shrinks at ${w}mm`);
    assert.ok(barcode - prevBarcode <= 2.2, `barcode jumps ${prevBarcode} → ${barcode} at ${w}mm`);
    assert.ok(qr - prevQr <= 1, `qr jumps ${prevQr} → ${qr} at ${w}mm`);
    prevBarcode = barcode;
    prevQr = qr;
  }
});

test('labels up to 60 mm wide are exactly as before, and 100 mm and up use the vendor size', () => {
  for (const w of [30, 40, 50, 60]) {
    assert.equal(fitBarcodeDefaults(w, 200).width, Math.min(28, Math.max(16, w * 0.58)), `${w}mm barcode`);
  }
  assert.ok(Math.abs(fitBarcodeDefaults(100, 200).width - 80) < 0.01);
  assert.ok(Math.abs(fitBarcodeDefaults(120, 300).width - 96) < 0.01);
  assert.ok(Math.abs(fitQrcodeDefaults(100, 400).width - 55) < 0.01);
});

test('the text under a default barcode keeps the same ratio to the bars on every label size', () => {
  for (const [w, h] of [[40, 30], [50, 30], [60, 40], [70, 50], [80, 60], [100, 150], [120, 180]] as const) {
    const fit = fitBarcodeDefaults(w, h);
    const ratio = ptToMm(fit.fontSize) / fit.height;
    assert.ok(Math.abs(ratio - 0.25) < 0.005, `${w}x${h} text/height ratio ${ratio}`);
    assert.ok(Math.abs(fit.height / fit.width - 0.4) < 0.005, `${w}x${h} bars aspect`);
  }
  // 50 x 30 is unchanged.
  assert.ok(Math.abs(fitBarcodeDefaults(50, 30).fontSize - 7.94) < 0.05);
});
