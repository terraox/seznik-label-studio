import assert from 'node:assert/strict';
import test from 'node:test';

import { LINE_EMOJI } from '@/constants/line-emoji-catalog';
import { fitSvgViewBoxToInk, inkSquare } from '@/lib/clipart/ink-bounds';
import { parseSvgDrawOps } from '@/lib/clipart/parse-svg';

test('a face circle sits inside the frame with a little room before the border', () => {
  const smile = LINE_EMOJI.find((entry) => entry.id === 'le-smile');
  assert.ok(smile);
  const sq = inkSquare(parseSvgDrawOps(smile.svg));
  const cx = sq.x + sq.side / 2;
  const cy = sq.y + sq.side / 2;
  assert.ok(Math.abs(cx - 12) < 0.6, `center x ${cx}`);
  assert.ok(Math.abs(cy - 12) < 0.6, `center y ${cy}`);
  // Face circle r=9.5, stroke 1.6. The gap to the frame is about 8% of the box.
  const inkRadius = 9.5 + 0.8;
  const gap = sq.side / 2 - inkRadius;
  const ratio = gap / sq.side;
  assert.ok(ratio > 0.06 && ratio < 0.11, `gap ratio ${ratio}`);
});

test('every line emoji keeps a square viewBox around its ink', () => {
  for (const entry of LINE_EMOJI) {
    const ops = parseSvgDrawOps(entry.svg);
    const sq = inkSquare(ops);
    assert.ok(sq.side > 1 && sq.side < 36, `${entry.id} side ${sq.side}`);
    const fitted = fitSvgViewBoxToInk(entry.svg);
    const match = fitted.match(/viewBox="([^"]+)"/);
    assert.ok(match, entry.id);
    const [x, y, w, h] = match[1].split(/\s+/).map(Number);
    assert.ok(Math.abs(w - h) < 0.01, entry.id);
    assert.ok(Math.abs(w - sq.side) < 0.02, entry.id);
    assert.ok(Math.abs(x - sq.x) < 0.02 && Math.abs(y - sq.y) < 0.02, entry.id);
    // Ink stays inside the square.
    for (const op of ops) {
      if (op.t !== 'circle') continue;
      const pad = op.fill ? 0 : op.sw / 2;
      assert.ok(op.x - op.r - pad >= sq.x - 0.05, entry.id);
      assert.ok(op.y - op.r - pad >= sq.y - 0.05, entry.id);
      assert.ok(op.x + op.r + pad <= sq.x + sq.side + 0.05, entry.id);
      assert.ok(op.y + op.r + pad <= sq.y + sq.side + 0.05, entry.id);
    }
  }
});

test('a full circle path is bounded by its radius, not the chord', () => {
  const d = 'M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0Z';
  const sq = inkSquare([{ t: 'path', d, fill: false, sw: 0 }]);
  assert.ok(sq.side > 21 && sq.side < 25, `side ${sq.side}`);
  assert.ok(sq.x > 0 && sq.x < 2, `x ${sq.x}`);
});
