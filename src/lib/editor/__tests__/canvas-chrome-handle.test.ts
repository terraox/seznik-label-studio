import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHROME_HANDLE_MIN_SIZE_PX,
  CHROME_HANDLE_SIZE_PX,
  chromeHandleSizePx,
} from '../canvas-chrome';

test('a large element keeps the full-size handle', () => {
  assert.equal(chromeHandleSizePx(200, 120), CHROME_HANDLE_SIZE_PX);
});

test('a small element gets a smaller handle, never below the minimum', () => {
  const size = chromeHandleSizePx(47, 28);
  assert.ok(size < CHROME_HANDLE_SIZE_PX);
  assert.ok(size >= CHROME_HANDLE_MIN_SIZE_PX);
  assert.equal(chromeHandleSizePx(10, 4), CHROME_HANDLE_MIN_SIZE_PX);
});

test('a bad size falls back to the minimum handle', () => {
  assert.equal(chromeHandleSizePx(Number.NaN, 30), CHROME_HANDLE_MIN_SIZE_PX);
  assert.equal(chromeHandleSizePx(0, 30), CHROME_HANDLE_MIN_SIZE_PX);
});
