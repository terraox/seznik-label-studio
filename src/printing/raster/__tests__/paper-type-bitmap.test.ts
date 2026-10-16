import assert from 'node:assert/strict';
import test from 'node:test';

import type { LabelDocument, PaperType } from '@/lib/label-document';
import { rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';

const dpi = 203;
const types: PaperType[] = ['Label', 'Receipt', 'Black mark', 'Cardstock', 'Transparent'];

function doc(paperType: PaperType): LabelDocument {
  return {
    id: 'paper-type-bitmap',
    name: paperType === 'Label' ? 'black mark sample' : paperType,
    widthMm: 50,
    heightMm: 30,
    orientation: 0,
    paperType,
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      {
        id: 'bar',
        type: 'shape',
        shapeType: 'rectangle',
        left: 8,
        top: 8,
        width: 12,
        height: 6,
        lineWidth: 0.4,
        fill: true,
        needPrinting: true,
        drawingColorIndex: 0,
      },
    ],
    updatedAt: 0,
  } as unknown as LabelDocument;
}

test('paper type does not change the packed print bitmap', () => {
  const bitmaps = types.map((paperType) => rasterizeDocumentToBitmap(doc(paperType), dpi, { backend: 'dot-buffer' }));
  const first = bitmaps[0];
  for (const bitmap of bitmaps.slice(1)) {
    assert.equal(bitmap.widthDots, first.widthDots);
    assert.equal(bitmap.heightDots, first.heightDots);
    assert.equal(bitmap.bytesPerRow, first.bytesPerRow);
    assert.equal(bitmap.mono1bppBuffer.length, first.mono1bppBuffer.length);
    assert.equal(Buffer.from(bitmap.mono1bppBuffer).equals(Buffer.from(first.mono1bppBuffer)), true);
  }
});
