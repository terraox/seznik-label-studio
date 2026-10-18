import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import { createLabelDocument, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { rectMmToDots } from '@/lib/printer/print-spec';
import { packGrayToMono1bpp } from '@/printing/raster/bit-packer';
import {
  hashGray,
  normalizeImageSettings,
  renderImageToMono,
  type ImageMode,
} from '@/printing/raster/image-modes';
import {
  clearImageTiles,
  hasImageTiles,
  prepareImageTiles,
  setImageTileDecoder,
} from '@/printing/raster/image-tiles';
import {
  assertHeadlessRasterDocument,
  canHeadlessRasterPrint,
  packedPageDots,
  rasterizeDocumentToBitmap,
} from '@/printing/raster/skia-rasterizer';

const DPI = 304;
const SRC_W = 90;
const SRC_H = 60;

function photo(): Uint8Array {
  const g = new Uint8Array(SRC_W * SRC_H);
  for (let y = 0; y < SRC_H; y++) {
    for (let x = 0; x < SRC_W; x++) g[y * SRC_W + x] = Math.round(((x + y) / (SRC_W + SRC_H - 2)) * 255);
  }
  return g;
}

function imageDoc(extra: Record<string, unknown>): LabelDocument {
  const el = {
    id: 'img-1',
    type: 'image',
    ...DEFAULT_ELEMENT_STATE,
    uri: 'file:///photo.png',
    rotation: 0,
    left: 4,
    top: 3,
    width: 30,
    height: 20,
    lockMovement: false,
    needPrinting: true,
    antiColor: false,
    contentFit: 'fill',
    ...extra,
  } as unknown as LabelElement;
  return createLabelDocument({ name: 'img', widthMm: 50, heightMm: 30, elements: [el] });
}

function raster(doc: LabelDocument) {
  return rasterizeDocumentToBitmap(doc, DPI, { threshold: 160, backend: 'dot-buffer' });
}

/** The page the rasterizer must produce, built without it: white, tile copied at the box. */
function expectedBytes(doc: LabelDocument, mode: ImageMode) {
  const el = doc.elements[0] as Extract<LabelElement, { type: 'image' }>;
  const page = packedPageDots(doc.widthMm, doc.heightMm, DPI, 'floor');
  const box = rectMmToDots(el.left, el.top, el.width, el.height, DPI);
  const tile = renderImageToMono({
    gray: photo(),
    width: SRC_W,
    height: SRC_H,
    destWidth: box.widthDots,
    destHeight: box.heightDots,
    settings: normalizeImageSettings({ mode }),
  });
  const gray = new Uint8Array(page.packedW * page.packedH).fill(255);
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) gray[(box.y0 + y) * page.packedW + box.x0 + x] = tile.gray[y * tile.width + x];
  }
  return { packed: packGrayToMono1bpp(gray, page.packedW, page.packedH, 160), tile };
}

test('a moded image is unsupported until its dots are prepared, then headless can print it', async () => {
  clearImageTiles();
  setImageTileDecoder(async () => ({ gray: photo(), width: SRC_W, height: SRC_H }));
  const doc = imageDoc({ imageMode: 'floyd' });
  assert.equal(canHeadlessRasterPrint(doc), false);
  assert.throws(() => assertHeadlessRasterDocument(doc));
  await prepareImageTiles(doc, DPI);
  assert.equal(hasImageTiles(doc, DPI), true);
  assert.equal(canHeadlessRasterPrint(doc), true);
  assertHeadlessRasterDocument(doc);
});

test('bytes handed to the bridge equal the dithered pixels, for every mode', async () => {
  for (const mode of ['solid', 'floyd', 'atkinson', 'ordered'] as ImageMode[]) {
    clearImageTiles();
    setImageTileDecoder(async () => ({ gray: photo(), width: SRC_W, height: SRC_H }));
    const doc = imageDoc({ imageMode: mode });
    await prepareImageTiles(doc, DPI);
    const got = raster(doc);
    const want = expectedBytes(doc, mode);
    assert.equal(got.bytesPerRow, want.packed.bytesPerRow, mode);
    assert.equal(hashGray(got.mono1bppBuffer), hashGray(want.packed.mono1bppBuffer), mode);
    // Same input, same bytes.
    assert.equal(hashGray(raster(doc).mono1bppBuffer), hashGray(got.mono1bppBuffer), `${mode} repeat`);
  }
});

test('dither modes really differ from solid on a photo', async () => {
  const hashes = new Set<string>();
  for (const mode of ['solid', 'floyd', 'atkinson', 'ordered'] as ImageMode[]) {
    clearImageTiles();
    setImageTileDecoder(async () => ({ gray: photo(), width: SRC_W, height: SRC_H }));
    const doc = imageDoc({ imageMode: mode });
    await prepareImageTiles(doc, DPI);
    hashes.add(hashGray(raster(doc).mono1bppBuffer));
  }
  assert.equal(hashes.size, 4);
});

test('an image with no new fields still takes the old path and is not drawn headless', async () => {
  clearImageTiles();
  setImageTileDecoder(async () => ({ gray: photo(), width: SRC_W, height: SRC_H }));
  const legacy = imageDoc({ colorMode: 'Halftone', grayThreshold: 140 });
  await prepareImageTiles(legacy, DPI);
  assert.equal(canHeadlessRasterPrint(legacy), false);
  assert.throws(() => raster(legacy));
});

test('an undecodable image gets no tile and falls back to the old path', async () => {
  clearImageTiles();
  setImageTileDecoder(async () => null);
  const doc = imageDoc({ imageMode: 'floyd', uri: 'file:///missing.png' });
  await prepareImageTiles(doc, DPI);
  assert.equal(canHeadlessRasterPrint(doc), false);
});

test('changing a setting invalidates the prepared dots', async () => {
  clearImageTiles();
  setImageTileDecoder(async () => ({ gray: photo(), width: SRC_W, height: SRC_H }));
  const doc = imageDoc({ imageMode: 'floyd' });
  await prepareImageTiles(doc, DPI);
  const changed = imageDoc({ imageMode: 'floyd', brightness: 20 });
  (changed.elements[0] as { id: string }).id = 'img-1';
  assert.equal(hasImageTiles(changed, DPI), false);
});

test('a rotated image is turned before dithering and still lands on the page', async () => {
  clearImageTiles();
  setImageTileDecoder(async () => ({ gray: photo(), width: SRC_W, height: SRC_H }));
  const doc = imageDoc({ imageMode: 'floyd', rotation: 90, left: 10, top: 3, width: 20, height: 20 });
  await prepareImageTiles(doc, DPI);
  const got = raster(doc);
  assert.ok(got.mono1bppBuffer.some((b) => b !== 0));
});
