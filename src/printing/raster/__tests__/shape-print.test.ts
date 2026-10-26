import assert from 'node:assert/strict';
import test from 'node:test';

import { shapeCovers, type ShapePaint } from '../shape-geometry';

const ring = (kind: ShapePaint['kind'], radius = 0): ShapePaint => ({
  kind,
  x: 0,
  y: 0,
  w: 40,
  h: 20,
  radius,
  stroke: 2,
});

test('rounded rectangle ring leaves its corner dot empty and keeps the straight edges', () => {
  const s = ring('roundRect', 8);
  assert.equal(shapeCovers(s, 0.5, 0.5), false, 'corner is cut away');
  assert.equal(shapeCovers(s, 20, 0.5), true, 'top edge has ink');
  assert.equal(shapeCovers(s, 20, 10), false, 'inside is empty');
});

test('square rounded rectangle (radius 0) keeps the corner', () => {
  assert.equal(shapeCovers(ring('roundRect', 0), 0.5, 0.5), true);
});

test('oval ring has ink on its edge and none in the middle or the box corner', () => {
  const s = ring('ellipse');
  assert.equal(shapeCovers(s, 0.5, 10), true);
  assert.equal(shapeCovers(s, 20, 10), false);
  assert.equal(shapeCovers(s, 0.5, 0.5), false);
});

test('filled shapes cover the middle', () => {
  assert.equal(shapeCovers({ ...ring('ellipse'), stroke: null }, 20, 10), true);
  assert.equal(shapeCovers({ ...ring('roundRect', 8), stroke: null }, 0.5, 0.5), false);
});
