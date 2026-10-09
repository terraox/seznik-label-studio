import assert from 'node:assert/strict';
import test from 'node:test';

import { compactExcelSheet, isExcelColumnEmpty } from '@/lib/excel-rows';
import { defaultBulkColumnMappings } from '@/lib/bulk-labels';

test('compactExcelSheet drops trailing unused columns', () => {
  const compacted = compactExcelSheet({
    name: 'Sheet1',
    columns: ['Name', 'SKU', 'Column 3', 'Column 4'],
    rows: [
      ['Widget', '123', '', ''],
      ['Gadget', '456', '', ''],
    ],
  });
  assert.deepEqual(compacted.columns, ['Name', 'SKU']);
  assert.equal(compacted.rows.length, 2);
});

test('isExcelColumnEmpty ignores generic Column N headers with no data', () => {
  const sheet = {
    name: 'S',
    columns: ['Title', 'Column 2'],
    rows: [['Hello', '']],
  };
  assert.equal(isExcelColumnEmpty(sheet, 0), false);
  assert.equal(isExcelColumnEmpty(sheet, 1), true);
});

test('defaultBulkColumnMappings excludes empty columns', () => {
  const sheet = {
    name: 'S',
    columns: ['Name', 'Barcode', 'Column 3'],
    rows: [['A', '111', '']],
  };
  const mappings = defaultBulkColumnMappings(sheet);
  assert.equal(mappings.filter((m) => m.include).length, 2);
  assert.equal(mappings[2]?.include, false);
});
