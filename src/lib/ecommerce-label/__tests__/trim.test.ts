import assert from 'node:assert/strict';
import test from 'node:test';

import { trimBottomToRule } from '../trim';

function page(w: number, h: number, rows: Record<number, 'solid' | 'dashed'>) {
  const gray = new Uint8Array(w * h).fill(255);
  for (const [y, kind] of Object.entries(rows)) {
    for (let x = 0; x < w; x++) if (kind === 'solid' || x % 4 < 2) gray[Number(y) * w + x] = 0;
  }
  return { width: w, height: h, gray };
}

test('cuts the dashed line under the box, keeps the border', () => {
  const p = page(100, 200, { 94: 'solid', 95: 'solid', 98: 'dashed' });
  const out = trimBottomToRule(p, { x: 0, y: 0, w: 1, h: 0.5 }); // rect bottom = row 100
  assert.equal(Math.round(out.h * 200), 96, 'ends just after the two-row border');
});

test('leaves a crop with no rule near its bottom alone', () => {
  const p = page(100, 200, { 20: 'solid' });
  const rect = { x: 0, y: 0, w: 1, h: 0.5 };
  assert.deepEqual(trimBottomToRule(p, rect), rect);
});
