/**
 * Redacted real-PDF fixtures. PROVISIONAL — see SMART_CROP_PLAN.md R2.7.
 *
 * The PNGs are produced on device by the Phase 1 dev probe (the exact 100-DPI
 * grayscale buffer the detector sees) and committed only after a visual check
 * for residual text. Until they exist, each test skips with a message instead
 * of failing on missing data. Assertions are structural for now; coordinate
 * tolerances are locked once the real files arrive.
 */

import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { pngBase64ToGray } from '@/lib/printer/escpos';

import { detectSections } from '../detector';
import { leaves, unionRects, type DetectResult } from '../types';

const DIR = join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'smart-crop');

function load(name: string) {
  const path = join(DIR, `${name}.png`);
  if (!existsSync(path)) return null;
  return pngBase64ToGray(readFileSync(path).toString('base64'));
}

function report(name: string, r: DetectResult) {
  console.log(`  ${name}: ${leaves(r).length} section(s), ${r.timing.totalMs}ms, analysis ${r.analysis.w}×${r.analysis.h}`);
  for (const s of leaves(r)) {
    console.log(
      `    #${s.order} x=${s.rect.x.toFixed(3)} y=${s.rect.y.toFixed(3)} w=${s.rect.w.toFixed(3)} h=${s.rect.h.toFixed(3)}` +
        ` conf=${s.confidence} code=${s.hasCodeLike} [${s.boundedBy.top}|${s.boundedBy.right}|${s.boundedBy.bottom}|${s.boundedBy.left}]`,
    );
  }
}

const missing = (name: string) =>
  `fixtures/smart-crop/${name}.png not present yet — PROVISIONAL, waiting on the redacted PDF`;

console.log('--- smart-crop real fixtures (PROVISIONAL) ---');

const amazon = load('amazon-lr');
test('PROVISIONAL amazon-lr: left label, right invoice, label holds the barcode', { skip: amazon ? false : missing('amazon-lr') }, () => {
  const r = detectSections(amazon!);
  report('amazon-lr', r);
  const ls = leaves(r);
  assert.ok(ls.length >= 2);
  const label = ls.find((s) => s.hasCodeLike && s.rect.x < 0.25);
  assert.ok(label, 'a left section holds a barcode');
  assert.ok(label.rect.x + label.rect.w <= 0.6, 'label is the left part');
  assert.ok(ls.some((s) => s.rect.x >= label.rect.x + label.rect.w - 0.02), 'invoice to its right');
});

const flipkart = load('flipkart-tb');
test('PROVISIONAL flipkart-tb: bordered label box narrower than the page, centred, then invoice', { skip: flipkart ? false : missing('flipkart-tb') }, () => {
  const r = detectSections(flipkart!);
  report('flipkart-tb', r);
  const [label, ...rest] = leaves(r);
  assert.ok(label && rest.length >= 1);
  assert.ok(label.rect.w <= 0.8, `label w=${label.rect.w.toFixed(3)} ≤ 0.80`);
  assert.ok(Math.abs(label.rect.x + label.rect.w / 2 - 0.5) <= 0.03, 'centred ±0.03');
  assert.ok(rest.every((s) => s.rect.y >= label.rect.y + label.rect.h - 0.02), 'invoice below');
});

const valmo = load('valmo-tb');
test('PROVISIONAL valmo-tb: cut at the title band, label side merges cleanly', { skip: valmo ? false : missing('valmo-tb') }, () => {
  const r = detectSections(valmo!);
  report('valmo-tb', r);
  const ls = leaves(r);
  assert.ok(ls.length >= 2);
  const invoice = ls.find((s) => s.boundedBy.top === 'band');
  assert.ok(invoice, 'a section starts at the title band');
  const above = ls.filter((s) => s.rect.y + s.rect.h <= invoice.rect.y + 0.02);
  const merged = unionRects(above.map((s) => s.rect));
  assert.ok(merged && merged.y <= 0.05, 'label side reaches the top of the page');
  assert.ok(above.some((s) => s.hasCodeLike), 'label side holds the barcode');
});
