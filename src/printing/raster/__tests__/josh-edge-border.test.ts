import assert from 'node:assert/strict';
import type { LabelDocument } from '@/lib/label-document';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import {
  joshHeadlessRasterOptions,
  joshInkShiftDots,
  JOSH_BORDER_PAD_DOTS,
  JOSH_BORDER_SHIFT_MM,
  JOSH_ELEMENT_X_OFFSET_MM,
} from '@/lib/printer/josh-print';
import { unpackMono1bppToGray } from '@/printing/raster/bit-packer';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const dpi = 203;

function doc(widthMm: number, withBorder: boolean): LabelDocument {
  return {
    id: 'josh-edge',
    name: 'josh-edge',
    widthMm,
    heightMm: 30,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      ...(withBorder
        ? [
            {
              ...fullBleedBorderElement(widthMm, 30),
              left: 2,
              top: 2,
              width: widthMm - 4,
              height: 26,
              geometryVersion: 1,
              lineWidth: 0.5,
            },
          ]
        : []),
      {
        id: 'bar',
        type: 'shape',
        shapeType: 'rectangle',
        left: 20,
        top: 12,
        width: 10,
        height: 6,
        lineWidth: 0.5,
        fill: true,
        needPrinting: true,
        drawingColorIndex: 0,
      },
    ],
    updatedAt: 0,
  } as unknown as LabelDocument;
}

const joshShift = joshInkShiftDots(0, 0, dpi);
const legacyOpts = { pageWidthPack: 'ceil' as const, shiftDots: joshShift };
const elemX = Math.round(JOSH_ELEMENT_X_OFFSET_MM * 8);
const prodLegacyOpts = { pageWidthPack: 'ceil' as const, shiftDots: { x: joshShift.x + elemX, y: joshShift.y } };
const padOpts = { ...legacyOpts, edgeBorders: { padRightDots: 8, centerGapMm: 2 } };
const gapOpts = { ...legacyOpts, edgeBorders: { padRightDots: 0, centerGapMm: 3 } };

function gray(d: LabelDocument, legacy: boolean) {
  const opts = legacy ? legacyOpts : padOpts;
  const r = rasterizeDocumentToBitmapTimed(d, dpi, opts).result;
  return {
    r,
    g: unpackMono1bppToGray(r.mono1bppBuffer, r.widthDots, r.heightDots, r.bytesPerRow),
  };
}

function inkCols(g: Uint8Array, w: number, y: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) if (g[y * w + x] < 160) out.push(x);
  return out;
}

for (const widthMm of [50, 25.4, 30]) {
  // Element-only label: the new options must not change a single pixel inside the old page.
  const before = gray(doc(widthMm, false), true);
  const after = gray(doc(widthMm, false), false);
  const cropW = Math.round(widthMm * 8);
  for (let y = 0; y < before.r.heightDots; y++) {
    for (let x = 0; x < cropW; x++) {
      assert.equal(after.g[y * after.r.widthDots + x], before.g[y * before.r.widthDots + x], `element pixel ${x},${y} @${widthMm}`);
    }
  }
  assert.equal(after.r.widthDots % 8, 0);
  assert.ok(after.r.widthDots >= cropW + 8);
}

// Border: stroke center is 2 mm from every edge. Label coords = bitmap − josh ink shift.
{
  const { r, g } = gray(doc(50, true), false);
  const w = r.widthDots;
  assert.equal(w, 408);
  const mid = inkCols(g, w, 100); // row inside the label, away from the bar
  const stroke = 4; // 0.5 mm
  const left = mid.filter((x) => x < 100);
  const right = mid.filter((x) => x > 300);
  assert.ok(right.length >= stroke, 'right border present');
  const centerL = (left[0] + left[left.length - 1] + 1) / 2 - joshShift.x;
  const centerR = (right[0] + right[right.length - 1] + 1) / 2 - joshShift.x;
  assert.equal(centerL, 16, 'left center 2 mm');
  assert.equal(centerR, 400 - 16, 'right center 2 mm from 50 mm edge (label dots 384)');
  const col = (x: number) => {
    const ys: number[] = [];
    for (let y = 0; y < r.heightDots; y++) if (g[y * w + x] < 160) ys.push(y);
    return ys;
  };
  const v = col(200);
  const top = v.filter((y) => y < 60);
  const bottom = v.filter((y) => y > 150);
  assert.equal((top[0] + top[top.length - 1] + 1) / 2 - joshShift.y, 16, 'top center 2 mm');
  assert.equal((bottom[0] + bottom[bottom.length - 1] + 1) / 2 - joshShift.y, 240 - 16, 'bottom center 2 mm');
}

