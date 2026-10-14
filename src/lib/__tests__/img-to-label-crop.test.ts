import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySourceCropToElementMm,
  cropFormatFromUri,
  cropNormToPixels,
  FULL_CROP,
  imageCropSaveOptions,
} from '@/lib/editor/image-crop-math';
import {
  clampLabelCropNorm,
  cropGrayByNorm,
  expandLabelCropNorm,
  findLabelCropNorm,
  renderImgToLabel,
  resolveOrientation,
} from '@/lib/img-to-label-engine';
import {
  fitLabelPdfCropTarget,
  fitLabelRasterDpi,
  isFullSourceCrop,
} from '@/lib/img-to-label-document';
import type { GrayRaster } from '@/lib/printer/escpos';
import { mmToDots } from '@/lib/printer/print-spec';

function makeGray(width: number, height: number, fill = 255): GrayRaster {
  return { width, height, gray: new Uint8Array(width * height).fill(fill) };
}

function mean(src: GrayRaster): number {
  let sum = 0;
  for (let i = 0; i < src.gray.length; i++) sum += src.gray[i];
  return sum / src.gray.length;
}

function firstInkX(src: GrayRaster, inkMax = 40): number {
  for (let x = 0; x < src.width; x++) {
    for (let y = 0; y < src.height; y++) {
      if (src.gray[y * src.width + x] < inkMax) return x;
    }
  }
  return -1;
}

const baseConfig = {
  dpi: 203,
  fitMode: 'contain' as const,
  orientation: 'portrait' as const,
  imageRotationDeg: 0 as const,
  hAlign: 'center' as const,
  vAlign: 'center' as const,
  trimBorder: false,
};

test('clampLabelCropNorm keeps the window on the page', () => {
  const crop = clampLabelCropNorm({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 });
  assert.ok(crop.x >= 0);
  assert.ok(crop.y >= 0);
  assert.ok(crop.x + crop.w <= 1 + 1e-9);
  assert.ok(crop.y + crop.h <= 1 + 1e-9);
});

test('findLabelCropNorm crops to the overall inked label', () => {
  const src = makeGray(100, 80, 255);
  for (let y = 20; y < 60; y++) {
    for (let x = 10; x < 70; x++) {
      src.gray[y * 100 + x] = 20;
    }
  }
  const crop = findLabelCropNorm(src);
  assert.ok(crop);
  assert.ok(Math.abs(crop.x - 0.1) < 0.02);
  assert.ok(Math.abs(crop.y - 0.25) < 0.02);
  assert.ok(Math.abs(crop.w - 0.6) < 0.03);
  assert.ok(Math.abs(crop.h - 0.5) < 0.03);
});

test('expandLabelCropNorm keeps QR quiet zone around the ink box', () => {
  const tight = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
  const expanded = expandLabelCropNorm(tight, 0.08);
  assert.ok(expanded.x < tight.x);
  assert.ok(expanded.y < tight.y);
  assert.ok(expanded.w > tight.w);
  assert.ok(expanded.h > tight.h);
  assert.ok(expanded.x >= 0);
  assert.ok(expanded.x + expanded.w <= 1 + 1e-9);
});

test('cropGrayByNorm applies the same window used for apply-to-all labels', () => {
  const src = makeGray(40, 20, 255);
  src.gray[5 * 40 + 8] = 0;
  const cropped = cropGrayByNorm(src, { x: 0.2, y: 0.25, w: 0.5, h: 0.5 });
  assert.equal(cropped.width, 20);
  assert.equal(cropped.height, 10);
});

test('renderImgToLabel uses the selected millimetre size for the print canvas', () => {
  const src = makeGray(16, 16, 32);
  const a = renderImgToLabel(src, { ...baseConfig, widthMm: 50, heightMm: 30 });
  const b = renderImgToLabel(src, { ...baseConfig, widthMm: 80, heightMm: 50 });
  assert.equal(a.widthMm, 50);
  assert.equal(a.heightMm, 30);
  assert.equal(a.widthPx, mmToDots(50, 203));
  assert.equal(a.heightPx, mmToDots(30, 203));
  assert.equal(b.widthPx, mmToDots(80, 203));
  assert.notEqual(a.widthPx, b.widthPx);
  assert.notEqual(a.heightPx, b.heightPx);
});

