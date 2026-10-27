import assert from 'node:assert';

import {
  cropWindowPts,
  cropAspectForLabel,
  defaultCropWindow,
  snapCropToAspect,
  mmToPt,
  parseCustomPageList,
  parsePageRange,
  resolvePrintPageIndices,
  resolveScopeIndices,
  sharpness0CropBoxesEqual,
  shouldRasterizePage,
  stampRectInCropSpace,
  tiledRepeatCount,
} from '../session';

console.log('--- pdf-editor session tests ---');

const r1 = parsePageRange('2', '5', 10);
assert.strictEqual(r1.start, 2);
assert.strictEqual(r1.end, 5);
assert.strictEqual(r1.error, undefined);

const r2 = parsePageRange('0', '99', 8);
assert.strictEqual(r2.start, 1);
assert.strictEqual(r2.end, 8);

const r3 = parsePageRange('7', '2', 8);
assert.strictEqual(r3.start, 2);
assert.strictEqual(r3.end, 7);
assert.ok(r3.error);

const idx = resolveScopeIndices({ mode: 'range', start: 2, end: 4 }, 6, 0);
assert.deepStrictEqual(idx, [1, 2, 3]);

const thisIdx = resolveScopeIndices({ mode: 'this' }, 6, 4);
assert.deepStrictEqual(thisIdx, [4]);

const page = { w: mmToPt(210), h: mmToPt(297) };
const output = { kind: '4x6' as const, widthMm: 100, heightMm: 150 };
const box = cropWindowPts(page, output, { x: 0, y: 0 });
assert.strictEqual(box.fits, true);
assert.ok(Math.abs(box.w - mmToPt(100)) < 0.05);
assert.ok(Math.abs(box.h - mmToPt(150)) < 0.05);
assert.ok(Math.abs(box.y + box.h - page.h) < 0.05, 'top-left origin maps to top of page (PDF y-up)');

const tooBig = cropWindowPts({ w: mmToPt(50), h: mmToPt(50) }, output, { x: 0, y: 0 });
assert.strictEqual(tooBig.fits, true, 'oversized window is scaled into the page');
assert.ok(tooBig.w <= mmToPt(50) + 0.05);
assert.ok(tooBig.h <= mmToPt(50) + 0.05);

const media = { ...box };
const crop = { ...box };
assert.strictEqual(sharpness0CropBoxesEqual(media, crop), true);
assert.strictEqual(
  sharpness0CropBoxesEqual(media, { ...crop, x: crop.x + 1 }),
  false,
  'CropBox-only mismatch is detected',
);

const stamp = stampRectInCropSpace(box, { offsetNorm: { x: 0.5, y: 0.5 }, sizeNorm: 0.2 });
assert.ok(stamp.x >= box.x - 0.01);
assert.ok(stamp.x + stamp.w <= box.x + box.w + 1);
assert.ok(stamp.y >= box.y - 0.01);

const mixed = cropWindowPts({ w: mmToPt(150), h: mmToPt(200) }, output, { x: 0.1, y: 0.1 });
assert.strictEqual(mixed.fits, true);

const heightCrop = cropWindowPts(page, output, { x: 0.1, y: 0.2 }, { w: 0.45, h: 0.3 });
assert.ok(Math.abs(heightCrop.w - page.w * 0.45) < 0.05, 'width fraction is kept');
assert.ok(Math.abs(heightCrop.h - page.h * 0.3) < 0.05, 'height fraction is kept');
assert.ok(heightCrop.h < page.h * 0.5, 'height crop is not the full page');

const repeats = tiledRepeatCount({ x: 0.2, y: 0.25 });
assert.strictEqual(repeats.cols, 5);
assert.strictEqual(repeats.rows, 4);
assert.notStrictEqual(repeats.cols, 4096, 'repeat count is not sourced from image pixel width');

assert.strictEqual(shouldRasterizePage(0), false);
assert.strictEqual(shouldRasterizePage(1), true);

const custom = parseCustomPageList('5, 1, 3, 3', 8);
assert.deepStrictEqual(custom.pages, [1, 3, 5]);
assert.strictEqual(custom.error, undefined);

const customBad = parseCustomPageList('1, a', 8);
assert.deepStrictEqual(customBad.pages, []);
assert.ok(customBad.error);

const customOut = parseCustomPageList('9', 8);
assert.ok(customOut.error);
assert.deepStrictEqual(customOut.pages, []);

assert.deepStrictEqual(resolvePrintPageIndices({ mode: 'current' }, 6, 2), [2]);
assert.deepStrictEqual(
  resolvePrintPageIndices({ mode: 'range', start: 2, end: 4 }, 6, 0),
  [1, 2, 3],
);
assert.deepStrictEqual(
  resolvePrintPageIndices({ mode: 'custom', pages: [1, 3, 3] }, 6, 0),
  [0, 2],
);
assert.deepStrictEqual(resolvePrintPageIndices({ mode: 'even' }, 5, 0), [1, 3]);
assert.deepStrictEqual(resolvePrintPageIndices({ mode: 'odd' }, 5, 0), [0, 2, 4]);
assert.deepStrictEqual(resolvePrintPageIndices({ mode: 'even' }, 1, 0), []);
assert.deepStrictEqual(resolvePrintPageIndices({ mode: 'odd' }, 1, 0), [0]);

const afterSizeChange = { crop: { scope: { mode: 'this' as const }, originNorm: { x: 0.2, y: 0.2 } }, outputSize: output };
const reset = { ...afterSizeChange, outputSize: { kind: '4x4' as const, widthMm: 100, heightMm: 100 }, crop: null };
assert.strictEqual(reset.crop, null);