// Production Josh options: no pad (page = label), border center 3 mm on all sides, elements unchanged.
assert.equal(JOSH_BORDER_PAD_DOTS, 0);
for (const widthMm of [50, 25.4, 30]) {
  const prod = rasterizeDocumentToBitmapTimed(doc(widthMm, false), dpi, joshHeadlessRasterOptions(dpi, 0, 0)).result;
  const old = rasterizeDocumentToBitmapTimed(doc(widthMm, false), dpi, prodLegacyOpts).result;
  assert.equal(prod.widthDots, old.widthDots);
  // The native side crops to the label width, so only those columns reach the paper.
  const cropW = Math.round(widthMm * 8);
  const a = unpackMono1bppToGray(prod.mono1bppBuffer, prod.widthDots, prod.heightDots, prod.bytesPerRow);
  const b = unpackMono1bppToGray(old.mono1bppBuffer, old.widthDots, old.heightDots, old.bytesPerRow);
  for (let y = 0; y < prod.heightDots; y++) {
    for (let x = 0; x < cropW; x++) assert.equal(a[y * prod.widthDots + x], b[y * old.widthDots + x]);
  }
}
{
  const r = rasterizeDocumentToBitmapTimed(doc(50, true), dpi, gapOpts).result;
  const w = r.widthDots;
  assert.equal(w, 400);
  const g = unpackMono1bppToGray(r.mono1bppBuffer, w, r.heightDots, r.bytesPerRow);
  const mid = inkCols(g, w, 100);
  const left = mid.filter((x) => x < 100);
  const right = mid.filter((x) => x > 300);
  assert.ok(right.length >= 4, 'right border present inside the bitmap');
  assert.equal((left[0] + left[left.length - 1] + 1) / 2 - joshShift.x, 24, 'left center 3 mm');
  assert.equal((right[0] + right[right.length - 1] + 1) / 2 - joshShift.x, 400 - 24, 'right center 3 mm');
  const ys: number[] = [];
  for (let y = 0; y < r.heightDots; y++) if (g[y * w + 200] < 160) ys.push(y);
  const top = ys.filter((y) => y < 60);
  const bottom = ys.filter((y) => y > 150);
  assert.equal((top[0] + top[top.length - 1] + 1) / 2 - joshShift.y, 24, 'top center 3 mm');
  assert.equal((bottom[0] + bottom[bottom.length - 1] + 1) / 2 - joshShift.y, 240 - 24, 'bottom center 3 mm');
}

// Production options: border uses its own shift, independent of the element shift,
// and both sides keep the same relative gap (right = width - left, inside the bitmap).
{
  const prod = joshHeadlessRasterOptions(dpi, 0, 0);
  const bare = rasterizeDocumentToBitmapTimed(doc(50, false), dpi, prod).result;
  const r = rasterizeDocumentToBitmapTimed(doc(50, true), dpi, prod).result;
  assert.equal(r.widthDots, bare.widthDots);
  const w = r.widthDots;
  const g = unpackMono1bppToGray(r.mono1bppBuffer, w, r.heightDots, r.bytesPerRow);
  const bg = unpackMono1bppToGray(bare.mono1bppBuffer, bare.widthDots, bare.heightDots, bare.bytesPerRow);
  const bx = Math.round(JOSH_BORDER_SHIFT_MM.x * 8);
  const mid = inkCols(g, w, 100).filter((x) => inkCols(bg, w, 100).indexOf(x) < 0);
  const left = mid.filter((x) => x < 100);
  const right = mid.filter((x) => x > 300);
  assert.ok(right.length >= 4, 'right border inside the bitmap');
  const cL = (left[0] + left[left.length - 1] + 1) / 2;
  const cR = (right[0] + right[right.length - 1] + 1) / 2;
  assert.equal(cL, 24 + bx, 'left center');
  assert.equal(cR, 400 - 24 + bx, 'right center');
  const by = Math.round(JOSH_BORDER_SHIFT_MM.y * 8);
  const ys: number[] = [];
  for (let y = 0; y < r.heightDots; y++) if (g[y * w + 200] < 160) ys.push(y);
  const top = ys.filter((y) => y < 60);
  const bottom = ys.filter((y) => y > 150);
  const cT = (top[0] + top[top.length - 1] + 1) / 2;
  const cB = (bottom[0] + bottom[bottom.length - 1] + 1) / 2;
  assert.equal(cT, 24 + by, 'top center 3 mm');
  assert.equal(cB, 240 - 24 + by, 'bottom center 3 mm');
  assert.ok(cR + 2 <= w, 'right stroke not on the last column');
}
console.log('josh-edge-border ok');
