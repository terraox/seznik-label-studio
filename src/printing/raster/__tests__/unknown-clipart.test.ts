import assert from 'node:assert/strict';
import test from 'node:test';

import type { LabelDocument, LabelElement } from '@/lib/label-document';

// The clipart library pulls in app stores that Node does not have. Give the rasterizer a tiny stand-in
// with one known SVG sticker, one known picture sticker and nothing else.
const libPath = require.resolve('@/constants/clipart-library');
require.cache[libPath] = {
  id: libPath,
  filename: libPath,
  loaded: true,
  exports: {
    getClipartById: (id: string) => {
      if (id === 'known-svg') {
        return { id, label: 'k', category: 'shapes', source: 'builtin', svg: '<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>' };
      }
      if (id === 'known-picture') {
        return { id, label: 'p', category: 'local', source: 'user', kind: 'image', fileUri: 'file:///x.png' };
      }
      return undefined;
    },
  },
} as never;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const raster = require('@/printing/raster/skia-rasterizer') as typeof import('@/printing/raster/skia-rasterizer');

const shape = {
  id: 's', type: 'shape', figureShape: 'rectangle', fill: true, lineWidth: 0.5, roundRadius: 0, rotation: 0,
  left: 3, top: 3, width: 12, height: 8, lockMovement: false, needPrinting: true, drawingColorIndex: 1,
} as unknown as LabelElement;

const clip = (clipartId: string, extra: Record<string, unknown> = {}) =>
  ({
    id: `c-${clipartId}`, type: 'clipart', clipartId, rotation: 0, left: 25, top: 5, width: 14, height: 14,
    lockMovement: false, needPrinting: true, drawingColorIndex: 1, ...extra,
  }) as unknown as LabelElement;

const doc = (elements: LabelElement[]): LabelDocument =>
  ({
    id: 'd', name: 'd', widthMm: 50, heightMm: 30, orientation: 0, paperType: 'Label', mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' }, elements, groupId: null, createdAt: 1, updatedAt: 1,
  }) as unknown as LabelDocument;

const bits = (d: LabelDocument) => Buffer.from(raster.rasterizeDocumentToBitmap(d, 203, { backend: 'dot-buffer' }).mono1bppBuffer).toString('base64');

test('unknown clipart id: the label still takes the fast path and does not throw', () => {
  const d = doc([shape, clip('from-a-newer-app')]);
  assert.equal(raster.canHeadlessRasterPrint(d), true);
  assert.doesNotThrow(() => raster.assertHeadlessRasterDocument(d));
  assert.doesNotThrow(() => bits(d));
});

test('unknown clipart id draws nothing and the rest of the label prints exactly as without it', () => {
  assert.equal(bits(doc([shape, clip('from-a-newer-app')])), bits(doc([shape])));
  assert.equal(bits(doc([shape, clip('x', { tile: true })])), bits(doc([shape])), 'tiled unknown too');
});

test('a known SVG sticker is still a headless element (drawing it needs the Skia surface, not the Node dot buffer)', () => {
  assert.equal(raster.canHeadlessRasterPrint(doc([shape, clip('known-svg')])), true);
  assert.throws(() => bits(doc([shape, clip('known-svg')])), /Unsupported print element type: clipart/);
});

test('a known picture sticker is unchanged: it still needs the capture path', () => {
  const d = doc([shape, clip('known-picture')]);
  assert.equal(raster.canHeadlessRasterPrint(d), false);
  assert.throws(() => raster.assertHeadlessRasterDocument(d), /Unsupported print element type: clipart/);
});