test('landscape orientation swaps the selected stock size', () => {
  const src = makeGray(16, 16, 32);
  const result = renderImgToLabel(src, {
    ...baseConfig,
    widthMm: 40,
    heightMm: 80,
    orientation: 'landscape',
  });
  assert.equal(result.widthMm, 80);
  assert.equal(result.heightMm, 40);
});

test('left and right alignment place ink on opposite sides', () => {
  const src = makeGray(8, 8, 0);
  const left = renderImgToLabel(src, {
    ...baseConfig,
    widthMm: 50,
    heightMm: 20,
    hAlign: 'left',
  });
  const right = renderImgToLabel(src, {
    ...baseConfig,
    widthMm: 50,
    heightMm: 20,
    hAlign: 'right',
  });
  const leftX = firstInkX(left.gray);
  const rightX = firstInkX(right.gray);
  assert.ok(leftX >= 0 && rightX >= 0);
  assert.ok(rightX > leftX + 10);
});

test('crop is applied in source space before rotation', () => {
  const src = makeGray(20, 10, 255);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) src.gray[y * 20 + x] = 0;
  }
  const result = renderImgToLabel(src, {
    ...baseConfig,
    widthMm: 25.4,
    heightMm: 25.4,
    fitMode: 'stretch',
    imageRotationDeg: 90,
    cropNorm: { x: 0, y: 0, w: 0.5, h: 1 },
  });
  assert.ok(mean(result.gray) < 12);
});

test('applySourceCropToElementMm maps the crop window onto the canvas object', () => {
  const next = applySourceCropToElementMm(
    { left: 10, top: 20, width: 80, height: 40 },
    { x: 0.25, y: 0.5, w: 0.5, h: 0.5 },
  );
  assert.equal(next.left, 30);
  assert.equal(next.top, 40);
  assert.equal(next.width, 40);
  assert.equal(next.height, 20);
  assert.deepEqual(
    applySourceCropToElementMm({ left: 0, top: 0, width: 50, height: 100 }, FULL_CROP),
    { left: 0, top: 0, width: 50, height: 100 },
  );
});

test('cropNormToPixels clamps edge crops to source bounds', () => {
  const edge = cropNormToPixels({ x: 0.9, y: 0.9, w: 0.4, h: 0.4 }, 100, 50);
  assert.equal(edge.originX, 90);
  assert.equal(edge.originY, 45);
  assert.equal(edge.width, 10);
  assert.equal(edge.height, 5);

  const full = cropNormToPixels({ x: 0, y: 0, w: 1, h: 1 }, 200, 100);
  assert.deepEqual(full, { originX: 0, originY: 0, width: 200, height: 100 });
});

test('Fit Label PNG crop does not change the in-editor JPEG default', () => {
  assert.deepEqual(imageCropSaveOptions(), { compress: 0.92, format: 'jpeg' });
  assert.deepEqual(imageCropSaveOptions('jpeg'), { compress: 0.92, format: 'jpeg' });
  assert.deepEqual(imageCropSaveOptions('png'), { compress: 1, format: 'png' });
  assert.equal(cropFormatFromUri('file:///a-print.png'), 'png');
  assert.equal(cropFormatFromUri('file:///photo.jpg'), 'jpeg');
});

test('isFullSourceCrop treats near-full windows as uncropped', () => {
  assert.equal(isFullSourceCrop(null), true);
  assert.equal(isFullSourceCrop({ x: 0, y: 0, w: 1, h: 1 }), true);
  assert.equal(isFullSourceCrop({ x: 0.2, y: 0.1, w: 0.5, h: 0.6 }), false);
});

test('fitLabelRasterDpi never drops below export DPI or the printer', () => {
  assert.equal(fitLabelRasterDpi(203), 300);
  assert.equal(fitLabelRasterDpi(304), 304);
  assert.equal(fitLabelRasterDpi(0), 300);
});

test('fitLabelPdfCropTarget passes the selected page index through', () => {
  const target = fitLabelPdfCropTarget('file:///invoice.pdf', 2, 203);
  assert.equal(target.uri, 'file:///invoice.pdf');
  assert.equal(target.pageIndex, 2);
  assert.equal(target.dpi, 300);
});

test('portrait and landscape swap the selected stock size', () => {
  const portrait = resolveOrientation(40, 80, 'portrait');
  const landscape = resolveOrientation(40, 80, 'landscape');
  assert.deepEqual(portrait, { widthMm: 40, heightMm: 80 });
  assert.deepEqual(landscape, { widthMm: 80, heightMm: 40 });
});
