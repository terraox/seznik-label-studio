import assert from 'node:assert/strict';
import type { LabelDocument } from '@/lib/label-document';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import {
  mmToDots,
  TD404_ELEMENT_SHIFT_H_MM,
  TD404_ELEMENT_SHIFT_V_MM,
  td404ContentShiftDots,
  td404EdgeBorderOptions,
} from '@/lib/printer/print-spec';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const dpi = 304;

function doc(): LabelDocument {
  return {
    id: 'shift',
    name: 'shift',
    widthMm: 50,
    heightMm: 30,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      {
        ...fullBleedBorderElement(50, 30),
        left: 2,
        top: 2,
        width: 46,
        height: 26,
        geometryVersion: 1,
      },
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

function inkBox(gray: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (gray[y * w + x] >= 160) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function render(shift: boolean) {
  return rasterizeDocumentToBitmapTimed(doc(), dpi, {
    backend: 'dot-buffer',
    bakeTd404Feed: true,
    edgeBorders: td404EdgeBorderOptions(dpi),
    shiftDots: shift ? td404ContentShiftDots(dpi) : undefined,
  });
}

const still = render(false);
const moved = render(true);
const w = still.result.widthDots;
const h = still.result.heightDots;
const borderStill = inkBox(still.gray, w, h, 0, 0, w, h);
const borderMoved = inkBox(moved.gray, w, h, 0, 0, w, h);
assert.equal(borderMoved.minX, borderStill.minX, 'border left stays');
assert.equal(borderMoved.maxX, borderStill.maxX, 'border right stays');
assert.equal(borderMoved.minY, borderStill.minY, 'border top stays');
assert.equal(borderMoved.maxY, borderStill.maxY, 'border bottom stays');

const dx = mmToDots(TD404_ELEMENT_SHIFT_H_MM, dpi);
const dy = mmToDots(TD404_ELEMENT_SHIFT_V_MM, dpi);
const mid = { x0: mmToDots(10, dpi), y0: mmToDots(7, dpi), x1: mmToDots(40, dpi), y1: mmToDots(23, dpi) };
const shapeStill = inkBox(still.gray, w, h, mid.x0, mid.y0, mid.x1, mid.y1);
const shapeMoved = inkBox(moved.gray, w, h, mid.x0 + dx, mid.y0 + dy, mid.x1 + dx, mid.y1 + dy);
assert.equal(shapeMoved.minX - shapeStill.minX, dx, 'element moves by the horizontal shift');
assert.equal(shapeMoved.minY - shapeStill.minY, dy, 'element moves by the vertical shift');

console.log('ok td404 element shift');
