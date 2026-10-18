import assert from 'node:assert/strict';
import type { LabelDocument, LabelOrientation } from '@/lib/label-document';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import {
  td404ContentShiftDots,
  td404EdgeBorderOptions,
  td404UserShiftDots,
} from '@/lib/printer/print-spec';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const dpi = 304;

function doc(): LabelDocument {
  return {
    id: 'rot',
    name: 'rot',
    widthMm: 50,
    heightMm: 30,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      { ...fullBleedBorderElement(50, 30), left: 2, top: 2, width: 46, height: 26, geometryVersion: 1 },
      {
        id: 'bar',
        type: 'shape',
        shapeType: 'rectangle',
        left: 8,
        top: 10,
        width: 10,
        height: 4,
        lineWidth: 0.5,
        fill: true,
        needPrinting: true,
        drawingColorIndex: 0,
      },
    ],
    updatedAt: 0,
  } as unknown as LabelDocument;
}

function render(rotationDeg: LabelOrientation, offsetMm = { x: 0, y: 0 }) {
  return rasterizeDocumentToBitmapTimed(doc(), dpi, {
    backend: 'dot-buffer',
    bakeTd404Feed: true,
    edgeBorders: td404EdgeBorderOptions(dpi),
    ...(rotationDeg === 0
      ? { shiftDots: td404ContentShiftDots(dpi, offsetMm) }
      : {
          rotationDeg,
          shiftDots: td404UserShiftDots(dpi, offsetMm),
          paperShiftDots: td404ContentShiftDots(dpi),
        }),
  });
}

/** Ink bounding box of the filled bar, searched inside the border. */
function bar(r: ReturnType<typeof render>, x0: number, y0: number, x1: number, y1: number) {
  const w = r.result.widthDots;
  let minX = w, minY = r.result.heightDots, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (r.gray[y * w + x] >= 160) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  return { minX, minY, maxX, maxY };
}

const r0 = render(0);
const r90 = render(90);
const r180 = render(180);
assert.equal(r0.result.heightDots, 360);
assert.equal(r90.result.heightDots, 600, '90° swaps the page');
assert.equal(r90.result.widthDots, 360);
assert.equal(r180.result.widthDots, r0.result.widthDots);
assert.equal(r180.result.heightDots, r0.result.heightDots);

// The border layer is in the paper frame: identical box at every angle.
const edgeRow = (r: ReturnType<typeof render>) => {
  const w = r.result.widthDots;
  const cols: number[] = [];
  const y = Math.round(r.result.heightDots / 2);
  for (let x = 0; x < w; x++) if (r.gray[y * w + x] < 160) cols.push(x);
  return { first: cols[0], last: cols[cols.length - 1] };
};
const e0 = edgeRow(r0);
assert.ok(e0.first > 0 && e0.last < r0.result.widthDots - 1);
const e180 = edgeRow(r180);
assert.equal(e180.first, e0.first, 'border does not rotate away from the die-cut');
assert.equal(e180.last, e0.last);

// 180°: the bar is point-mirrored about the label centre (elements follow the rotation).
const b0 = bar(r0, 80, 80, 540, 280);
const b180 = bar(r180, 80, 80, 540, 280);
assert.ok(b0.maxX > 0 && b180.maxX > 0);

// User offset moves the elements in the label's frame, then the turn carries it: +3 mm right
// at 180° moves the bar 3 mm left on paper, and the border does not move.
const off = render(180, { x: 3, y: 0 });
const bo = bar(off, 80, 80, 540, 280);
assert.equal(bo.minX, b180.minX - Math.round(3 * 12), 'offset +3 mm right at 180° lands 3 mm left on paper');
assert.equal(bo.minY, b180.minY);
const eo = edgeRow(off);
assert.equal(eo.first, e180.first, 'offset never moves the border');

// 90°: label +x (right) becomes paper +y (down).
const r90off = render(90, { x: 0, y: 2 });
const base90 = bar(r90, 80, 80, 280, 520);
const moved90 = bar(r90off, 80, 80, 280, 520);
assert.equal(moved90.minX, base90.minX - Math.round(2 * 12), 'label down at 90° is paper left');
assert.equal(moved90.minY, base90.minY);

// 90°: the border frames the whole turned paper (all four sides), not the un-turned box.
const ink = (r: ReturnType<typeof render>, x: number, y: number) => r.gray[y * r.result.widthDots + x] < 160;
assert.ok(ink(r90, 30, 300) && ink(r90, 335, 300), 'left and right border at 90°');
assert.ok(ink(r90, 180, 40) && ink(r90, 180, 584), 'top and bottom border at 90°');

console.log('td404 rotated raster ok');
