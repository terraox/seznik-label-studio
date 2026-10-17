import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_DEGREES_STATE,
  DEFAULT_ELEMENT_STATE,
} from '@/components/editor/types';
import { createLabelDocument, type LabelElement } from '@/lib/label-document';
import { applySerialOffset } from '@/lib/serial-content';
import { defaultSerialConfig } from '@/lib/serial/legacy';
import {
  collectSerialFields,
  hasSerialFields,
  linkCandidates,
  resolveDocumentForIndex,
  serialBatchCount,
  withFreshSerialIds,
} from '@/lib/serial/resolve-document';
import type { SerialConfig } from '@/lib/serial/types';
import { nonSerialFixture } from './regression-fixture';

const cfg = (over: Partial<SerialConfig>): SerialConfig => ({ ...defaultSerialConfig(), ...over });

function docWith(elements: unknown[]) {
  return createLabelDocument({ name: 'd', widthMm: 50, heightMm: 30, elements: elements as LabelElement[] });
}

test('a label without serial fields is returned untouched (same object)', () => {
  const fixture = nonSerialFixture();
  assert.equal(hasSerialFields(fixture), false);
  for (const i of [0, 1, 99]) assert.equal(resolveDocumentForIndex(fixture, i), fixture);
});

test('legacy Counter / Degrees elements are never touched by the new resolver', () => {
  const legacy = { ...DEFAULT_DEGREES_STATE, id: 'c', type: 'degrees', content: '015', degreesOffset: 1 };
  const doc = docWith([legacy]);
  assert.equal(hasSerialFields(doc), false);
  assert.equal(resolveDocumentForIndex(doc, 3), doc);
  // and its own rule still holds, off-by-one included (preview and print apply +1 step on page 0)
  assert.equal(applySerialOffset('015', 1, 1), '016');
});

test('new Serial elements show the typed start at index 0 (correct rule)', () => {
  const el = { ...DEFAULT_ELEMENT_STATE, id: 't', type: 'text', text: 'x', contentType: 'Degrees', serial: cfg({ id: 'f', start: '15', prefix: 'SN', minWidth: 3 }) };
  const doc = docWith([el]);
  const text = (i: number) => (resolveDocumentForIndex(doc, i).elements[0] as { text: string }).text;
  assert.equal(text(0), 'SN015');
  assert.equal(text(1), 'SN016');
  assert.equal(text(99), 'SN114');
  const resolved = resolveDocumentForIndex(doc, 2).elements[0] as { contentType: string };
  assert.equal(resolved.contentType, 'Manual');
  // the saved design is not modified
  assert.equal((doc.elements[0] as { contentType: string }).contentType, 'Degrees');
});

test('text and barcode share one value through a link, check digit included', () => {
  const barcode = {
    ...DEFAULT_BARCODE_STATE, id: 'b', type: 'barcode', encodeMode: 'EAN-13', contentType: 'Degrees',
    serial: cfg({ id: 'fb', start: '400638133393', checkDigit: 'symbology' }),
  };
  const text = { ...DEFAULT_ELEMENT_STATE, id: 't', type: 'text', contentType: 'Degrees', serial: cfg({ id: 'ft', linkTo: 'fb' }) };
  const doc = docWith([barcode, text]);
  const r = resolveDocumentForIndex(doc, 0).elements as { content?: string; text?: string }[];
  assert.equal(r[0].content, '4006381333931');
  assert.equal(r[1].text, '4006381333931');
  assert.deepEqual(linkCandidates(doc, 'ft').map((f) => f.config.id), ['fb']);
});

test('a field that cannot produce a value shows a marker, never a stale number', () => {
  const el = { ...DEFAULT_ELEMENT_STATE, id: 't', type: 'text', contentType: 'Degrees', serial: cfg({ id: 'f', start: '98', minWidth: 2, overflow: 'stop' }) };
  const doc = docWith([el]);
  assert.equal((resolveDocumentForIndex(doc, 1).elements[0] as { text: string }).text, '99');
  assert.equal((resolveDocumentForIndex(doc, 2).elements[0] as { text: string }).text, '#ERR');
});

test('batch count is clamped and copies get fresh field ids', () => {
  assert.equal(serialBatchCount({}), 10);
  assert.equal(serialBatchCount({ serialBatch: { v: 1, count: 99999 } }), 5000);
  assert.equal(serialBatchCount({ serialBatch: { v: 1, count: 0 } }), 1);
  const el = { ...DEFAULT_ELEMENT_STATE, id: 't', type: 'text', contentType: 'Degrees', serial: cfg({ id: 'same' }) } as unknown as LabelElement;
  const copy = withFreshSerialIds(el, () => 'fresh');
  assert.equal((copy as { serial: SerialConfig }).serial.id, 'fresh');
  assert.equal(collectSerialFields({ elements: [el, copy] }).length, 2);
});
