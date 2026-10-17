import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_COPIES_PER_ROW,
  MAX_JOB_LABELS,
  bulkSendList,
  collateChangesOrder,
  columnEligibleForCopies,
  copiesChangeSummary,
  countChangedCopiesCells,
  guessCopiesColumnIndex,
  parseCopiesCell,
  planBulkPrint,
  rememberRowRaster,
  resolveRowCopies,
  type BulkPrintRow,
} from '@/lib/bulk-row-copies';
import type { ExcelSheet } from '@/stores/data-store';

const sheet: ExcelSheet = {
  name: 'Sheet1',
  columns: ['Name', 'Copies', 'Notes'],
  rows: [
    ['Alpha', '1', 'a'],
    ['Bravo', '3', 'b'],
    ['Charlie', '0', 'c'],
    ['Delta', '', 'd'],
    ['Echo', '2', 'e'],
  ],
};

test('parseCopiesCell applies the count rules', () => {
  assert.deepEqual(parseCopiesCell(''), { copies: 0, changed: false });
  assert.deepEqual(parseCopiesCell('   '), { copies: 0, changed: false });
  assert.deepEqual(parseCopiesCell(undefined), { copies: 0, changed: false });
  assert.deepEqual(parseCopiesCell('1'), { copies: 1, changed: false });
  assert.deepEqual(parseCopiesCell('0'), { copies: 0, changed: false });
  assert.deepEqual(parseCopiesCell('-3'), { copies: 1, changed: true });
  assert.deepEqual(parseCopiesCell('abc'), { copies: 1, changed: true });
  assert.deepEqual(parseCopiesCell('2.9'), { copies: 2, changed: true });
  assert.deepEqual(parseCopiesCell('0.4'), { copies: 0, changed: true });
  assert.deepEqual(parseCopiesCell('99'), { copies: 99, changed: false });
  assert.deepEqual(parseCopiesCell('100'), { copies: MAX_COPIES_PER_ROW, changed: true });
});

test('planBulkPrint skips 0 and blank rows and multiplies in place', () => {
  const once = planBulkPrint(sheet, 1, 1);
  assert.deepEqual(once.rows, [
    { rowIndex: 0, copies: 1, perPass: 1 },
    { rowIndex: 1, copies: 3, perPass: 3 },
    { rowIndex: 4, copies: 2, perPass: 2 },
  ]);
  assert.equal(once.totalPhysical, 6);
  assert.equal(once.allZero, false);
  assert.equal(once.overCap, false);

  const twice = planBulkPrint(sheet, 1, 2);
  assert.deepEqual(
    twice.rows.map((row) => row.copies),
    [2, 6, 4],
  );
  assert.equal(twice.totalPhysical, 12);
});

test('an override wins, otherwise the cell, otherwise 1', () => {
  assert.equal(resolveRowCopies(sheet, 1, 1, { '1': 7 }), 7);
  assert.equal(resolveRowCopies(sheet, 1, 1, {}), 3);
  assert.equal(resolveRowCopies(sheet, 2, 1, { '2': 4 }), 4);
  assert.equal(resolveRowCopies(sheet, 2, 1, {}), 0);
  assert.equal(resolveRowCopies(sheet, 3, 1, {}), 0);
  assert.equal(resolveRowCopies(sheet, 0, null, null), 1);
  assert.equal(resolveRowCopies(sheet, 1, null, { nope: 5 }), 1);
  const multiplied = planBulkPrint(sheet, 1, 2, { '1': 4 });
  assert.equal(multiplied.rows[1]?.copies, 8);
});

test('grouped expand multiplies each resolved count', () => {
  const rows: ExcelSheet = {
    name: 'G',
    columns: ['Qty'],
    rows: [['1'], ['3'], ['1']],
  };
  const plan = planBulkPrint(rows, 0, 2);
  assert.deepEqual(
    plan.rows.map((row) => row.copies),
    [2, 6, 2],
  );
  assert.deepEqual(
    plan.rows.map((row) => row.rowIndex),
    [0, 1, 2],
  );
});

