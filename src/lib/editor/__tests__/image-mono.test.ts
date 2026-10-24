import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_EDITOR_COLOR_MODE,
  DEFAULT_GRAY_THRESHOLD,
  applyMonoToRgba,
  binarizeLuminanceBuffer,
  looksLikeImageUri,
  monoFromLuminance,
  monoInkLevel,
  monoShaderModeValue,
  renderMonoPreview,
  resolveEditorColorMode,
} from '../image-mono';

test('new images default to B & W at threshold 128', () => {
  assert.equal(DEFAULT_EDITOR_COLOR_MODE, 'B & W');
  assert.equal(DEFAULT_GRAY_THRESHOLD, 128);
  assert.equal(resolveEditorColorMode(undefined), 'B & W');
  assert.equal(resolveEditorColorMode('Original'), 'Original');
  assert.equal(resolveEditorColorMode('Halftone'), 'Halftone');
});

test('mid-gray is white at the threshold and black below it', () => {
  assert.equal(monoFromLuminance(128, 128), 255);
  assert.equal(monoFromLuminance(127, 128), 0);
  assert.equal(monoFromLuminance(200, 128), 255);
  assert.equal(monoFromLuminance(10, 128), 0);
});

test('binarizeLuminanceBuffer maps a buffer through the threshold', () => {
  const src = Uint8Array.from([0, 127, 128, 255]);
  assert.deepEqual([...binarizeLuminanceBuffer(src, 128)], [0, 0, 255, 255]);
});

test('looksLikeImageUri accepts file and http image paths', () => {
  assert.equal(looksLikeImageUri('https://example.com/photo.png'), true);
  assert.equal(looksLikeImageUri('file:///tmp/a.jpg'), true);
  assert.equal(looksLikeImageUri('Product name'), false);
});

test('applyMonoToRgba thresholds a mid-gray pixel in place', () => {
  const rgba = Uint8Array.from([128, 128, 128, 255, 10, 10, 10, 255]);
  applyMonoToRgba(rgba, 2, 1, 128, 'B & W');
  assert.deepEqual([...rgba], [255, 255, 255, 255, 0, 0, 0, 255]);
});

test('B & W is a plain luminance threshold: yellow is light, dark gray is ink', () => {
  assert.equal(monoInkLevel(255, 199, 44), 198);
  const rgba = Uint8Array.from([255, 199, 44, 255, 40, 40, 40, 255, 0, 0, 0, 0]);
  applyMonoToRgba(rgba, 3, 1, 128, 'B & W');
  assert.deepEqual([...rgba], [255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
});

test('mono shader mode maps Halftone to dither and everything else to threshold', () => {
  assert.equal(monoShaderModeValue('Halftone'), 2);
  assert.equal(monoShaderModeValue('B & W'), 1);
  assert.equal(monoShaderModeValue('Original'), 1);
});

test('anti-colour inverts the thresholded result', () => {
  const rgba = Uint8Array.from([128, 128, 128, 255, 10, 10, 10, 255]);
  applyMonoToRgba(rgba, 2, 1, 128, 'B & W', true);
  assert.deepEqual([...rgba], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('anti-colour on Original inverts the colours and keeps alpha', () => {
  const rgba = Uint8Array.from([10, 100, 250, 200]);
  applyMonoToRgba(rgba, 1, 1, 128, 'Original', true);
  assert.deepEqual([...rgba], [245, 155, 5, 200]);
});

test('Original without anti-colour leaves pixels alone', () => {
  const rgba = Uint8Array.from([10, 100, 250, 200]);
  applyMonoToRgba(rgba, 1, 1, 128, 'Original');
  assert.deepEqual([...rgba], [10, 100, 250, 200]);
});

test('preview B & W is solid black or white and does not edit the source', () => {
  const src = Uint8Array.from([40, 40, 40, 255, 200, 200, 200, 255]);
  const out = renderMonoPreview(src, 2, 1, 160, 'B & W');
  assert.deepEqual([...out], [0, 0, 0, 255, 255, 255, 255, 255]);
  assert.deepEqual([...src], [40, 40, 40, 255, 200, 200, 200, 255]);
});

test('preview halftone dithers a flat mid-gray that B & W would flatten', () => {
  const src = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    src[i * 4] = 160;
    src[i * 4 + 1] = 160;
    src[i * 4 + 2] = 160;
    src[i * 4 + 3] = 255;
  }
  const bw = renderMonoPreview(src, 4, 4, 160, 'B & W');
  const dots = renderMonoPreview(src, 4, 4, 160, 'Halftone');
  const sample = (buf: Uint8Array) => [...buf].filter((_, i) => i % 4 === 0);
  assert.deepEqual(sample(bw), Array(16).fill(255));
  const halftone = sample(dots);
  assert.ok(halftone.some((v) => v === 0) && halftone.some((v) => v === 255));
});
