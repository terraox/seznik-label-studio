import assert from 'node:assert/strict';
import test from 'node:test';

import { createLabelDocument } from '@/lib/label-document';
import { buildModedPictureDocument } from '@/lib/printer/image-mode-document';
import { joshHeadlessRasterOptions } from '@/lib/printer/josh-print';
import {
  rectMmToDots,
  td404ContentShiftDots,
  td404EdgeBorderOptions,
} from '@/lib/printer/print-spec';
import { unpackMono1bppToGray } from '@/printing/raster/bit-packer';
import {
  hashGray,
  normalizeImageSettings,
  renderPageToMono,
  resampleGray,
  type ImageMode,
} from '@/printing/raster/image-modes';
import {
  packedPageDots,
  rasterizeDocumentToBitmap,
  type RasterizeOptions,
} from '@/printing/raster/skia-rasterizer';

const WIDTH_MM = 50;
const HEIGHT_MM = 30;
const SRC_W = 133;
const SRC_H = 97;

function photo() {
  const gray = new Uint8Array(SRC_W * SRC_H);
  for (let y = 0; y < SRC_H; y++) {
    for (let x = 0; x < SRC_W; x++) {
      gray[y * SRC_W + x] = Math.round(255 * (0.5 + 0.5 * Math.sin(x / 9) * Math.cos(y / 7)));
    }
  }
  return { width: SRC_W, height: SRC_H, gray };
}

/** Dots the bridge would be handed, found by unpacking the exact bytes the manager forwards. */
function handedToBridge(mode: ImageMode, dpi: number, options: RasterizeOptions) {
  const doc = buildModedPictureDocument(
    { gray: photo(), widthMm: WIDTH_MM, heightMm: HEIGHT_MM, settings: normalizeImageSettings({ mode }) },
    dpi,
  );
  const bitmap = rasterizeDocumentToBitmap(doc, dpi, { threshold: 160, backend: 'dot-buffer', ...options });
  return {
    bitmap,
    page: unpackMono1bppToGray(bitmap.mono1bppBuffer, bitmap.widthDots, bitmap.heightDots, bitmap.bytesPerRow),
  };
}

/** The same dots made straight from the pipeline, with no raster in between. */
function expectedDots(mode: ImageMode, dpi: number) {
  const box = rectMmToDots(0, 0, WIDTH_MM, HEIGHT_MM, dpi);
  const w = box.widthDots;
  const h = box.heightDots;
  const p = photo();
  return {
    w,
    h,
    mono: renderPageToMono(resampleGray(p.gray, p.width, p.height, w, h), w, h, normalizeImageSettings({ mode })),
  };
}

function assertTileInPage(
  page: Uint8Array,
  pageW: number,
  tile: { w: number; h: number; mono: Uint8Array },
  shift: { x: number; y: number },
  limitW: number,
  label: string,
) {
  let compared = 0;
  for (let y = 0; y < tile.h; y++) {
    for (let x = 0; x < tile.w; x++) {
      const px = x + shift.x;
      const py = y + shift.y;
      if (px < 0 || py < 0 || px >= limitW || py >= page.length / pageW) continue;
      assert.equal(page[py * pageW + px], tile.mono[y * tile.w + x], `${label} dot ${x},${y}`);
      compared++;
    }
  }
  assert.ok(compared > tile.w * tile.h * 0.9, `${label}: most of the picture was checked (${compared})`);
}

for (const mode of ['solid', 'floyd', 'atkinson', 'ordered'] as ImageMode[]) {
  test(`TD-404: the TSPL bitmap payload equals the ${mode} dots`, () => {
    const dpi = 304;
    const shift = td404ContentShiftDots(dpi, { x: 0, y: 0 });
    const { bitmap, page } = handedToBridge(mode, dpi, {
      darknessSteps: 0,
      bakeTd404Feed: true,
      edgeBorders: td404EdgeBorderOptions(dpi),
      pageWidthPack: 'floor',
      shiftDots: shift,
    });
    const want = expectedDots(mode, dpi);
    const packed = packedPageDots(WIDTH_MM, HEIGHT_MM, dpi, 'floor');
    assertTileInPage(page, bitmap.widthDots, want, shift, Math.min(bitmap.widthDots, packed.packedW), `td404 ${mode}`);
  });

  test(`Josh: the bitmap passed to print equals the ${mode} dots`, () => {
    const dpi = 304;
    const options = joshHeadlessRasterOptions(dpi, 0, 0, { darknessSteps: 0 });
    const { bitmap, page } = handedToBridge(mode, dpi, options);
    const want = expectedDots(mode, dpi);
    const sizeW = packedPageDots(WIDTH_MM, HEIGHT_MM, dpi, 'ceil').sizeDotsW;
    assertTileInPage(page, bitmap.widthDots, want, options.shiftDots ?? { x: 0, y: 0 }, Math.min(bitmap.widthDots, sizeW), `josh ${mode}`);
  });
}

test('same input and settings give the same bytes every time', () => {
  const a = handedToBridge('floyd', 304, { pageWidthPack: 'floor' });
  const b = handedToBridge('floyd', 304, { pageWidthPack: 'floor' });
  assert.equal(hashGray(a.bitmap.mono1bppBuffer), hashGray(b.bitmap.mono1bppBuffer));
});

test('a picture document is a normal single-image label', () => {
  const doc = buildModedPictureDocument(
    { gray: photo(), widthMm: WIDTH_MM, heightMm: HEIGHT_MM, settings: normalizeImageSettings({ mode: 'ordered' }) },
    203,
  );
  assert.equal(doc.elements.length, 1);
  assert.equal(doc.elements[0].type, 'image');
  assert.ok(createLabelDocument);
});
