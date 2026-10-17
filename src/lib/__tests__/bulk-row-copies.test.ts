import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_COPIES_PER_ROW,
  MAX_JOB_LABELS,
  columnEligibleForCopies,
  copiesChangeSummary,
  countChangedCopiesCells,
  guessCopiesColumnIndex,
  parseCopiesCell,
  planBulkPrint,
  resolveRowCopies,
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
  assert.deepEqual(parseCopiesCell(''), { copies: 1, changed: false });
  assert.deepEqual(parseCopiesCell('   '), { copies: 1, changed: false });
  assert.deepEqual(parseCopiesCell(undefined), { copies: 1, changed: false });
  assert.deepEqual(parseCopiesCell('1'), { copies: 1, changed: false });
  assert.deepEqual(parseCopiesCell('0'), { copies: 1, changed: true });
  assert.deepEqual(parseCopiesCell('-3'), { copies: 1, changed: true });
  assert.deepEqual(parseCopiesCell('abc'), { copies: 1, changed: true });
  assert.deepEqual(parseCopiesCell('2.9'), { copies: 2, changed: true });
  assert.deepEqual(parseCopiesCell('0.4'), { copies: 1, changed: true });
  assert.deepEqual(parseCopiesCell('99'), { copies: 99, changed: false });
  assert.deepEqual(parseCopiesCell('100'), { copies: MAX_COPIES_PER_ROW, changed: true });
});

test('planBulkPrint keeps every row and multiplies in place', () => {
  const once = planBulkPrint(sheet, 1, 1);
  assert.deepEqual(once.rows, [
    { rowIndex: 0, copies: 1 },
    { rowIndex: 1, copies: 3 },
    { rowIndex: 2, copies: 1 },
    { rowIndex: 3, copies: 1 },
    { rowIndex: 4, copies: 2 },
  ]);
  assert.equal(once.totalPhysical, 8);
  assert.equal(once.allZero, false);
  assert.equal(once.overCap, false);

  const twice = planBulkPrint(sheet, 1, 2);
  assert.deepEqual(
    twice.rows.map((row) => row.copies),
    [2, 6, 2, 2, 4],
  );
  assert.equal(twice.totalPhysical, 16);
});

test('an override wins, otherwise the cell, otherwise 1', () => {
  assert.equal(resolveRowCopies(sheet, 1, 1, { '1': 7 }), 7);
  assert.equal(resolveRowCopies(sheet, 1, 1, {}), 3);
  assert.equal(resolveRowCopies(sheet, 2, 1, { '2': 4 }), 4);
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
    { rowIndex: 0, copies: 1 },
    { rowIndex: 1, copies: 1 },
    { rowIndex: 2, copies: 1 },
    { rowIndex: 3, copies: 1 },
    { rowIndex: 4, copies: 1 },
  ]);
});

test('no copies column prints every row once', () => {
  const plan = planBulkPrint(sheet, null, 1);
  assert.equal(plan.rows.length, 5);
  assert.ok(plan.rows.every((row) => row.copies === 1));
  assert.equal(countChangedCopiesCells(sheet, null), 0);
});

test('zeros print once each and a huge total hits the cap', () => {
  const zeros: ExcelSheet = {
    name: 'Z',
    columns: ['Qty'],
    rows: [['0'], ['0']],
  };
  const printed = planBulkPrint(zeros, 0, 1);
  assert.deepEqual(printed.rows, [
    { rowIndex: 0, copies: 1 },
    { rowIndex: 1, copies: 1 },
  ]);
  assert.equal(printed.allZero, false);

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
  assert.equal(countChangedCopiesCells(sheet, 1), 1);
});

test('changed cells are text, negative, decimal, zero, and over the cap', () => {
  const dirty: ExcelSheet = {
    name: 'D',
    columns: ['Copies'],
    rows: [['1'], [''], ['abc'], ['-1'], ['100'], ['0'], ['2.9'], ['0.4']],
  };
  assert.equal(countChangedCopiesCells(dirty, 0), 6);
  assert.equal(
    copiesChangeSummary(dirty, 0),
    '6 values were changed to 1–99 (rows 3, 4, 5, 6, 7, 8)',
  );
});

test('more than ten adjusted rows stay a single summary', () => {
  const many: ExcelSheet = {
    name: 'Many',
    columns: ['Copies'],
    rows: Array.from({ length: 11 }, () => ['0']),
  };
  assert.equal(copiesChangeSummary(many, 0), '11 values were changed to 1–99');
});
