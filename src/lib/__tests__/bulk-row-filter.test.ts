import test from 'node:test';
import assert from 'node:assert/strict';

import { planBulkPrint } from '../bulk-row-copies';
import { parseRowText, selectedRowIndexes, type RowSelection } from '../bulk-row-filter';

const sheet = {
  name: 's',
  columns: ['a'],
  rows: Array.from({ length: 10 }, (_, i) => [String(i + 1)]),
} as Parameters<typeof planBulkPrint>[0];
const rowNumbers = (sel: RowSelection) => [...(selectedRowIndexes(sel, 10) ?? [])].map((i) => i + 1);

test('all rows means no filter', () => {
  assert.equal(selectedRowIndexes({ mode: 'all' }, 10), null);
});

test('odd and even use 1-based row numbers', () => {
  assert.deepEqual(rowNumbers({ mode: 'odd' }), [1, 3, 5, 7, 9]);
  assert.deepEqual(rowNumbers({ mode: 'even' }), [2, 4, 6, 8, 10]);
});

test('custom: singles, ranges and open ends', () => {
  assert.deepEqual(rowNumbers({ mode: 'custom', text: '1-3, 5, 9-' }), [1, 2, 3, 5, 9, 10]);
  assert.deepEqual(rowNumbers({ mode: 'custom', text: '8-99' }), [8, 9, 10]);
});

test('custom: bad text is rejected', () => {
  assert.ok(parseRowText('abc', 10).error);
  assert.ok(parseRowText('5-2', 10).error);
  assert.ok(parseRowText('0', 10).error);
});

test('plan skips unselected rows', () => {
  const plan = planBulkPrint(sheet, null, 1, null, { mode: 'even' });
  assert.deepEqual(plan.rows.map((r) => r.rowIndex + 1), [2, 4, 6, 8, 10]);
  assert.equal(plan.totalPhysical, 5);
});
