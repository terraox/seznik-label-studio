import assert from 'node:assert/strict';
import { borderBoxForCenterGap } from '@/lib/border-geometry';

// Stroke center is `gap` from every edge: outer edge = gap - stroke/2.
const b = borderBoxForCenterGap(50, 30, 3, 0.55);
assert.equal(b.left, 2.725);
assert.equal(b.top, 2.725);
assert.equal(b.width, 50 - 2 * 2.725);
assert.equal(b.height, 30 - 2 * 2.725);

// Never inverts or collapses on a small label.
const small = borderBoxForCenterGap(10, 8, 10, 0.5);
assert.ok(small.width >= 1 && small.height >= 1);
assert.ok(small.left >= 0);

// Gap smaller than half the stroke clamps to the label edge.
assert.equal(borderBoxForCenterGap(50, 30, 0.1, 0.9).left, 0);
console.log('ok border-center-gap');