// Default crop window: label aspect, inside the page, centred.
const dcw = defaultCropWindow({ w: 595, h: 842 }, { widthMm: 50, heightMm: 30 });
assert.ok(dcw.sizeNorm.w <= 0.9 + 1e-9 && dcw.sizeNorm.h < 0.9, 'wide label gives a short window');
assert.ok(Math.abs((dcw.sizeNorm.w * 595) / (dcw.sizeNorm.h * 842) - 50 / 30) < 0.01, 'keeps label aspect');
assert.ok(Math.abs(dcw.originNorm.x * 2 + dcw.sizeNorm.w - 1) < 1e-9, 'centred horizontally');

// Label render plan: crop is contained in the label, rotation swaps the fit.
import { planLabelRender } from '../label-render-plan';
import { unsharpGray } from '../sharpen';
const a4 = { pageWpt: 595.28, pageHpt: 841.89, dpi: 203 };
const full = planLabelRender({ ...a4, crop: null, rotationDeg: 0, widthMm: 50, heightMm: 30 });
assert.strictEqual(full.dotsW, 400);
assert.strictEqual(full.dotsH, 240);
assert.ok(full.drawH <= 240.01 && full.drawW <= 400.01, 'full page contained');
assert.ok(Math.abs(full.drawH - 240) < 0.5, 'tall A4 is limited by label height');
const tight = planLabelRender({
  ...a4,
  crop: { originNorm: { x: 0.1, y: 0.1 }, sizeNorm: { w: 0.25, h: 0.1 } },
  rotationDeg: 0,
  widthMm: 50,
  heightMm: 30,
});
assert.ok(tight.drawW > full.drawW * 2, 'cropped region is zoomed in');
assert.ok(tight.drawW <= 400.01 && tight.drawH <= 240.01, 'cropped region still fits the label');
assert.ok(tight.rasterDpi >= full.rasterDpi, 'zoomed crop renders at least as sharp');
const rot = planLabelRender({ ...a4, crop: null, rotationDeg: 90, widthMm: 50, heightMm: 30 });
assert.ok(rot.drawH <= 400.01 && rot.drawW <= 240.01, 'rotated page fits with axes swapped');
const flat = new Uint8Array(100).fill(128);
assert.deepStrictEqual(Array.from(unsharpGray(flat, 10, 10, 80)), Array.from(flat), 'flat area unchanged');
const edge = new Uint8Array(100);
for (let y = 0; y < 10; y++) for (let x = 5; x < 10; x++) edge[y * 10 + x] = 255;
const sharpened = unsharpGray(edge, 10, 10, 80);
assert.ok(sharpened[4] < edge[4] || edge[4] === 0, 'edge gets darker side');
assert.ok(sharpened[5] >= edge[5], 'edge gets lighter side');
assert.strictEqual(unsharpGray(edge, 10, 10, 0), edge, 'zero sharpness is identity');

// Fuzz the plan: whatever the crop, rotation or label, the content fits the label and the raster stays bounded.
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
for (let n = 0; n < 500; n++) {
  const w = 0.05 + rnd() * 0.95;
  const h = 0.05 + rnd() * 0.95;
  const crop = rnd() < 0.3 ? null : { originNorm: { x: rnd() * (1 - w), y: rnd() * (1 - h) }, sizeNorm: { w, h } };
  const rotationDeg = [0, 90, 180, 270][Math.floor(rnd() * 4)];
  const widthMm = 15 + rnd() * 90;
  const heightMm = 10 + rnd() * 90;
  const dpi = rnd() < 0.5 ? 203 : 300;
  const pw = 200 + rnd() * 600;
  const ph = 200 + rnd() * 800;
  const p = planLabelRender({ pageWpt: pw, pageHpt: ph, crop, rotationDeg, widthMm, heightMm, dpi });
  const turned = rotationDeg === 90 || rotationDeg === 270;
  const fw = turned ? p.drawH : p.drawW;
  const fh = turned ? p.drawW : p.drawH;
  assert.ok(fw <= p.dotsW + 0.01 && fh <= p.dotsH + 0.01, 'content fits label');
  assert.ok(Math.abs(fw - p.dotsW) < 0.01 || Math.abs(fh - p.dotsH) < 0.01, 'content touches one label edge');
  assert.ok(p.rasterDpi >= 96 && p.rasterDpi <= 600, 'raster dpi bounded');
  const px = ((pw / 72) * p.rasterDpi) * ((ph / 72) * p.rasterDpi);
  assert.ok(px <= 16_000_000 * 1.02 || p.rasterDpi === 96, 'page bitmap stays under the pixel budget');
}

// Snapping a crop to the label shape keeps the centre and gives the exact aspect.
const pg = { w: 595, h: 842 };
const snapped = snapCropToAspect({ originNorm: { x: 0.2, y: 0.1 }, sizeNorm: { w: 0.2, h: 0.6 } }, pg, 50 / 30);
assert.ok(Math.abs((snapped.sizeNorm.w * pg.w) / (snapped.sizeNorm.h * pg.h) - 50 / 30) < 0.01, 'snap gives label aspect');
assert.ok(Math.abs(snapped.originNorm.x + snapped.sizeNorm.w / 2 - 0.3) < 1e-6, 'snap keeps centre x');
assert.ok(snapped.sizeNorm.w <= 0.2 + 1e-9 && snapped.sizeNorm.h <= 0.6 + 1e-9, 'snap only shrinks');
assert.ok(Math.abs(cropAspectForLabel({ widthMm: 50, heightMm: 30 }, 90) - 30 / 50) < 1e-9, 'quarter turn swaps axes');

console.log('ok pdf-editor session + crop boxes + stamp frame + tile repeats');
