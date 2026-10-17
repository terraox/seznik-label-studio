import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_COPIES_PER_ROW,
  MAX_JOB_LABELS,
  columnEligibleForCopies,
  countChangedCopiesCells,
  guessCopiesColumnIndex,
  parseCopiesCell,
  planBulkPrint,
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
  assert.deepEqual(parseCopiesCell('0'), { copies: 0, changed: false });
  assert.deepEqual(parseCopiesCell('-3'), { copies: 0, changed: true });
  assert.deepEqual(parseCopiesCell('abc'), { copies: 1, changed: true });
  assert.deepEqual(parseCopiesCell('2.9'), { copies: 2, changed: false });
  assert.deepEqual(parseCopiesCell('2.0'), { copies: 2, changed: false });
  assert.deepEqual(parseCopiesCell('99'), { copies: 99, changed: false });
  assert.deepEqual(parseCopiesCell('100'), { copies: MAX_COPIES_PER_ROW, changed: true });
});

test('planBulkPrint groups 1, 3, 0, blank, 2 and multiplies in place', () => {
  const once = planBulkPrint(sheet, 1, 1);
  assert.deepEqual(once.rows, [
    { rowIndex: 0, copies: 1 },
    { rowIndex: 1, copies: 3 },
    { rowIndex: 3, copies: 1 },
    { rowIndex: 4, copies: 2 },
  ]);
  assert.equal(once.totalPhysical, 7);
  assert.equal(once.allZero, false);
  assert.equal(once.overCap, false);

  const twice = planBulkPrint(sheet, 1, 2);
  assert.deepEqual(
    twice.rows.map((row) => row.copies),
    [2, 6, 2, 4],
  );
  assert.equal(twice.totalPhysical, 14);
});

test('no copies column prints every row once', () => {
  const plan = planBulkPrint(sheet, null, 1);
  assert.equal(plan.rows.length, 5);
  assert.ok(plan.rows.every((row) => row.copies === 1));
  assert.equal(countChangedCopiesCells(sheet, null), 0);
});

test('all zeros block the job and a huge total hits the cap', () => {
  const zeros: ExcelSheet = {
    name: 'Z',
    columns: ['Qty'],
    rows: [['0'], ['0']],
  };
  const blocked = planBulkPrint(zeros, 0, 1);
  assert.deepEqual(blocked.rows, []);
  assert.equal(blocked.allZero, true);

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

test('changed cells are text, negative, and over the cap', () => {
  const dirty: ExcelSheet = {
    name: 'D',
    columns: ['Copies'],
    rows: [['1'], [''], ['abc'], ['-1'], ['100'], ['0']],
  };
  assert.equal(countChangedCopiesCells(dirty, 0), 3);
});
