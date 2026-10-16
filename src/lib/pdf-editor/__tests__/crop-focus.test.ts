import test from 'node:test';
import assert from 'node:assert/strict';

import { cropFocusTransform } from '../crop-focus';

test('a focused crop stays centred on the page', () => {
  const pageW = 200;
  const pageH = 400;
  const cropX = 20;
  const cropY = 40;
  const cropW = 100;
  const cropH = 80;
  const focus = cropFocusTransform({
    pageW,
    pageH,
    cropX,
    cropY,
    cropW,
    cropH,
    stageW: pageW,
    stageH: pageH,
    focus: true,
  });
  const cx = cropX + cropW / 2;
  const cy = cropY + cropH / 2;
  const sx = pageW / 2 + (cx - pageW / 2) * focus.scale + focus.tx;
  const sy = pageH / 2 + (cy - pageH / 2) * focus.scale + focus.ty;
  assert.ok(focus.scale > 1);
  assert.ok(Math.abs(sx - pageW / 2) < 0.01);
  assert.ok(Math.abs(sy - pageH / 2) < 0.01);
});

test('a window that already fills the page does not zoom', () => {
  const focus = cropFocusTransform({
    pageW: 300,
    pageH: 400,
    cropX: 0,
    cropY: 0,
    cropW: 300,
    cropH: 400,
    stageW: 300,
    stageH: 400,
    focus: true,
  });
  assert.equal(focus.scale, 1);
  assert.equal(focus.tx, 0);
  assert.equal(focus.ty, 0);
});

test('a window that still covers most of the page stays where it is', () => {
  const focus = cropFocusTransform({
    pageW: 300,
    pageH: 400,
    cropX: 15,
    cropY: 20,
    cropW: 270,
    cropH: 340,
    stageW: 300,
    stageH: 400,
    focus: true,
  });
  assert.deepEqual(focus, { scale: 1, tx: 0, ty: 0 });
});

test('showing the rest of the page clears the focus', () => {
  assert.deepEqual(
    cropFocusTransform({
      pageW: 200,
      pageH: 400,
      cropX: 10,
      cropY: 10,
      cropW: 40,
      cropH: 40,
      stageW: 200,
      stageH: 400,
      focus: false,
    }),
    { scale: 1, tx: 0, ty: 0 },
  );
});
