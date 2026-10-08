import assert from 'node:assert/strict';
import test from 'node:test';

import { extensionFromMime, extensionFromName } from '@/lib/file-import/mime-presets';
import { splitSheetRows } from '@/lib/excel-rows';

const grid = [
  ['Name', 'SKU', ''],
  ['Ada', '100', ''],
  ['', '', ''],
  ['Grace', '200', ''],
  ['Lin', '300', ''],
];

test('default import treats row 1 as names and starts data at row 2', () => {
  const sheet = splitSheetRows(grid);
  assert.deepEqual(sheet.columns, ['Name', 'SKU', 'Column 3']);
  assert.deepEqual(sheet.rows, [
    ['Ada', '100', ''],
    ['Grace', '200', ''],
    ['Lin', '300', ''],
  ]);
});

test('a later start row skips data rows the user does not want', () => {
  const sheet = splitSheetRows(grid, { hasHeaderRow: true, dataStartRow: 4 });
  assert.deepEqual(sheet.columns, ['Name', 'SKU', 'Column 3']);
  assert.deepEqual(sheet.rows, [
    ['Grace', '200', ''],
    ['Lin', '300', ''],
  ]);
});

test('without column names, data can start at row 1 and columns are generated', () => {
  const sheet = splitSheetRows(grid, { hasHeaderRow: false, dataStartRow: 1 });
  assert.deepEqual(sheet.columns, ['Column 1', 'Column 2', 'Column 3']);
  assert.equal(sheet.rows[0][0], 'Name');
  assert.equal(sheet.rows.length, 4);
});

test('without column names, the default start row is 1', () => {
  const sheet = splitSheetRows(grid, { hasHeaderRow: false });
  assert.equal(sheet.rows[0][0], 'Name');
});

test('start row 1 is rejected when the first row is column names', () => {
  assert.throws(
    () => splitSheetRows(grid, { hasHeaderRow: true, dataStartRow: 1 }),
    /2 or later/,
  );
});

test('a start row past the sheet end is rejected', () => {
  assert.throws(() => splitSheetRows(grid, { hasHeaderRow: true, dataStartRow: 9 }), /past the end/);
});

test('an empty sheet stays empty instead of throwing', () => {
  assert.deepEqual(splitSheetRows([]), { columns: [], rows: [] });
});

test('drive files without an extension still get one from the mime type', () => {
  assert.equal(extensionFromName('Quarterly.XLSX'), 'xlsx');
  assert.equal(extensionFromName('no-extension'), '');
  assert.equal(extensionFromMime('application/pdf'), 'pdf');
  assert.equal(extensionFromMime('font/otf; charset=binary'), 'otf');
});