test('no column and no overrides with stepper 1 sends one copy of each row', () => {
  const five: ExcelSheet = {
    name: 'Five',
    columns: ['Name'],
    rows: [['a'], ['b'], ['c'], ['d'], ['e']],
  };
  const plan = planBulkPrint(five, null, 1, {});
  assert.deepEqual(plan.rows, [
    { rowIndex: 0, copies: 1, perPass: 1 },
    { rowIndex: 1, copies: 1, perPass: 1 },
    { rowIndex: 2, copies: 1, perPass: 1 },
    { rowIndex: 3, copies: 1, perPass: 1 },
    { rowIndex: 4, copies: 1, perPass: 1 },
  ]);
});

test('no copies column prints every row once', () => {
  const plan = planBulkPrint(sheet, null, 1);
  assert.equal(plan.rows.length, 5);
  assert.ok(plan.rows.every((row) => row.copies === 1));
  assert.equal(countChangedCopiesCells(sheet, null), 0);
});

test('zeros and blanks are skipped, all-zero flags allZero, a huge total hits the cap', () => {
  const zeros: ExcelSheet = {
    name: 'Z',
    columns: ['Qty'],
    rows: [['0'], ['']],
  };
  const skipped = planBulkPrint(zeros, 0, 1);
  assert.deepEqual(skipped.rows, []);
  assert.equal(skipped.allZero, true);

  const huge: ExcelSheet = {
    name: 'H',
    columns: ['Qty'],
    rows: Array.from({ length: 6 }, () => ['99']),
  };
  const over = planBulkPrint(huge, 0, 1);
  assert.equal(over.totalPhysical, 594);
  assert.ok(over.totalPhysical > MAX_JOB_LABELS);
  assert.equal(over.overCap, true);
});

test('only numeric columns are copies choices, and headers auto-guess among them', () => {
  assert.equal(columnEligibleForCopies(sheet, 0), false);
  assert.equal(columnEligibleForCopies(sheet, 1), true);
  assert.equal(guessCopiesColumnIndex(sheet), 1);

  const mixed: ExcelSheet = {
    name: 'M',
    columns: ['Qty', 'Count'],
    rows: [
      ['1', 'nope'],
      ['2', '4'],
    ],
  };
  assert.equal(columnEligibleForCopies(mixed, 0), true);
  assert.equal(columnEligibleForCopies(mixed, 1), false);
  assert.equal(guessCopiesColumnIndex(mixed), 0);
  assert.equal(countChangedCopiesCells(sheet, 1), 0);
});

test('changed cells are text, negative, decimal, and over the cap; blank and 0 are skips', () => {
  const dirty: ExcelSheet = {
    name: 'D',
    columns: ['Copies'],
    rows: [['1'], [''], ['abc'], ['-1'], ['100'], ['0'], ['2.9'], ['0.4']],
  };
  assert.equal(countChangedCopiesCells(dirty, 0), 5);
  assert.equal(
    copiesChangeSummary(dirty, 0),
    '5 values were changed to 0–99 (rows 3, 4, 5, 7, 8)',
  );
});

test('more than ten adjusted rows stay a single summary', () => {
  const many: ExcelSheet = {
    name: 'Many',
    columns: ['Copies'],
    rows: Array.from({ length: 11 }, () => ['abc']),
  };
  assert.equal(copiesChangeSummary(many, 0), '11 values were changed to 0–99');
});

function rowsOf(...copies: number[]): BulkPrintRow[] {
  return copies.map((count, rowIndex) => ({ rowIndex, copies: count, perPass: count }));
}

function paperOrder(rows: BulkPrintRow[], collate: boolean, multiply = 1): number[] {
  const order: number[] = [];
  for (const send of bulkSendList(rows, collate, multiply)) {
    for (let copy = 0; copy < send.copies; copy++) order.push(send.rowIndex);
  }
  return order;
}

