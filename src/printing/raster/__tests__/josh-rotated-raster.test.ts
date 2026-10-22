import assert from 'node:assert/strict';
import type { LabelDocument, LabelOrientation } from '@/lib/label-document';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import { joshRotatedRasterOptions } from '@/lib/printer/josh-print';
import { offsetToPaperFrame } from '@/lib/layer-offsets';
import { unpackMono1bppToGray } from '@/printing/raster/bit-packer';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const dpi = 203;
const W = 50;
const H = 30;

const doc = {
  id: 'josh-rot',
  name: 'josh-rot',
  widthMm: W,
  heightMm: H,
  orientation: 0,
  paperType: 'Label',
  mediaShape: 'rectangle',
  background: { type: 'color', color: '#FFFFFF' },
  elements: [
    { ...fullBleedBorderElement(W, H), left: 2, top: 2, width: W - 4, height: H - 4, geometryVersion: 1, lineWidth: 0.5 },
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

const Z = { x: 0, y: 0 };

function render(deg: LabelOrientation, elements: { x: number; y: number }, border: { x: number; y: number }) {
  const opts = joshRotatedRasterOptions(dpi, 0, 0, deg, {}, { elements, border: offsetToPaperFrame(border, deg) });
  const bmp = rasterizeDocumentToBitmapTimed(doc, dpi, opts).result;
  const gray = unpackMono1bppToGray(bmp.mono1bppBuffer, bmp.widthDots, bmp.heightDots, bmp.bytesPerRow);
  return { gray, w: bmp.widthDots, h: bmp.heightDots };
}

function sameWhere(a: Uint8Array, b: Uint8Array, w: number, h: number, pick: (x: number, y: number) => boolean) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pick(x, y) && a[y * w + x] !== b[y * w + x]) return false;
  return true;
}

for (const deg of [90, 180, 270] as LabelOrientation[]) {
  const quarter = deg !== 180;
  const base = render(deg, Z, Z);
  assert.equal(base.w, quarter ? H * 8 : W * 8, `${deg}: paper width in dots`);
  assert.equal(base.h, quarter ? W * 8 : H * 8, `${deg}: paper height in dots`);
  const inner = (x: number, y: number) => x > 60 && y > 60 && x < base.w - 60 && y < base.h - 60;

  // Border offset leaves everything away from the frame alone and changes the frame.
  const b = render(deg, Z, { x: 1, y: 1 });
  assert.ok(sameWhere(b.gray, base.gray, base.w, base.h, inner), `${deg}: border offset leaves elements untouched`);
  assert.ok(!sameWhere(b.gray, base.gray, base.w, base.h, () => true), `${deg}: border offset moves the border`);

  // Elements offset leaves the frame alone and changes the middle.
  const e = render(deg, { x: 1, y: 1 }, Z);
  assert.ok(sameWhere(e.gray, base.gray, base.w, base.h, (x, y) => !inner(x, y)), `${deg}: elements offset leaves border untouched`);
  assert.ok(!sameWhere(e.gray, base.gray, base.w, base.h, inner), `${deg}: elements offset moves elements`);
}
console.log('josh rotated raster ok');
