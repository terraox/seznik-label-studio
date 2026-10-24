import test from 'node:test';
import assert from 'node:assert/strict';

import {
  alignGroupBounds,
  alignMembersToEachOther,
  distributeMembers,
  clearSelection,
  reduceMultipleModeToggle,
  reduceTapSelect,
  selectionFromIds,
  unionBounds,
} from '../selection';
import type { LabelElement } from '@/lib/label-document';

test('reduceTapSelect single mode replaces selection', () => {
  const next = reduceTapSelect({
    id: 'b',
    multipleMode: false,
    current: { ids: ['a'], primaryId: 'a' },
  });
  assert.deepEqual(next, { ids: ['b'], primaryId: 'b' });
});

test('reduceTapSelect multiple mode adds unselected element', () => {
  const next = reduceTapSelect({
    id: 'b',
    multipleMode: true,
    current: { ids: ['a'], primaryId: 'a' },
  });
  assert.deepEqual(next, { ids: ['a', 'b'], primaryId: 'b' });
});

test('reduceTapSelect multiple mode removes already-selected element', () => {
  const next = reduceTapSelect({
    id: 'a',
    multipleMode: true,
    current: { ids: ['a', 'b'], primaryId: 'b' },
  });
  assert.deepEqual(next, { ids: ['b'], primaryId: 'b' });
});

test('reduceTapSelect multiple mode removing last member clears selection', () => {
  const next = reduceTapSelect({
    id: 'a',
    multipleMode: true,
    current: { ids: ['a'], primaryId: 'a' },
  });
  assert.deepEqual(next, { ids: [], primaryId: null });
});

test('reduceTapSelect multiple mode removing primary promotes remaining last id', () => {
  const next = reduceTapSelect({
    id: 'b',
    multipleMode: true,
    current: { ids: ['a', 'b', 'c'], primaryId: 'b' },
  });
  assert.deepEqual(next, { ids: ['a', 'c'], primaryId: 'c' });
});

test('clearSelection resets ids and primary', () => {
  assert.deepEqual(clearSelection(), { ids: [], primaryId: null });
});

test('reduceMultipleModeToggle ON carries a pre-existing single selection', () => {
  const current = { ids: ['a'], primaryId: 'a' };
  assert.deepEqual(reduceMultipleModeToggle(true, current), current);
});

test('reduceMultipleModeToggle OFF clears the whole selection', () => {
  assert.deepEqual(
    reduceMultipleModeToggle(false, { ids: ['a', 'b'], primaryId: 'b' }),
    { ids: [], primaryId: null },
  );
});

test('selectionFromIds picks last id as primary when omitted', () => {
  assert.deepEqual(selectionFromIds(['a', 'b']), { ids: ['a', 'b'], primaryId: 'b' });
});

test('unionBounds spans all selected element boxes', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 3, top: 3, width: 12, height: 5 } as LabelElement,
    { id: 'b', type: 'qrcode', left: 5, top: 12, width: 8, height: 8 } as LabelElement,
  ];
  const bounds = unionBounds(elements);
  assert.equal(bounds.left, 3);
  assert.equal(bounds.top, 3);
  assert.equal(bounds.width, 12);
  assert.equal(bounds.height, 17);
});

test('alignGroupBounds moves all members by the same delta', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 3, top: 3, width: 12, height: 5 } as LabelElement,
    { id: 'b', type: 'qrcode', left: 5, top: 12, width: 8, height: 8 } as LabelElement,
  ];
  const patches = alignGroupBounds(elements, ['a', 'b'], { widthMm: 40, heightMm: 30 }, 'left');
  assert.deepEqual(patches.get('a'), { left: 0, top: 3 });
  assert.deepEqual(patches.get('b'), { left: 2, top: 12 });
});

test('alignMembersToEachOther aligns left edges to the leftmost', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 3, top: 3, width: 12, height: 5, lockMovement: false } as LabelElement,
    { id: 'b', type: 'qrcode', left: 8, top: 12, width: 8, height: 8, lockMovement: false } as LabelElement,
  ];
  const patches = alignMembersToEachOther(elements, ['a', 'b'], 'left');
  assert.deepEqual(patches.get('a'), { left: 3, top: 3 });
  assert.deepEqual(patches.get('b'), { left: 3, top: 12 });
});

test('alignMembersToEachOther no-ops with a single selection', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 3, top: 3, width: 12, height: 5, lockMovement: false } as LabelElement,
  ];
  const patches = alignMembersToEachOther(elements, ['a'], 'left');
  assert.equal(patches.size, 0);
});

test('distributeMembers spaces intermediate centers evenly on the horizontal axis', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 0, top: 0, width: 4, height: 4, lockMovement: false } as LabelElement,
    { id: 'b', type: 'qrcode', left: 5, top: 0, width: 4, height: 4, lockMovement: false } as LabelElement,
    { id: 'c', type: 'text', left: 20, top: 0, width: 4, height: 4, lockMovement: false, text: '' } as LabelElement,
  ];
  const patches = distributeMembers(elements, ['a', 'b', 'c'], 'h');
  // Centers: a=2, c=22 → step 10 → b center should be 12 → left 10
  assert.deepEqual(patches.get('b'), { left: 10, top: 0 });
});