test('repeat 1 prints each row once in order either way', () => {
  const rows = rowsOf(3, 1, 2);
  assert.equal(collateChangesOrder(rows, 1), false);
  assert.deepEqual(paperOrder(rows, false), [0, 0, 0, 1, 2, 2]);
  assert.deepEqual(paperOrder(rows, true), [0, 0, 0, 1, 2, 2]);
});

test('uncollated repeats each row together, row by row from the first', () => {
  const ones: ExcelSheet = { name: 'Ones', columns: ['Qty'], rows: [['1'], ['1'], ['1']] };
  const plan = planBulkPrint(ones, 0, 2);
  assert.equal(plan.multiply, 2);
  assert.deepEqual(
    plan.rows.map((row) => row.copies),
    [2, 2, 2],
  );
  assert.equal(collateChangesOrder(plan.rows, plan.multiply), true);
  assert.deepEqual(paperOrder(plan.rows, false, plan.multiply), [0, 0, 1, 1, 2, 2]);
});

test('collated prints the whole job once, then again', () => {
  const ones: ExcelSheet = { name: 'Ones', columns: ['Qty'], rows: [['1'], ['1'], ['1']] };
  const plan = planBulkPrint(ones, 0, 2);
  const sends = bulkSendList(plan.rows, true, plan.multiply);
  assert.deepEqual(
    sends.map((send) => send.rowIndex),
    [0, 1, 2, 0, 1, 2],
  );
  assert.deepEqual(
    sends.map((send) => send.round),
    [1, 1, 1, 2, 2, 2],
  );
  assert.equal(plan.totalPhysical, 6);
});

test('row counts stay grouped inside each pass', () => {
  const sheetCounts: ExcelSheet = {
    name: 'C',
    columns: ['Qty'],
    rows: [['3'], ['1'], ['2']],
  };
  const plan = planBulkPrint(sheetCounts, 0, 2);
  assert.deepEqual(paperOrder(plan.rows, false, plan.multiply), [0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual(paperOrder(plan.rows, true, plan.multiply), [0, 0, 0, 1, 2, 2, 0, 0, 0, 1, 2, 2]);
  assert.equal(plan.totalPhysical, 12);
});

test('a zero-copy row is left out of both orders', () => {
  const sheetCounts: ExcelSheet = { name: 'Z', columns: ['Qty'], rows: [['0'], ['3'], ['1']] };
  const plan = planBulkPrint(sheetCounts, 0, 2);
  assert.deepEqual(paperOrder(plan.rows, false, plan.multiply), [1, 1, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual(paperOrder(plan.rows, true, plan.multiply), [1, 1, 1, 2, 1, 1, 1, 2]);
  assert.equal(collateChangesOrder(plan.rows, plan.multiply), true);
});

test('building a send list does not change cached row rasters', () => {
  const rows = rowsOf(3, 1, 2);
  const rasters = new Map<number, Uint8Array>([
    [0, Uint8Array.from([1, 2, 3])],
    [1, Uint8Array.from([4, 5])],
    [2, Uint8Array.from([6])],
  ]);
  const before = [...rasters.entries()].map(([key, bytes]) => [key, Array.from(bytes)] as const);
  bulkSendList(rows, false, 2);
  bulkSendList(rows, true, 2);
  for (const [key, bytes] of before) {
    assert.deepEqual(Array.from(rasters.get(key)!), bytes);
  }

  const cache = new Map<number, Uint8Array>();
  let calls = 0;
  for (const send of bulkSendList(rows, true, 2)) {
    const bitmap = rememberRowRaster(cache, send.rowIndex, () => {
      calls += 1;
      return rasters.get(send.rowIndex)!;
    });
    assert.equal(bitmap, rasters.get(send.rowIndex));
    assert.deepEqual(Array.from(bitmap), before.find(([key]) => key === send.rowIndex)?.[1]);
  }
  assert.equal(calls, 3);
  assert.equal(cache.size, 3);
});
