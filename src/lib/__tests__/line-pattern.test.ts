import assert from 'node:assert/strict';
import test from 'node:test';

import { LINE_STYLE_IDS, linePatternForBox, linePatternRects } from '../line-pattern';

const key = (rects: { x: number; y: number; w: number; h: number }[]) =>
  rects.map((r) => [r.x, r.y, r.w, r.h].map((n) => n.toFixed(2)).join(',')).join('|');

test('every style stays inside its box and draws something', () => {
  for (const style of LINE_STYLE_IDS) {
    for (const [w, h] of [[200, 16], [203, 4], [60, 30]] as const) {
      const rects = linePatternRects(style, w, h, 8, 1, 1);
      assert.ok(rects.length > 0, `${style} ${w}x${h} drew nothing`);
      for (const r of rects) {
        assert.ok(r.x >= -1e-6 && r.y >= -1e-6, `${style} starts outside`);
        assert.ok(r.x + r.w <= w + 1e-6, `${style} overflows width`);
        assert.ok(r.y + r.h <= Math.max(h, 1) + 1e-6, `${style} overflows height`);
        assert.ok(r.w > 0 && r.h > 0, `${style} has an empty rect`);
      }
    }
  }
});

test('styles look different from each other', () => {
  const seen = new Map<string, string>();
  for (const style of LINE_STYLE_IDS) {
    const k = key(linePatternRects(style, 200, 16, 8, 1, 1));
    assert.ok(!seen.has(k), `${style} is identical to ${seen.get(k)}`);
    seen.set(k, style);
  }
});

test('dashed uses equal dash and gap of the interval', () => {
  const rects = linePatternRects('dashed', 100, 4, 10, 1, 1);
  assert.deepEqual(rects.map((r) => [r.x, r.w]), [[0, 10], [20, 10], [40, 10], [60, 10], [80, 10]]);
});

test('double is two bars at the edges', () => {
  const rects = linePatternRects('double', 100, 9, 8, 1, 1);
  assert.equal(rects.length, 2);
  assert.equal(rects[0].y, 0);
  assert.equal(rects[1].y + rects[1].h, 9);
});

test('slash and backslash mirror each other', () => {
  const a = linePatternRects('slash', 100, 16, 8, 1, 1);
  const b = linePatternRects('backslash', 100, 16, 8, 1, 1);
  assert.equal(a.length, b.length);
  assert.ok(a[0].y > b[0].y, 'slash starts low, backslash starts high');
});

test('a tall box turns the pattern a quarter turn', () => {
  const h = linePatternForBox('dashed', 4, 100, 10, 1, 1);
  assert.deepEqual(h.map((r) => [r.y, r.h, r.w]), [[0, 10, 4], [20, 10, 4], [40, 10, 4], [60, 10, 4], [80, 10, 4]]);
});

test('long lines cap the number of slices', () => {
  assert.ok(linePatternRects('wave', 100000, 16, 2, 1, 1).length <= 3100);
});
