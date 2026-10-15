import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClonedLabel,
  canBuildClonedLabel,
  detectionHasOutline,
  isCodePayloadText,
  mapPxBoxToMm,
  stripCodePayload,
} from '@/lib/label-clone/build-cloned-label';
import { cloneSourceRect, normalizeScannerBox } from '@/lib/label-clone/geometry';
import { canHeadlessRasterPrint } from '@/printing/raster/skia-rasterizer';
import type { CloneDetection } from '@/lib/label-clone/types';

const flipkartDetection: CloneDetection = {
  imageWidth: 800,
  imageHeight: 1200,
  codes: [
    {
      kind: 'qr',
      type: 'qr',
      data: 'https://www.flipkart.com/awb/FMPC5998822818',
      box: { x: 0.62, y: 0.07, w: 0.3, h: 0.2 },
    },
    {
      kind: 'barcode',
      type: 'code128',
      data: 'FMPC5998822818',
      box: { x: 0.08, y: 0.12, w: 0.1, h: 0.34 },
    },
  ],
  lines: [
    { text: 'Flipkart', frame: { left: 80, top: 24, width: 220, height: 30 } },
    { text: 'Name: Nandhini', frame: { left: 40, top: 430, width: 480, height: 22 } },
    { text: 'FMPC5998822818', frame: { left: 60, top: 160, width: 70, height: 360 } },
    { text: 'Tiruppur District - 642205', frame: { left: 40, top: 520, width: 500, height: 20 } },
  ],
};

test('maps OCR pixel frames onto millimetre stock', () => {
  const box = mapPxBoxToMm({ left: 80, top: 120, width: 400, height: 40 }, 800, 1200, 100, 150);
  assert.equal(box.left, 10);
  assert.equal(box.top, 15);
  assert.equal(box.width, 50);
  assert.equal(box.height, 5);
});

test('skips OCR lines that repeat barcode or QR payloads', () => {
  assert.equal(isCodePayloadText('FMPC5998822818', ['FMPC5998822818']), true);
  assert.equal(isCodePayloadText('AWB No. FMPC5998822818', ['FMPC5998822818']), false);
  assert.equal(stripCodePayload('AWB No. FMPC5998822818', ['FMPC5998822818']), 'AWB No.');
  assert.equal(isCodePayloadText('Name: Nandhini', ['FMPC5998822818']), false);
});

test('empty detection cannot rebuild a label', () => {
  assert.equal(canBuildClonedLabel({ codes: [], lines: [] }), false);
  assert.equal(buildClonedLabel({ imageWidth: 800, imageHeight: 1200, codes: [], lines: [] }, { widthMm: 101.6, heightMm: 152.4 }), null);
});

test('QR, vertical barcode, and address lines become a native no-image document', () => {
  const doc = buildClonedLabel(flipkartDetection, { widthMm: 101.6, heightMm: 152.4 });

  assert.ok(doc);
  assert.equal(doc.elements.some((el) => el.type === 'image'), false);
  assert.equal(canHeadlessRasterPrint(doc), true);
  assert.ok(Math.abs(doc.widthMm - 101.6) < 0.2);
  assert.ok(Math.abs(doc.heightMm - 152.4) < 0.2);

  const texts = doc.elements.filter((el) => el.type === 'text').map((el) => el.text);
  assert.ok(texts.includes('Flipkart'));
  assert.ok(texts.includes('Name: Nandhini'));
  assert.equal(texts.some((t) => t.includes('FMPC5998822818')), false);

  const qrs = doc.elements.filter((el) => el.type === 'qrcode');
  assert.equal(qrs.length, 1);
  const qr = qrs[0];
  assert.ok(qr && qr.left > 50);
  assert.ok(qr && qr.top < 40);
  const barcodes = doc.elements.filter((el) => el.type === 'barcode');
  assert.ok(barcodes.length >= 1);
  const vertical = barcodes.find((el) => el.type === 'barcode' && el.rotation === 90);
  assert.ok(vertical);
});

test('full-frame OCR adds a border element', () => {
  const detection = {
    imageWidth: 800,
    imageHeight: 1200,
    codes: [{ kind: 'qr' as const, type: 'qr', data: 'https://example.com/label' }],
    lines: [
      { text: 'TOP', frame: { left: 20, top: 20, width: 760, height: 24 } },
      { text: 'LEFT', frame: { left: 16, top: 200, width: 80, height: 20 } },
      { text: 'RIGHT', frame: { left: 700, top: 200, width: 80, height: 20 } },
      { text: 'BOTTOM', frame: { left: 20, top: 1140, width: 760, height: 24 } },
    ],
  };
  assert.equal(detectionHasOutline(detection), true);
  const doc = buildClonedLabel(detection, { widthMm: 50, heightMm: 80, lockSize: true });
  assert.ok(doc);
  assert.equal(doc.widthMm, 50);
  assert.equal(doc.elements.some((el) => el.type === 'border'), true);
});

test('waybill photo uses 4×6 stock even when settings default to 40×30', () => {
  const doc = buildClonedLabel(flipkartDetection, { widthMm: 40, heightMm: 30 });
  assert.ok(doc);
  assert.ok(doc.widthMm >= 95 && doc.widthMm <= 110, `width ${doc.widthMm}`);
  assert.ok(doc.heightMm >= 140 && doc.heightMm <= 160, `height ${doc.heightMm}`);
});

test('photo margins crop so label content fills the canvas', () => {
  const detection: CloneDetection = {
    imageWidth: 1000,
    imageHeight: 1500,
    codes: [
      {
        kind: 'qr',
        type: 'qr',
        data: 'https://example.com/awb',
        box: { x: 0.55, y: 0.22, w: 0.22, h: 0.15 },
      },
    ],
    lines: [
      { text: 'Ship to', frame: { left: 220, top: 280, width: 240, height: 32 } },
      { text: 'Nandhini Kumar', frame: { left: 220, top: 330, width: 400, height: 28 } },
      { text: 'Tiruppur 642205', frame: { left: 220, top: 980, width: 380, height: 26 } },
    ],
  };
  const source = cloneSourceRect(detection);
  assert.ok(source.left > 100);
  assert.ok(source.top > 150);
  assert.ok(source.left + source.width < 900);

  const doc = buildClonedLabel(detection, { widthMm: 100, heightMm: 150, lockSize: true });
  assert.ok(doc);
  const header = doc.elements.find((el) => el.type === 'text' && el.text === 'Ship to');
  assert.ok(header);
  assert.ok(header.top < 18, `header should sit near the top after crop, got ${header.top}`);
  assert.ok(header.left < 20, `header should sit near the left after crop, got ${header.left}`);
});

test('scanner boxes accept pixels, unit squares, and EXIF-swapped bitmaps', () => {
  const pixels = normalizeScannerBox({ left: 100, top: 50, width: 200, height: 80 }, 800, 600);
  assert.ok(pixels);
  assert.equal(Math.round(pixels.x * 800), 100);
  assert.equal(Math.round(pixels.y * 600), 50);

  const unit = normalizeScannerBox({ left: 0.2, top: 0.1, width: 0.3, height: 0.25 }, 1200, 1600);
  assert.deepEqual(unit, { x: 0.2, y: 0.1, w: 0.3, h: 0.25 });

  const swapped = normalizeScannerBox({ left: 500, top: 30, width: 220, height: 70 }, 600, 800);
  assert.ok(swapped);
  assert.ok(swapped.x > 0 && swapped.x < 1);
  assert.ok(swapped.h > swapped.w);
});
