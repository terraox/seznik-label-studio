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
  calcPrintCanvas,
  renderImgToLabel,
  resolveOrientation,
} from '@/lib/img-to-label-engine';
import {
  buildFitLabelDocument,
  fitLabelPdfCropTarget,
  fitLabelRasterDpi,
  isFullSourceCrop,
} from '@/lib/img-to-label-document';
import {
  detectFitLabelCrop,
  fitLabelPrintCanCopyBytes,
  isFitLabelCropCertain,
  verifyFitLabelExtract,
} from '@/lib/img-to-label-extract';
import {
  buildFitLabelPrintPayload,
  fitGrayToPrintCanvas,
  fitLabelDecodeMaxEdgePx,
  fitLabelPrintSourceUri,
  isFitLabelImageOnlyDocument,
  rasterFitLabelGray,
} from '@/lib/img-to-label-print';
import type { GrayRaster } from '@/lib/printer/escpos';
import { resolvePrintQuality } from '@/lib/printer/print-quality';
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

test('verifyFitLabelExtract accepts matching crop pixels and rejects mismatches', () => {
  const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
  const ok = verifyFitLabelExtract({
    sourceWidth: 200,
    sourceHeight: 100,
    crop,
    extractWidth: 100,
    extractHeight: 40,
  });
  assert.equal(ok.ok, true);

  const size = verifyFitLabelExtract({
    sourceWidth: 200,
    sourceHeight: 100,
    crop,
    extractWidth: 80,
    extractHeight: 40,
  });
  assert.equal(size.ok, false);
  assert.equal(size.reason, 'size');

  const swapped = verifyFitLabelExtract({
    sourceWidth: 200,
    sourceHeight: 100,
    crop: { x: 0, y: 0, w: 1, h: 0.4 },
    extractWidth: 40,
    extractHeight: 200,
  });
  assert.equal(swapped.ok, false);
  assert.ok(swapped.reason === 'aspect' || swapped.reason === 'orientation' || swapped.reason === 'size');
});

test('full-frame PNG print master can copy bytes without re-encoding', () => {
  assert.equal(fitLabelPrintCanCopyBytes('file:///label.png', { x: 0, y: 0, w: 1, h: 1 }), true);
  assert.equal(fitLabelPrintCanCopyBytes('file:///label.jpg', { x: 0, y: 0, w: 1, h: 1 }), false);
  assert.equal(fitLabelPrintCanCopyBytes('file:///label.png', { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }), false);
});

test('tiny detected ink is not a certain Fit Label crop', () => {
  assert.equal(isFitLabelCropCertain({ x: 0.4, y: 0.4, w: 0.05, h: 0.05 }), false);
  assert.equal(isFitLabelCropCertain({ x: 0.1, y: 0.1, w: 0.7, h: 0.7 }), true);
});

test('detectFitLabelCrop pads ink and stays on the page', () => {
  const src = makeGray(100, 80, 255);
  for (let y = 20; y < 60; y++) {
    for (let x = 10; x < 70; x++) src.gray[y * 100 + x] = 20;
  }
  const detected = detectFitLabelCrop(src);
  assert.equal(detected.certain, true);
  assert.ok(detected.crop.x < 0.1);
  assert.ok(detected.crop.y < 0.25);
  assert.ok(detected.crop.x + detected.crop.w <= 1 + 1e-9);
});

test('Fit Label print helper uses printUri and stock millimetres, not the preview', () => {
  const doc = buildFitLabelDocument({
    widthMm: 100,
    heightMm: 150,
    ingested: {
      previewUri: 'file:///preview.jpg',
      printUri: 'file:///print.png',
      widthPx: 400,
      heightPx: 600,
      workingWidthPx: 200,
      workingHeightPx: 300,
      originalAspect: 400 / 600,
    },
    fitMode: 'contain',
  });
  assert.equal(isFitLabelImageOnlyDocument(doc), true);
  const el = doc.elements[0];
  assert.equal(el?.type, 'image');
  if (el?.type === 'image') {
    assert.equal(fitLabelPrintSourceUri(el), 'file:///print.png');
    assert.notEqual(el.uri, el.printUri);
  }

  const src = makeGray(40, 60, 32);
  const rendered = rasterFitLabelGray(src, doc, 203);
  assert.equal(rendered.widthMm, 100);
  assert.equal(rendered.heightMm, 150);
  assert.equal(rendered.widthPx, mmToDots(100, 203));
  assert.equal(rendered.heightPx, mmToDots(150, 203));
});

test('Fit Label contain nearest-upscales a small extract onto the selected stock', () => {
  const src = makeGray(12, 8, 0);
  const fitted = fitGrayToPrintCanvas(src, 80, 60, 'contain');
  assert.equal(fitted.width, 80);
  assert.equal(fitted.height, 60);
  const scale = Math.min(80 / 12, 60 / 8);
  const dh = Math.max(1, Math.round(8 * scale));
  const oy = Math.floor((60 - dh) / 2);
  assert.equal(fitted.gray[0], 255);
  assert.equal(fitted.gray[oy * 80], 0);
  assert.equal(fitted.gray[(oy + dh - 1) * 80 + 79], 0);
  assert.ok(dh > 8);
});

