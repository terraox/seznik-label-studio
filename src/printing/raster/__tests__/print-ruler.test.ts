import assert from 'node:assert/strict';
import {
  blockTextRectsMm,
  buildPrintRulerGeometry,
  printRulerLabels,
} from '@/lib/print-ruler';

const W = 50;
const H = 30;
const g50 = buildPrintRulerGeometry(W, H);
const texts = g50.labels.map((l) => l.text);
assert.ok(texts.includes('0'));
assert.ok(texts.includes('1'));
assert.ok(texts.includes('2'));
assert.ok(texts.includes('50'));
assert.ok(texts.includes('10'));
assert.ok(texts.includes('20'));
assert.ok(texts.includes('30'), 'vertical scale must label 30 mm');
assert.ok(g50.inkRects.length > 200, 'block digits add many solid rects');

for (const r of g50.inkRects) {
  assert.ok(r.left >= -1e-6, `overflow left ${r.left}`);
  assert.ok(r.top >= -1e-6, `overflow top ${r.top}`);
  assert.ok(r.left + r.width <= W + 1e-6, `overflow right ${r.left + r.width}`);
  assert.ok(r.top + r.height <= H + 1e-6, `overflow bottom ${r.top + r.height}`);
}

const leftTicks = g50.inkRects.filter((r) => r.left < 0.4 && r.width > 1 && r.height < 0.6);
assert.ok(leftTicks.length >= 20, `expected vertical ticks, got ${leftTicks.length}`);

const digitRects = blockTextRectsMm('50', 10, 5, 2);
assert.ok(digitRects.length > 20);

const bar = buildPrintRulerGeometry(50, 15);
assert.ok(printRulerLabels(50, 15).some((l) => l.text === '0'));
for (const r of bar.inkRects) {
  assert.ok(r.left >= -1e-6);
  assert.ok(r.top >= -1e-6);
  assert.ok(r.left + r.width <= 50.001);
  assert.ok(r.top + r.height <= 15.001);
}

console.log('ok print-ruler');
