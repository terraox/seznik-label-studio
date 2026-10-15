import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import { createLabelDocument, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { withReferenceImage } from '@/lib/reference-image';
import { canHeadlessRasterPrint, rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';

const DPI = 304;

function textDocument(needPrinting: boolean): LabelDocument {
  const text: LabelElement = {
    id: 'guide-text',
    type: 'text',
    ...DEFAULT_ELEMENT_STATE,
    text: 'Hello',
    left: 3,
    top: 3,
    width: 40,
    height: 8,
    fontSize: 12,
    needPrinting,
  };
  return createLabelDocument({
    name: 'Reference guide',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [text],
  });
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function raster(doc: LabelDocument) {
  return rasterizeDocumentToBitmap(doc, DPI, { threshold: 160, backend: 'dot-buffer' });
}

test('a reference image does not change the packed print bitmap', () => {
  const plain = textDocument(true);
  const guided = withReferenceImage(plain, {
    fileName: 'ref_guide.png',
    widthPx: 2048,
    heightPx: 1024,
  });
  const without = raster(plain);
  const withImage = raster(guided);
  assert.equal(withImage.widthDots, without.widthDots);
  assert.equal(withImage.heightDots, without.heightDots);
  assert.equal(withImage.bytesPerRow, without.bytesPerRow);
  assert.equal(sameBytes(withImage.mono1bppBuffer, without.mono1bppBuffer), true);

  const hidden = textDocument(false);
  const hiddenGuided = withReferenceImage(hidden, {
    fileName: 'ref_guide.png',
    widthPx: 2048,
    heightPx: 1024,
  });
  const hiddenRaster = raster(hidden);
  const hiddenGuidedRaster = raster(hiddenGuided);
  assert.equal(sameBytes(hiddenRaster.mono1bppBuffer, hiddenGuidedRaster.mono1bppBuffer), true);
  assert.equal(sameBytes(hiddenRaster.mono1bppBuffer, without.mono1bppBuffer), false);
  assert.equal(canHeadlessRasterPrint(guided), true);
  assert.equal(
    canHeadlessRasterPrint(
      withReferenceImage(plain, {
        fileName: 'ref_guide.png',
        widthPx: 2048,
        heightPx: 1024,
        needPrinting: true,
      }),
    ),
    false,
  );
});