test('integer box-average of 1D bars stays 0/255 with no mid-gray smear', () => {
  const src = makeGray(40, 16, 255);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 40; x++) {
      if (Math.floor(x / 2) % 2 === 0) src.gray[y * 40 + x] = 0;
    }
  }
  const fitted = fitGrayToPrintCanvas(src, 20, 8, 'contain');
  assert.equal(fitted.width, 20);
  assert.equal(fitted.height, 8);
  for (let i = 0; i < fitted.gray.length; i++) {
    assert.ok(fitted.gray[i] === 0 || fitted.gray[i] === 255, `mid-gray ${fitted.gray[i]} at ${i}`);
  }
  assert.equal(fitted.gray[0], 0);
  assert.equal(fitted.gray[1], 255);
});

test('Fit Label print payload rotates then packs TSPL width down', () => {
  const doc = buildFitLabelDocument({
    widthMm: 40,
    heightMm: 30,
    ingested: {
      previewUri: 'file:///preview.jpg',
      printUri: 'file:///print.png',
      widthPx: 200,
      heightPx: 150,
      workingWidthPx: 200,
      workingHeightPx: 150,
      originalAspect: 200 / 150,
    },
    fitMode: 'contain',
  });
  const src = makeGray(200, 150, 32);
  const payload = buildFitLabelPrintPayload(src, doc, {
    dpi: 203,
    threshold: 160,
    orientationDeg: 90,
  });
  assert.equal(payload.widthMm, 30);
  assert.equal(payload.heightMm, 40);
  assert.equal(payload.gray.width, mmToDots(30, 203));
  assert.equal(payload.gray.height, mmToDots(40, 203));
  assert.equal(payload.sizeDotsW, mmToDots(30, 203));
  assert.equal(payload.sizeDotsH, mmToDots(40, 203));
  assert.equal(payload.widthDots % 8, 0);
  assert.equal(payload.widthDots, payload.bytesPerRow * 8);
  assert.equal(payload.widthDots, Math.max(8, Math.floor(payload.sizeDotsW / 8) * 8));
  assert.equal(payload.bits.data.length, payload.bytesPerRow * payload.heightDots);
  assert.equal(payload.gray.gray.every((v) => v === 0 || v === 255), true);
});

test('Fit Label darkness threshold puts more ink when raised, without dither', () => {
  const doc = buildFitLabelDocument({
    widthMm: 40,
    heightMm: 30,
    ingested: {
      previewUri: 'file:///preview.jpg',
      printUri: 'file:///print.png',
      widthPx: 40,
      heightPx: 30,
      workingWidthPx: 40,
      workingHeightPx: 30,
      originalAspect: 40 / 30,
    },
    fitMode: 'contain',
  });
  const src = makeGray(40, 30, 180);
  for (let i = 0; i < src.gray.length; i += 2) src.gray[i] = 80;
  const light = buildFitLabelPrintPayload(src, doc, {
    dpi: 203,
    threshold: 120,
    orientationDeg: 0,
  });
  const dark = buildFitLabelPrintPayload(src, doc, {
    dpi: 203,
    threshold: 200,
    orientationDeg: 0,
  });
  const ink = (gray: Uint8Array) => {
    let n = 0;
    for (let i = 0; i < gray.length; i++) if (gray[i] === 0) n += 1;
    return n;
  };
  assert.ok(ink(dark.gray.gray) > ink(light.gray.gray));
  assert.equal(light.gray.gray.every((v) => v === 0 || v === 255), true);
  assert.equal(dark.gray.gray.every((v) => v === 0 || v === 255), true);
});

test('Fit Label Auto quality matches resolvePrintQuality (no hardcoded speed 4)', () => {
  const auto = resolvePrintQuality({ darkness: null, speed: null, grayThreshold: 160 });
  assert.equal(auto.speed, 3);
  assert.equal(auto.threshold, 160);
  assert.equal(auto.density, 10);
  assert.equal(auto.dither, false);
  const darker = resolvePrintQuality({ darkness: 12, speed: null, grayThreshold: 160 });
  assert.equal(darker.speed, 3);
  assert.equal(darker.density, 12);
  assert.ok(darker.threshold > auto.threshold);
});

test('fitLabelDecodeMaxEdgePx is 2× the SIZE long edge so JS decode stays bounded', () => {
  const canvas = calcPrintCanvas(101.6, 152.4, 203);
  const maxEdge = fitLabelDecodeMaxEdgePx(101.6, 152.4, 203);
  assert.equal(maxEdge, Math.max(canvas.widthPx, canvas.heightPx) * 2);
  assert.ok(maxEdge < 4000);
});

test('adding another printable element leaves Fit Label ViewShot fallback', () => {
  const doc = buildFitLabelDocument({
    widthMm: 50,
    heightMm: 30,
    ingested: {
      previewUri: 'file:///preview.jpg',
      printUri: 'file:///print.png',
      widthPx: 100,
      heightPx: 60,
      workingWidthPx: 100,
      workingHeightPx: 60,
      originalAspect: 100 / 60,
    },
    fitMode: 'contain',
  });
  const image = doc.elements[0];
  assert.ok(image && image.type === 'image');
  doc.elements.push({ ...image, id: 'img-2' });
  assert.equal(isFitLabelImageOnlyDocument(doc), false);
});
