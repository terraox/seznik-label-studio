import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import { createLabelDocument, type LabelElement } from '@/lib/label-document';
import { modedImageSettings, usesModedPrint } from '@/printing/raster/image-element-settings';

type ImageEl = Extract<LabelElement, { type: 'image' }>;

const base = {
  id: 'i',
  type: 'image',
  ...DEFAULT_ELEMENT_STATE,
  uri: 'file:///a.png',
  rotation: 0,
  left: 1,
  top: 1,
  width: 10,
  height: 10,
  lockMovement: false,
  needPrinting: true,
  antiColor: false,
} as unknown as ImageEl;

test('an image saved before this feature has no new settings and keeps the old path', () => {
  assert.equal(modedImageSettings(base), null);
  assert.equal(usesModedPrint(base), false);
  const legacy = { ...base, colorMode: 'B & W', grayThreshold: 90, antiColor: true } as ImageEl;
  assert.equal(modedImageSettings(legacy), null);
  assert.equal(usesModedPrint(legacy), false);
});

test('legacy Halftone runs as the Ordered dot screen, tiled stays old', () => {
  const half = { ...base, colorMode: 'Halftone', antiColor: true } as ImageEl;
  const s = modedImageSettings(half)!;
  assert.equal(s.mode, 'ordered');
  assert.equal(s.invert, true);
  assert.equal(usesModedPrint(half), true);
  assert.equal(usesModedPrint({ ...half, tile: true } as ImageEl), false);
});

test('new fields turn the mode on; a missing mode is Solid at the old threshold', () => {
  const s = modedImageSettings({ ...base, grayThreshold: 140, brightness: 10 } as ImageEl)!;
  assert.equal(s.mode, 'solid');
  assert.equal(s.threshold, 140);
  assert.equal(s.brightness, 10);
  assert.equal(modedImageSettings({ ...base, imageMode: 'floyd' } as ImageEl)!.threshold, 128);
});

test('Anti-color and Invert flip the same way and cancel each other', () => {
  assert.equal(modedImageSettings({ ...base, imageMode: 'solid', antiColor: true } as ImageEl)!.invert, true);
  assert.equal(modedImageSettings({ ...base, imageMode: 'solid', invert: true } as ImageEl)!.invert, true);
  assert.equal(modedImageSettings({ ...base, imageMode: 'solid', invert: true, antiColor: true } as ImageEl)!.invert, false);
});

test('tiled images stay on the old path', () => {
  assert.equal(usesModedPrint({ ...base, imageMode: 'floyd', tile: true } as ImageEl), false);
});

test('new fields round-trip through saved JSON, and old JSON loads unchanged', () => {
  const el = { ...base, imageMode: 'atkinson', threshold: 150, brightness: -20, contrast: 35, invert: true } as ImageEl;
  const doc = createLabelDocument({ name: 'x', widthMm: 50, heightMm: 30, elements: [el] });
  const back = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(back.elements[0], el);
  const oldDoc = createLabelDocument({ name: 'y', widthMm: 50, heightMm: 30, elements: [base] });
  const oldBack = JSON.parse(JSON.stringify(oldDoc));
  assert.equal('imageMode' in oldBack.elements[0], false);
  assert.deepEqual(oldBack.elements[0], base);
});
