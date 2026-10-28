import assert from 'node:assert/strict';
import test from 'node:test';

import { italicSkewChain } from '@/lib/fonts/italic-skew';

type M = number[][];
const rot = (deg: number): M => {
  const t = (deg * Math.PI) / 180;
  return [
    [Math.cos(t), -Math.sin(t)],
    [Math.sin(t), Math.cos(t)],
  ];
};
const mul = (a: M, b: M): M => a.map((row) => b[0].map((_, j) => row[0] * b[0][j] + row[1] * b[1][j]));

test('rotate · scale · rotate rebuilds the shear', () => {
  for (const deg of [-11.3, -20, -28, 12]) {
    const k = Math.tan((deg * Math.PI) / 180);
    const c = italicSkewChain(deg);
    const m = mul(mul(rot(c.outerDeg), [[c.scaleX, 0], [0, c.scaleY]]), rot(c.innerDeg));
    assert.ok(Math.abs(m[0][0] - 1) < 1e-9, `a at ${deg}`);
    assert.ok(Math.abs(m[0][1] - k) < 1e-9, `b at ${deg}`);
    assert.ok(Math.abs(m[1][0]) < 1e-9, `c at ${deg}`);
    assert.ok(Math.abs(m[1][1] - 1) < 1e-9, `d at ${deg}`);
  }
});

test('both scales stay positive', () => {
  const c = italicSkewChain();
  assert.ok(c.scaleX > 0 && c.scaleY > 0);
});
