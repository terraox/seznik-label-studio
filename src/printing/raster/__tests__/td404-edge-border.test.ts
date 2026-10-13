import assert from 'node:assert/strict';
import type { LabelDocument } from '@/lib/label-document';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import { mmToDots, td404BorderOuterDots, td404EdgeBorderOptions } from '@/lib/printer/print-spec';
import { unpackMono1bppToGray } from '@/printing/raster/bit-packer';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const dpi = 304;

function doc(heightMm: number): LabelDocument {
  return {
    id: 't',
    name: 't',
    widthMm: 50,
    heightMm,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      { ...fullBleedBorderElement(50, heightMm), left: 2, top: 2, width: 46, height: heightMm - 4, geometryVersion: 1, lineWidth: 0.5 },
    ],
  } as unknown as LabelDocument;
}

function bounds(heightMm: number, shiftMm: number) {
  const r = rasterizeDocumentToBitmapTimed(doc(heightMm), dpi, {
    threshold: 160,
    bakeTd404Feed: true,
    edgeBorders: td404EdgeBorderOptions(dpi),
    shiftDots: { x: mmToDots(shiftMm, dpi), y: mmToDots(shiftMm, dpi) },
  }).result;
  const g = unpackMono1bppToGray(r.mono1bppBuffer, r.widthDots, r.heightDots, r.bytesPerRow);
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < r.heightDots; y++)
    for (let x = 0; x < r.widthDots; x++)
      if (g[y * r.widthDots + x] < 160) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  return { x0, x1, y0, y1, w: r.widthDots, h: r.heightDots };
}

for (const h of [50, 30]) {
  const a = bounds(h, 0);
  const b = bounds(h, 3);
  assert.deepEqual(a, b, `border must not follow the content shift (50x${h})`);
  const o = td404BorderOuterDots(a.w, a.h, dpi);
  assert.equal(a.x0, o.x0);
  assert.equal(a.y0, o.y0);
  assert.equal(a.x1, o.x1 - 1);
  assert.equal(a.y1, o.y1 - 1);
}
// Centre logic: the four gaps to the die-cut are equal and 2 mm, for any label size.
import { TD404_BORDER_GAP_MM, TD404_BORDER_WIDTH_EXTRA_MM, TD404_DIECUT_CENTER_OFFSET_MM } from '@/lib/printer/print-spec';
for (const [wMm, hMm] of [[50, 50], [50, 30], [40, 25], [75, 50]] as const) {
  const W = mmToDots(wMm, dpi);
  const H = mmToDots(hMm, dpi);
  const o = td404BorderOuterDots(W, H, dpi);
  const extra = mmToDots(TD404_BORDER_WIDTH_EXTRA_MM, dpi);
  const cx = W / 2 + mmToDots(TD404_DIECUT_CENTER_OFFSET_MM.x, dpi);
  const cy = H / 2 + mmToDots(TD404_DIECUT_CENTER_OFFSET_MM.y, dpi);
  // The printed die-cut edge on the right is the nominal edge plus the extra width.
  const gaps = [o.x0 - (cx - W / 2), cx + W / 2 + extra - o.x1, o.y0 - (cy - H / 2), cy + H / 2 - o.y1];
  for (const g of gaps) assert.ok(Math.abs(g - mmToDots(TD404_BORDER_GAP_MM, dpi)) <= 1, `${wMm}x${hMm} gap ${g}`);
}
console.log('td404-edge-border ok');
