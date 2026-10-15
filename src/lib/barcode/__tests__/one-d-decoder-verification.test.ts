/**
 * 1D barcode encoders checked with an independent decoder (ZXing).
 * Covers every mode in BARCODE_MODES, including the auto check digits.
 */

import assert from 'node:assert';
import * as zxing from '@zxing/library';
import { barcodeModulesForMode } from '../../barcode-code128';
function decode(mode: string, input: string, fmt: zxing.BarcodeFormat) {
  const m = barcodeModulesForMode(mode, input);
  if (!m) return 'ENCODE NULL';
  const mod = 3, qz = 12, h = 60;
  const bits: number[] = [];
  m.forEach((n, i) => { for (let k = 0; k < n; k++) bits.push(i % 2 === 0 ? 0 : 255); });
  const w = (bits.length + qz * 2) * mod;
  const lum = new Uint8ClampedArray(w * h).fill(255);
  for (let x = 0; x < bits.length; x++) for (let dx = 0; dx < mod; dx++) for (let y = 0; y < h; y++) lum[y * w + (x + qz) * mod + dx] = bits[x];
  const src = new zxing.RGBLuminanceSource(lum, w, h);
  const hints = new Map<any, any>([[zxing.DecodeHintType.POSSIBLE_FORMATS, [fmt]], [zxing.DecodeHintType.TRY_HARDER, true]]);
  try { return new zxing.MultiFormatReader().decode(new zxing.BinaryBitmap(new zxing.HybridBinarizer(src)), hints).getText(); } catch (e: any) { return 'FAIL ' + e.name; }
}
const F = zxing.BarcodeFormat;
const cases: [string, string, zxing.BarcodeFormat, string][] = [
  ['CODE-128', 'Hello123 ab-Z', F.CODE_128, 'Hello123 ab-Z'],
  ['CODE-128', '1234567890', F.CODE_128, '1234567890'],
  ['CODE-39', 'ABC-123', F.CODE_39, 'ABC-123'],
  ['ITF', '123456', F.ITF, '123456'],
  ['EAN-13', '4006381333931', F.EAN_13, '4006381333931'],
  ['EAN-13', '400638133393', F.EAN_13, '4006381333931'],
  ['EAN-8', '73513537', F.EAN_8, '73513537'],
  ['EAN-8', '7351353', F.EAN_8, '73513537'],
  ['UPC-A', '036000291452', F.UPC_A, '036000291452'],
  ['UPC-A', '03600029145', F.UPC_A, '036000291452'],
];
for (const [mode, input, fmt, expected] of cases) {
  assert.strictEqual(decode(mode, input, fmt), expected, `${mode} "${input}"`);
  console.log(`ok ${mode} "${input}" -> ${expected}`);
}
console.log('--- All 1D barcode modes decode correctly ---');
