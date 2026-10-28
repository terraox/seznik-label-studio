import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSerialLabelDocument, DEFAULT_SERIAL_INFO, layoutSerialElements } from '@/lib/serial/build-document';
import { collectSerialFields, resolveDocumentForIndex } from '@/lib/serial/resolve-document';

const size = { name: 'Serial', widthMm: 50, heightMm: 30 };
const text = (doc: ReturnType<typeof buildSerialLabelDocument>['doc'], i: number, type: string) =>
  resolveDocumentForIndex(doc, i).elements.find((e) => e.type === type) as unknown as Record<string, string>;

test('text only: one serial text, count and first/last', () => {
  const r = buildSerialLabelDocument({ ...size, options: { ...DEFAULT_SERIAL_INFO, sample: 'Desk1', count: 20 } });
  assert.equal(r.doc.elements.length, 1);
  assert.equal(r.doc.serialBatch?.count, 20);
  assert.deepEqual(r.range, { first: 'Desk1', last: 'Desk20' });
  assert.equal(r.issues.filter((i) => i.severity === 'error').length, 0);
  assert.equal(text(r.doc, 2, 'text').text, 'Desk3');
});

test('text + barcode + QR all read the same serial', () => {
  const r = buildSerialLabelDocument({
    ...size,
    options: { ...DEFAULT_SERIAL_INFO, sample: 'SN-001', count: 5, showBarcode: true, showQr: true },
  });
  assert.deepEqual(r.doc.elements.map((e) => e.type).sort(), ['barcode', 'qrcode', 'text']);
  for (let i = 0; i < 5; i += 1) {
    const label = `SN-${String(i + 1).padStart(3, '0')}`;
    assert.equal(text(r.doc, i, 'text').text, label);
    assert.equal(text(r.doc, i, 'barcode').content, label);
    assert.equal(text(r.doc, i, 'qrcode').content, label);
  }
  // Thumbnails show the first label.
  assert.equal((r.doc.elements.find((e) => e.type === 'qrcode') as unknown as { content: string }).content, 'SN-001');
});

test('QR only follows no barcode, count by step and digits', () => {
  const r = buildSerialLabelDocument({
    ...size,
    options: { ...DEFAULT_SERIAL_INFO, sample: '5', count: 3, step: 5, digits: 4, showText: false, showQr: true },
  });
  assert.deepEqual(r.doc.elements.map((e) => e.type), ['qrcode']);
  assert.deepEqual([0, 1, 2].map((i) => text(r.doc, i, 'qrcode').content), ['0005', '0010', '0015']);
});

test('EAN-13 adds the check digit and all codes agree', () => {
  const r = buildSerialLabelDocument({
    ...size,
    options: { ...DEFAULT_SERIAL_INFO, sample: '100000000001', count: 2, showBarcode: true, barcodeType: 'EAN-13' },
  });
  assert.equal(r.issues.filter((i) => i.severity === 'error').length, 0, JSON.stringify(r.issues));
  const bar = text(r.doc, 0, 'barcode').content;
  assert.equal(bar.length, 13);
  assert.equal(text(r.doc, 0, 'text').text, bar);
});

test('letters in an EAN-13 series are reported as an error', () => {
  const r = buildSerialLabelDocument({
    ...size,
    options: { ...DEFAULT_SERIAL_INFO, sample: 'AB1', count: 3, showBarcode: true, barcodeType: 'EAN-13' },
  });
  assert.ok(r.issues.some((i) => i.severity === 'error'));
});

test('turning everything off still gives a text label', () => {
  const r = buildSerialLabelDocument({ ...size, options: { ...DEFAULT_SERIAL_INFO, showText: false } });
  assert.deepEqual(r.doc.elements.map((e) => e.type), ['text']);
});

test('every element stays inside the label for wide, square and tall sizes', () => {
  for (const [w, h] of [[50, 30], [40, 40], [25, 50], [100, 25], [15, 30]] as const) {
    const r = buildSerialLabelDocument({
      name: 's',
      widthMm: w,
      heightMm: h,
      options: { ...DEFAULT_SERIAL_INFO, showBarcode: true, showQr: true },
    });
    for (const el of r.doc.elements) {
      const e = el as unknown as { left: number; top: number; width: number; height?: number };
      assert.ok(e.left >= 0 && e.top >= 0, `${w}x${h} ${el.type} starts inside`);
      assert.ok(e.left + e.width <= w + 0.1, `${w}x${h} ${el.type} fits the width`);
      if (e.height) assert.ok(e.top + e.height <= h + 0.1, `${w}x${h} ${el.type} fits the height`);
    }
    assert.equal(collectSerialFields(r.doc).length, 3);
  }
});

test('layout puts nothing on top of anything else for text + barcode', () => {
  const l = layoutSerialElements(50, 30, { text: true, barcode: true, qr: false });
  assert.ok(l.text && l.barcode);
  assert.ok(l.text.y + l.text.h <= l.barcode.y + 0.001);
});
