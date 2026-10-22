import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acrossLayout, applyAcrossBorder, createTogetherDocument, hasAnyBorder, removeAcrossBorders } from '@/lib/across';
import { composeUpsDocument, createLabelDocument, createUpsConfig } from '@/lib/label-document';

const style = { borderStyle: 'solid-medium', lineWidth: 0.5, edgeGapMm: 1 };
const borders = (els: { type: string; left: number; width: number }[]) => els.filter((e) => e.type === 'border');

test('together: one wide canvas with the cell layout recorded', () => {
  const doc = createTogetherDocument({ name: 't', cellWidthMm: 25, cellHeightMm: 15, columns: 2, gapMm: 2 });
  assert.equal(doc.widthMm, 52);
  assert.equal(doc.ups, undefined);
  assert.deepEqual(doc.across, { columns: 2, gapMm: 2 });
  assert.ok(doc.templateSvg?.xml.includes('<rect'));
  const layout = acrossLayout(doc)!;
  assert.equal(layout.cellWidthMm, 25);
  assert.equal(layout.pitchMm, 27);
});

test('together: separate borders sit one per label, unified is a single frame', () => {
  const doc = createTogetherDocument({ name: 't', cellWidthMm: 25, cellHeightMm: 15, columns: 2, gapMm: 2 });
  const separate = applyAcrossBorder(doc, 'separate', style);
  const own = borders(separate.elements);
  assert.equal(own.length, 2);
  assert.ok(own[1].left > 27 && own[0].width < 25);
  const unified = applyAcrossBorder(separate, 'unified', style);
  assert.equal(borders(unified.elements).length, 1);
  assert.ok(borders(unified.elements)[0].width > 48);
  assert.equal(borders(removeAcrossBorders(unified).elements).length, 0);
});

test('separate (ups): per-label borders on every panel, unified is one frame at compose time', () => {
  const cell = createLabelDocument({ name: 'u', widthMm: 25, heightMm: 15 });
  const ups = createUpsConfig({ columns: 2, columnSpacingMm: 0 });
  const doc = { ...cell, ups };
  const each = applyAcrossBorder(doc, 'separate', style);
  assert.ok(each.ups!.panels.every((p) => borders(p).length === 1));
  assert.equal(borders(composeUpsDocument(each).elements).length, 2);
  const whole = applyAcrossBorder(each, 'unified', style);
  assert.ok(whole.ups!.panels.every((p) => borders(p).length === 0));
  assert.ok(whole.ups!.sheetBorder);
  const composed = composeUpsDocument(whole);
  assert.equal(borders(composed.elements).length, 1);
  assert.ok(borders(composed.elements)[0].width > 45);
  assert.equal(hasAnyBorder(whole), true);
  assert.equal(hasAnyBorder(removeAcrossBorders(whole)), false);
});
