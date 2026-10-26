import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contentTurnFit, turnDocumentContents } from '../turn-document';

const box = (left: number, top: number, width: number, height: number, extra: object = {}) =>
  ({ id: 'a', type: 'shape', left, top, width, height, rotation: 0, ...extra }) as never;

const doc = (w: number, h: number, elements: unknown[]) =>
  ({ widthMm: w, heightMm: h, elements }) as never;

test('fit is 1 for 0 and 180, and the short/long ratio for quarter turns', () => {
  assert.equal(contentTurnFit(80, 44, 0), 1);
  assert.equal(contentTurnFit(80, 44, 180), 1);
  assert.ok(Math.abs(contentTurnFit(80, 44, 90) - 0.55) < 1e-9);
  assert.ok(Math.abs(contentTurnFit(44, 80, 270) - 0.55) < 1e-9);
  assert.equal(contentTurnFit(50, 50, 90), 1);
});

test('180 swings a corner box to the opposite corner and adds the turn', () => {
  const out = turnDocumentContents(doc(80, 40, [box(0, 0, 10, 4)]), 180);
  const el = (out as never as { elements: { left: number; top: number; rotation: number }[] }).elements[0];
  assert.ok(Math.abs(el.left - 70) < 1e-9);
  assert.ok(Math.abs(el.top - 36) < 1e-9);
  assert.equal(el.rotation, 180);
});

test('a centred element stays centred and the label size is untouched', () => {
  const out = turnDocumentContents(doc(80, 40, [box(30, 18, 20, 4)]), 90) as never as {
    widthMm: number;
    heightMm: number;
    elements: { left: number; top: number; width: number; height: number; rotation: number }[];
  };
  const el = out.elements[0];
  assert.equal(out.widthMm, 80);
  assert.equal(out.heightMm, 40);
  assert.ok(Math.abs(el.left + el.width / 2 - 40) < 1e-6);
  assert.ok(Math.abs(el.top + el.height / 2 - 20) < 1e-6);
  assert.equal(el.rotation, 90);
});

test('after a quarter turn every element still lies inside the label', () => {
  const out = turnDocumentContents(doc(80, 40, [box(0, 0, 80, 40)]), 90) as never as {
    elements: { left: number; top: number; width: number; height: number }[];
  };
  const el = out.elements[0];
  // Turned 90 degrees its footprint is height x width about the centre.
  const halfW = el.height / 2;
  const halfH = el.width / 2;
  assert.ok(40 - halfW >= -1e-6 && 40 + halfW <= 80 + 1e-6);
  assert.ok(20 - halfH >= -1e-6 && 20 + halfH <= 40 + 1e-6);
});

test('borders stay where they are and 0 returns the same document', () => {
  const border = { id: 'b', type: 'border', left: 0, top: 0, width: 80, height: 40, rotation: 0, lineWidth: 0.3 } as never;
  const d = doc(80, 40, [border]);
  assert.equal(turnDocumentContents(d, 0), d);
  const out = turnDocumentContents(d, 90) as never as { elements: unknown[] };
  assert.equal(out.elements[0], border);
});
