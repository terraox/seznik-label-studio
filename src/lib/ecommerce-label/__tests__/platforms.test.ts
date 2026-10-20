import assert from 'node:assert/strict';
import test from 'node:test';

import { bestRotation, locateInvoicePage, locatePage, type LeafLike } from '../platforms';

const edges = (top = 'content', bottom = 'content', left = 'content', right = 'content') =>
  ({ top, bottom, left, right }) as LeafLike['boundedBy'];
const leaf = (x: number, y: number, w: number, h: number, hasCodeLike: boolean, boundedBy = edges()): LeafLike => ({
  rect: { x, y, w, h },
  hasCodeLike,
  boundedBy,
});

// Sections the detector found on the three sample PDFs (100 DPI, see pdfs/).
const AMAZON = [
  leaf(0.53, 0.003, 0.44, 0.251, false, edges('content', 'band', 'dashed')),
  leaf(0.04, 0.026, 0.444, 0.355, true, edges('ink-gap', 'gutter', 'content', 'dashed')),
  leaf(0.529, 0.28, 0.441, 0.103, false, edges('band', 'gutter', 'dashed')),
  leaf(0.044, 0.427, 0.393, 0.063, false, edges('gutter', 'content', 'content', 'dashed')),
  leaf(0.586, 0.457, 0.328, 0.025, false, edges('gutter', 'ink-gap', 'dashed', 'ink-gap')),
];
const FLIPKART = [
  leaf(0.315, 0.033, 0.369, 0.424, true, edges('content', 'dashed', 'ink-gap', 'ink-gap')),
  leaf(0.085, 0.463, 0.843, 0.394, false, edges('dashed')),
];
const MEESHO = [
  leaf(0.018, 0.013, 0.965, 0.441, true, edges('content', 'band')),
  leaf(0.018, 0.476, 0.965, 0.108, false, edges('band', 'band')),
  leaf(0.018, 0.593, 0.965, 0.251, false, edges('band', 'content')),
];

test('amazon: label is the left column, invoice the right', () => {
  const r = locatePage('amazon', AMAZON)!;
  assert.ok(r);
  assert.ok(r.label.x < 0.05 && r.label.x + r.label.w < 0.5);
  assert.ok(r.label.y + r.label.h > 0.48, 'label reaches the second left section');
  assert.ok(r.invoice && r.invoice.x > 0.5);
});

test('flipkart: label is the centred box, invoice below', () => {
  const r = locatePage('flipkart', FLIPKART)!;
  assert.ok(r);
  assert.ok(r.label.w < 0.4 && r.label.y < 0.05);
  assert.ok(r.invoice && r.invoice.y > r.label.y + r.label.h - 0.02);
});

test('meesho: label is everything above the title band', () => {
  const r = locatePage('meesho', MEESHO)!;
  assert.ok(r);
  assert.ok(r.label.w > 0.95 && r.label.y < 0.01);
  assert.ok(r.label.y + r.label.h < 0.476, 'stops before the invoice band');
  assert.ok(r.invoice && r.invoice.y >= 0.47);
});

test('meesho: an exchange label with no invoice is still a label', () => {
  const r = locatePage('meesho', [leaf(0.018, 0.013, 0.965, 0.388, true)])!;
  assert.ok(r);
  assert.equal(r.invoice, null);
  assert.ok(r.label.w > 0.95 && r.label.h < 0.45);
});

// amazon-2.pdf: the label is page 1 and the invoice is page 2.
const AMAZON_TWO_LABEL = [
  leaf(0.027, 0.018, 0.893, 0.387, true, edges('content', 'solid')),
  leaf(0.021, 0.431, 0.843, 0.166, false, edges('solid', 'solid', 'content', 'ink-gap')),
  leaf(0.023, 0.619, 0.895, 0.116, false, edges('solid', 'gutter')),
  leaf(0.035, 0.831, 0.365, 0.123, false, edges('gutter', 'content', 'ink-gap', 'gutter')),
];
const AMAZON_TWO_INVOICE = [
  leaf(0.088, 0.006, 0.277, 0.052, false),
  leaf(0.522, 0.017, 0.417, 0.038, false),
  leaf(0.068, 0.123, 0.371, 0.22, false),
  leaf(0.598, 0.123, 0.335, 0.32, false, edges('gutter', 'band')),
  leaf(0.068, 0.488, 0.868, 0.192, false, edges('band', 'gutter')),
  leaf(0.168, 0.913, 0.772, 0.046, false),
];

test('amazon two-page format: the label page is the whole label, the next page its invoice', () => {
  const label = locatePage('amazon', AMAZON_TWO_LABEL)!;
  assert.ok(label);
  assert.equal(label.invoice, null);
  assert.ok(label.label.h > 0.9 && label.label.y < 0.02);
  assert.equal(locatePage('amazon', AMAZON_TWO_INVOICE), null, 'an invoice page is not a label');
  const invoice = locateInvoicePage('amazon', AMAZON_TWO_INVOICE)!;
  assert.ok(invoice && invoice.h > 0.9);
  assert.equal(locateInvoicePage('amazon', AMAZON_TWO_LABEL), null, 'a label page is not an invoice');
  assert.equal(locateInvoicePage('flipkart', AMAZON_TWO_INVOICE), null);
});

test('each platform rejects the other platforms\' pages', () => {
  const pages = { amazon: AMAZON, flipkart: FLIPKART, meesho: MEESHO };
  for (const platform of ['flipkart', 'meesho'] as const) {
    assert.equal(locatePage(platform, AMAZON_TWO_LABEL), null, `${platform} on a two-page amazon label`);
  }
  assert.equal(locatePage('amazon', MEESHO), null, 'meesho page is not an amazon label');
  for (const platform of Object.keys(pages) as (keyof typeof pages)[]) {
    for (const [source, leaves] of Object.entries(pages)) {
      const found = locatePage(platform, leaves);
      assert.equal(found !== null, platform === source, `${platform} on a ${source} page`);
    }
  }
});

test('an empty or unreadable page is rejected', () => {
  assert.equal(locatePage('amazon', []), null);
  assert.equal(locatePage('meesho', [leaf(0.1, 0.1, 0.5, 0.5, false)]), null);
});

test('bestRotation turns a wide crop on a tall label only', () => {
  const page = { w: 595, h: 842 };
  const wide = { x: 0, y: 0, w: 0.96, h: 0.44 };
  assert.equal(bestRotation(wide, page, { widthMm: 101.6, heightMm: 152.4 }), 90);
  assert.equal(bestRotation(wide, page, { widthMm: 152.4, heightMm: 101.6 }), 0);
  assert.equal(bestRotation({ x: 0, y: 0, w: 0.44, h: 0.45 }, page, { widthMm: 101.6, heightMm: 152.4 }), 0);
});
