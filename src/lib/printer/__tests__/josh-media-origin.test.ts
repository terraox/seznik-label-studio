import assert from 'node:assert/strict';
import { joshPackedPageDots } from '@/lib/printer/josh-mono-validate';
import { JOSH_LPAPI_DRAW_BIAS_H_MM, JOSH_LPAPI_DRAW_BIAS_V_MM, joshInkShiftDots } from '@/lib/printer/josh-print';
import {
  JOSH_MEDIA_ORIGIN_H_MM,
  PRINTER_PROFILES,
  TD404_MEDIA_ORIGIN_H_MM,
  createPrintSpec,
  dotsPerMm,
  mediaOriginXMm,
  mmToDots,
} from '@/lib/printer/print-spec';
import { packedPageDots } from '@/printing/raster/skia-rasterizer';

const josh = {
  id: 'josh-lpapi',
  name: 'JOSH',
  dpi: 203,
  printheadWidthMm: 50,
  printheadWidthDots: 400,
  maxHeightMm: 1000,
  alignment: 'left' as const,
  commandLanguage: 'tspl' as const,
};

assert.equal(JOSH_MEDIA_ORIGIN_H_MM, 3);
assert.equal(mediaOriginXMm(josh), 3);
assert.equal(mediaOriginXMm(PRINTER_PROFILES['td404-304']), TD404_MEDIA_ORIGIN_H_MM);
assert.equal(mediaOriginXMm(PRINTER_PROFILES['generic-203-4in']), 0);
assert.equal(mediaOriginXMm(PRINTER_PROFILES['receipt-58mm']), 0);

const baked = joshInkShiftDots(0, 0, 203);
assert.equal(
  baked.x,
  mmToDots(JOSH_MEDIA_ORIGIN_H_MM + JOSH_LPAPI_DRAW_BIAS_H_MM, 203),
  'LPAPI ink shift includes die-cut origin and draw bias',
);
assert.equal(baked.y, mmToDots(JOSH_LPAPI_DRAW_BIAS_V_MM, 203));

const joshSpec = createPrintSpec({
  widthMm: 50,
  heightMm: 30,
  dpi: 203,
  profile: josh,
  calibration: { horizontalOffsetMm: 0, verticalOffsetMm: 0 },
});
assert.equal(joshSpec.widthMm, 50, 'die-cut width is unchanged');
assert.equal(joshSpec.xOffsetDots, mmToDots(JOSH_MEDIA_ORIGIN_H_MM, 203));

const td = createPrintSpec({
  widthMm: 50,
  heightMm: 30,
  dpi: 304,
  profile: PRINTER_PROFILES['td404-304'],
  calibration: { horizontalOffsetMm: 0, verticalOffsetMm: 0 },
});
assert.equal(td.xOffsetDots, mmToDots(TD404_MEDIA_ORIGIN_H_MM, 304));

const dpm = dotsPerMm(203);
assert.equal(dpm, 8);

const fifty = joshPackedPageDots(50, 30, 203);
assert.equal(fifty.sizeDotsW, 400);
assert.equal(fifty.packedW, 400);
assert.equal(fifty.drawDotsW, 400, 'integer-mm width is already byte-aligned');

const odd = joshPackedPageDots(25.4, 30, 203);
assert.equal(odd.sizeDotsW, 203);
assert.equal(odd.packedW, 208, 'partial byte is padded, not dropped');
assert.equal(odd.drawDotsW, odd.sizeDotsW);
assert.equal(odd.packedW % 8, 0);
const drawDpm = odd.drawDotsW / 25.4;
const floorStretchDpm = Math.floor(odd.sizeDotsW / 8) * 8 / 25.4;
assert.ok(Math.abs(drawDpm - dpm) < 0.02, `draw dpm ${drawDpm} stays on 8`);
assert.ok(
  Math.abs(drawDpm - dpm) < Math.abs(floorStretchDpm - dpm),
  'padding must not stretch the page the way a floored width does',
);

assert.equal(packedPageDots(25.4, 30, 203).packedW, 200, 'TD-404 pack still floors');

console.log('ok josh media origin');
